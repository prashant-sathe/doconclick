// /api/geocode/* (BUG-TRACKER): signed-in users only, a per-user rate limit,
// and a shared cache in front of Nominatim (whose policy allows ≤1 request/s
// for the whole app) — the same search in another case/spacing, or a GPS fix
// a few metres away, doesn't go upstream again, and upstream calls are
// spaced out. Upstream calls are counted from the dev server log
// ("geocode upstream: …" in /tmp/doconclick-dev.log). Makes a handful of real
// Nominatim requests. Throwaway users only.
//
//   npm run test:geocode
import "dotenv/config";
import fs from "fs";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const LOG = process.env.DEV_LOG ?? "/tmp/doconclick-dev.log";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type U = { id: string; name: string; role: string; mobile: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function get(as: U | null, path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: as ? { Cookie: cookieFor(as) } : {} });
  return { status: res.status, json: (await res.json().catch(() => null)) as unknown };
}
const upstreamCalls = (kind: string) => (fs.readFileSync(LOG, "utf8").match(new RegExp(`geocode upstream: /${kind}`, "g")) ?? []).length;

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (role: string) => {
    const u = await prisma.user.create({ data: { name: `Geo ${role}`, mobile: `6${stamp}${n++}`, role, termsAcceptedAt: new Date() } as never });
    ids.push(u.id);
    return u as unknown as U;
  };
  const patient = await mk("PATIENT");
  const nurse = await mk("NURSE");
  const hammer = await mk("PATIENT");
  const other = await mk("PATIENT");

  try {
    // ── Sign-in ──
    check("signed out: search → 401", (await get(null, "/api/geocode/search?q=shivajinagar")).status === 401, "ok");
    check("signed out: reverse → 401", (await get(null, "/api/geocode/reverse?lat=18.53&lon=73.85")).status === 401, "ok");

    // ── Input ──
    for (const q of ["lat=abc&lon=73.8", "lat=91&lon=73.8", "lat=18.5&lon=181", "lat=18.5"]) {
      const r = await get(patient, `/api/geocode/reverse?${q}`);
      check(`reverse ?${q} → 400`, r.status === 400, `${r.status}`);
    }
    const short = await get(patient, "/api/geocode/search?q=ab");
    check("search under 3 characters → [] without a lookup", short.status === 200 && Array.isArray(short.json) && (short.json as unknown[]).length === 0, JSON.stringify(short.json));

    // ── Search cache ──
    const q = `Shivajinagar Pune ${stamp.slice(-3)}`; // unseen by this server, so the first call is a miss
    let before = upstreamCalls("search");
    const first = await get(patient, `/api/geocode/search?q=${encodeURIComponent(q)}`);
    const afterFirst = upstreamCalls("search");
    check("search: first lookup goes upstream once", first.status === 200 && Array.isArray(first.json) && afterFirst - before === 1, `${first.status} +${afterFirst - before}`);
    const again = await get(nurse, `/api/geocode/search?q=${encodeURIComponent(`  ${q.toUpperCase()}   `.replace(" ", "   "))}`);
    check("…same text in another case/spacing, another user → cached, same answer", again.status === 200 && upstreamCalls("search") === afterFirst && JSON.stringify(again.json) === JSON.stringify(first.json), `+${upstreamCalls("search") - afterFirst}`);

    // ── Reverse cache ──
    before = upstreamCalls("reverse");
    // A spot this server hasn't looked up, and a second fix ~2 m away inside
    // the same 4-decimal cell (…x10 and …x30 both round to …x).
    const cell = `18.5${stamp.slice(-3)}`;
    const lat = Number(`${cell}10`);
    const r1 = await get(patient, `/api/geocode/reverse?lat=${cell}10&lon=73.856700`);
    const r2 = await get(nurse, `/api/geocode/reverse?lat=${cell}30&lon=73.856720`);
    const lbl = (r1.json as { label?: string | null })?.label;
    check("reverse: a real address comes back", r1.status === 200 && typeof lbl === "string" && lbl.length > 0, String(lbl).slice(0, 60));
    check("…a fix ~1 m away is the same cache entry (one upstream call for both)", upstreamCalls("reverse") - before === 1 && JSON.stringify(r1.json) === JSON.stringify(r2.json), `+${upstreamCalls("reverse") - before}`);

    // ── Upstream spacing ──
    const t0 = Date.now();
    const pair = await Promise.all([
      get(patient, `/api/geocode/reverse?lat=${(lat + 0.01).toFixed(4)}&lon=73.8567`),
      get(nurse, `/api/geocode/reverse?lat=${(lat + 0.02).toFixed(4)}&lon=73.8567`),
    ]);
    const took = Date.now() - t0;
    check("two uncached lookups at once are spaced ≥1s apart upstream", pair.every((p) => p.status === 200) && took >= 1000, `${took} ms`);

    // ── Rate limit (counted before the cache, so this doesn't hit Nominatim) ──
    let lastOk = 0, firstBlocked = 0;
    for (let i = 1; i <= 22; i++) {
      const r = await get(hammer, `/api/geocode/reverse?lat=${lat.toFixed(6)}&lon=73.856700`);
      if (r.status === 200) lastOk = i;
      else if (r.status === 429 && !firstBlocked) firstBlocked = i;
    }
    check("reverse: 20 a minute per user, the 21st → 429", lastOk === 20 && firstBlocked === 21, `last ok ${lastOk}, first 429 ${firstBlocked}`);
    const msg = await get(hammer, `/api/geocode/reverse?lat=${lat.toFixed(6)}&lon=73.856700`);
    check("…with a readable message", msg.status === 429 && /Too many/.test(String((msg.json as { error?: string })?.error)), String((msg.json as { error?: string })?.error));
    check("…another user isn't affected", (await get(other, `/api/geocode/reverse?lat=${lat.toFixed(6)}&lon=73.856700`)).status === 200, "ok");
    let searchBlocked = 0;
    for (let i = 1; i <= 41; i++) {
      if ((await get(hammer, `/api/geocode/search?q=${encodeURIComponent(q)}`)).status === 429) { searchBlocked = i; break; }
    }
    check("search: 40 a minute per user, the 41st → 429", searchBlocked === 41, `first 429 at ${searchBlocked}`);
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
