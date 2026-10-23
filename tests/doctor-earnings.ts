// P2-30: GET /api/doctor/earnings — lean totals (aggregate, IST months), this
// week's per-day figures and a paged transaction list; only the doctor's own
// completed + paid visits count. Against a live dev server and the DB in .env,
// throwaway users only.
//
//   npm run test:doctor-earnings   (BASE_URL defaults to http://localhost:3000)
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { istMonthKey, shiftMonthKey, istStartOfMonth } from "../src/lib/istDate";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();
const DAY = 864e5;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}
type Tx = { id: string; scheduledAt: string };
type E = { total: number; thisMonth: number; lastMonth: number; days: unknown[]; transactions: Tx[]; hasMore: boolean };
type U = { id: string; name: string; role: string; mobile: string };
const cookieFor = (u: U) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}`;
async function get(as: U | null, path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: as ? { Cookie: cookieFor(as) } : {} });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as E };
}

async function main() {
  const stamp = String(Date.now()).slice(-7);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `7${stamp}${String(n++).padStart(2, "0")}`, termsAcceptedAt: new Date(), ...data } as never });
    ids.push(u.id);
    return u as unknown as U;
  };
  const profile = (extra: Record<string, unknown> = {}) => ({ create: { status: "APPROVED", isVerified: true, registrationFeePaid: true, trialEndsAt: new Date(Date.now() + 30 * DAY), ...extra } });
  const doctor = await mk({ name: "Earn Doctor", role: "DOCTOR", doctorProfile: profile() });
  const other = await mk({ name: "Earn Other", role: "DOCTOR", doctorProfile: profile() });
  const expired = await mk({ name: "Earn Expired", role: "DOCTOR", doctorProfile: profile({ trialEndsAt: new Date(Date.now() - DAY) }) });
  const patient = await mk({ name: "Earn Patient", role: "PATIENT", password: "x", patientProfile: { create: { age: 30, gender: "Male" } } });

  const thisKey = istMonthKey(new Date());
  const lastKey = shiftMonthKey(thisKey, -1);
  // Mid-month instants well inside each IST month.
  const inThis = new Date(istStartOfMonth(thisKey).getTime() + 1 * 3600e3);
  const inLast = new Date(istStartOfMonth(lastKey).getTime() + 5 * DAY);
  const visit = (doctorId: string, scheduledAt: Date, extra: Record<string, unknown> = {}) =>
    prisma.appointment.create({ data: { patientId: patient.id, doctorId, symptoms: "EARN-TEST", consultType: "CLINIC", status: "COMPLETED", paymentStatus: "PAID", paymentMethod: "ONLINE", amount: 500, platformFee: 50.1, scheduledAt, ...extra } });

  try {
    await visit(doctor.id, inThis);
    await visit(doctor.id, inThis, { amount: 300, platformFee: 30.05 });
    await visit(doctor.id, inLast);
    for (let i = 0; i < 10; i++) await visit(doctor.id, new Date(inLast.getTime() - (i + 1) * DAY));
    // Must not count: unpaid, cancelled, someone else's.
    await visit(doctor.id, inThis, { paymentStatus: "PENDING" });
    await visit(doctor.id, inThis, { status: "CANCELLED" });
    await visit(other.id, inThis, { amount: 9999 });

    let r = await get(null, "/api/doctor/earnings");
    check("no login → 401", r.status === 401, `${r.status}`);
    r = await get(patient, "/api/doctor/earnings");
    check("patient → 403", r.status === 403, `${r.status}`);
    r = await get(expired, "/api/doctor/earnings");
    check("doctor out of plan → 403", r.status === 403, `${r.status}`);

    r = await get(doctor, "/api/doctor/earnings");
    check("doctor → 200", r.status === 200, `${r.status}`);
    // Net = amount − fee, summed exactly in paise.
    check("total counts only own completed+paid visits (13 visits)", Math.abs(r.json.total - (449.9 + 269.95 + 449.9 * 11)) < 0.005, `${r.json.total}`);
    check("this month = 449.90 + 269.95", Math.abs(r.json.thisMonth - 719.85) < 0.005, `${r.json.thisMonth}`);
    check("last month has the earlier visits", r.json.lastMonth > 0, `${r.json.lastMonth}`);
    check("7 week days, Monday first", Array.isArray(r.json.days) && r.json.days.length === 7, `${r.json.days?.length}`);
    check("first page = 10 rows + hasMore", r.json.transactions?.length === 10 && r.json.hasMore === true, `${r.json.transactions?.length} ${r.json.hasMore}`);
    const row = r.json.transactions?.[0] ?? {};
    check("rows are lean (no vitals/medicines/gateway ids)", !("vitals" in row) && !("medicines" in row) && !("cashfreeOrderId" in row) && "patient" in row, Object.keys(row).join(","));
    check("newest first", new Date(r.json.transactions[0].scheduledAt) >= new Date(r.json.transactions[9].scheduledAt), "sorted");

    const p2 = await get(doctor, "/api/doctor/earnings?skip=10");
    check("second page = remaining 3, no more", p2.json.transactions?.length === 3 && p2.json.hasMore === false, `${p2.json.transactions?.length} ${p2.json.hasMore}`);
    const seen = new Set([...r.json.transactions, ...p2.json.transactions].map((x) => x.id));
    check("pages don't overlap", seen.size === 13, `${seen.size}`);
    const bad = await get(doctor, "/api/doctor/earnings?skip=-5");
    check("bad skip falls back to the first page", bad.status === 200 && bad.json.transactions?.length === 10, `${bad.status}`);
    const none = await get(other, "/api/doctor/earnings");
    check("other doctor sees only own", Math.abs(none.json.total - (9999 - 50.1)) < 0.005 && none.json.transactions?.length === 1, `${none.json.total}`);
  } finally {
    await prisma.appointment.deleteMany({ where: { symptoms: "EARN-TEST", patientId: patient.id } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  }
  console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
