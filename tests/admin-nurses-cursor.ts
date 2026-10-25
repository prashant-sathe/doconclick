// P3-30: GET /api/admin/nurses with an unknown ?cursor= answers 400 (was a
// Prisma 500); a real cursor still pages; a non-nurse id is also rejected.
// Needs a dev server (BASE_URL, default http://localhost:3000) and the DB in .env.
//
//   BASE_URL=http://localhost:3100 npm run test:admin-nurses-cursor
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

async function main() {
  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  const mk = async (i: number, data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `4${stamp}${i}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u;
  };
  try {
    const admin = await mk(0, { name: "Cursor Admin", role: "ADMIN" });
    const nurse = await mk(1, { name: "Cursor Nurse", role: "NURSE" });
    const patient = await mk(2, { name: "Cursor Patient", role: "PATIENT" });
    const cookie = `doconclick_token=${jwt.sign({ id: admin.id, name: admin.name, role: "ADMIN", mobile: admin.mobile, tv: 0 }, SECRET)}`;
    const get = async (qs: string) => {
      const r = await fetch(`${BASE}/api/admin/nurses${qs}`, { headers: { Cookie: cookie } });
      return { status: r.status, body: await r.json().catch(() => null) };
    };

    let r = await get("?take=5&cursor=does-not-exist");
    check("unknown cursor → 400", r.status === 400, `${r.status} ${JSON.stringify(r.body)}`);
    r = await get(`?take=5&cursor=${patient.id}`);
    check("cursor of a non-nurse → 400", r.status === 400, String(r.status));
    r = await get(`?take=5&cursor=${nurse.id}`);
    check("real nurse cursor → 200 array", r.status === 200 && Array.isArray(r.body), String(r.status));
    r = await get("?take=2");
    check("no cursor still pages", r.status === 200 && Array.isArray(r.body) && r.body.length <= 2, String(r.status));
    r = await get("");
    check("no params → full array", r.status === 200 && Array.isArray(r.body), String(r.status));
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
  if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
  console.log("\nAll passed");
}
main().catch((e) => { console.error(e); process.exit(1); });
