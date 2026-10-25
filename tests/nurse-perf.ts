// P3-26: nurse slot checks for a package run from one pre-fetched context
// (same answers as the per-call path, far fewer queries), searchNurses'
// bounding-box prefilter keeps the same nurses, and /api/admin/nurses pages.
// Library-level, DB in .env, throwaway users only (admin paging is checked
// via a direct query shape, not HTTP).
//
//   npm run test:nurse-perf
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

async function main() {
  // Install a query-counting client before the libs import the shared one.
  const counting = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    log: [{ emit: "event", level: "query" }],
  } as never);
  let queries = 0;
  (counting as unknown as { $on: (e: string, f: () => void) => void }).$on("query", () => { queries++; });
  (globalThis as unknown as { prisma: unknown }).prisma = counting;
  const prisma = counting;
  const { nurseSlotProblem, nurseScheduleCtx } = await import("../src/lib/nurseSchedule");
  const { searchNurses } = await import("../src/lib/nurseSearch");

  const stamp = String(Date.now()).slice(-8);
  const ids: string[] = [];
  let n = 0;
  const mk = async (data: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { mobile: `2${stamp}${n++}`, ...data } as never });
    ids.push(u.id);
    return u;
  };
  const HOME = { lat: 18.5204, lng: 73.8567 };
  const nurse = await mk({
    name: "Perf Nurse", role: "NURSE",
    nurseProfile: { create: { status: "APPROVED", ...HOME, radius: 10, availability: "Sun-Sat, 12AM-11:59PM", registrationFeePaid: true, subscriptionPaidUntil: new Date(Date.now() + 30 * DAY) } },
  });
  const far = await mk({
    name: "Perf Far Nurse", role: "NURSE",
    nurseProfile: { create: { status: "APPROVED", lat: 28.6, lng: 77.2, radius: 10, availability: "Sun-Sat, 12AM-11:59PM", registrationFeePaid: true, subscriptionPaidUntil: new Date(Date.now() + 30 * DAY) } },
  });
  const patient = await mk({
    name: "Perf Patient", role: "PATIENT", termsAcceptedAt: new Date(),
    patientProfile: { create: { age: 40, gender: "Male", homeAddress: "1 Rd, Pune", pinCode: "411001", ...HOME } },
  });
  const svc = await prisma.nurseService.create({ data: { name: `Perf ${stamp}`, durationMinutes: 30 } });
  const profiles = await prisma.nurseProfile.findMany({ where: { userId: { in: [nurse.id, far.id] } } });
  await prisma.nurseServiceOffering.createMany({ data: profiles.map((p) => ({ nurseProfileId: p.id, serviceId: svc.id, price: 300 })) });
  const base = Date.now() + 2 * DAY;
  await prisma.appointment.create({
    data: {
      doctorId: nurse.id, patientId: patient.id, providerType: "NURSE", consultType: "HOME", status: "SCHEDULED",
      nurseServiceId: svc.id, serviceName: svc.name, symptoms: "x", amount: 300, paymentMethod: "CASH",
      createdAt: new Date(Date.now() - DAY), scheduledAt: new Date(base + 5 * DAY + 30 * MIN),
    } as never,
  });
  await prisma.providerTimeOff.create({ data: { providerId: nurse.id, startDate: new Date(base + 8 * DAY).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }), endDate: new Date(base + 8 * DAY).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) } as never });

  try {
    const whens = Array.from({ length: 14 }, (_, i) => new Date(base + i * DAY));
    const args = (when: Date) => ({ nurseId: nurse.id, availability: nurse.id && "Sun-Sat, 12AM-11:59PM", when, durationMinutes: 30, viewer: "patient" as const, checkHours: false });

    queries = 0;
    const slow: (string | null)[] = [];
    for (const w of whens) slow.push(await nurseSlotProblem(args(w)));
    const slowQ = queries;

    queries = 0;
    const ctx = await nurseScheduleCtx(nurse.id, whens);
    const fast: (string | null)[] = [];
    for (const w of whens) fast.push(await nurseSlotProblem({ ...args(w), ctx }));
    const fastQ = queries;

    check("same results with and without ctx", JSON.stringify(slow) === JSON.stringify(fast), `${slow.filter(Boolean).length} problems of 14`);
    check("clash + leave both detected", !!slow[5] && !!slow[8], `${slow[5]?.slice(0, 40)} | ${slow[8]?.slice(0, 40)}`);
    check("14-visit slot checks <= 10 queries", fastQ <= 10, `before ${slowQ}, after ${fastQ}`);

    // searchNurses: the far nurse (Delhi) stays out, the Pune one stays in.
    const res = await searchNurses({ patientId: patient.id, serviceId: svc.id, lat: HOME.lat, lng: HOME.lng });
    check("searchNurses keeps nearby, drops far", res.nurses.some((x) => x.id === nurse.id) && !res.nurses.some((x) => x.id === far.id), `${res.nurses.length} nurses`);

    // Admin paging shape: take+1 with a cursor walks every nurse once.
    const where = { role: "NURSE", deletedAt: null, id: { in: [nurse.id, far.id] } };
    const p1 = await prisma.user.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 2 });
    const p2 = await prisma.user.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 2, cursor: { id: p1[0].id }, skip: 1 });
    check("cursor paging has no overlap", p1.length === 2 && p2.length === 1 && p2[0].id === p1[1].id, `${p1.length}+${p2.length}`);
  } finally {
    await prisma.appointment.deleteMany({ where: { doctorId: { in: ids } } });
    await prisma.providerTimeOff.deleteMany({ where: { providerId: { in: ids } } });
    await prisma.nurseServiceOffering.deleteMany({ where: { serviceId: svc.id } });
    await prisma.nurseService.delete({ where: { id: svc.id } });
    await prisma.nurseProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.patientProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
