// Reschedule-request test: moving an accepted appointment is a request held
// in requestedScheduledAt — the booking, its time and its payment stand until
// the provider accepts the new time. Covers accept / keep original /
// withdraw / lapse / cancel, racing answers, and clinic slot blocking. Runs
// against a live dev server and the DB in .env with throwaway users (no push
// tokens) that are deleted afterwards.
//
//   npm run test:reschedule             (BASE_URL defaults to http://localhost:3000)
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

// IST date a few days out, so every time used below is in the future.
const day = new Date(Date.now() + 3 * 86400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const at = (hhmm: string) => new Date(`${day}T${hhmm}:00+05:30`);

async function main() {
  const stamp = String(Date.now()).slice(-9);
  const doctor = await prisma.user.create({ data: { name: "Resched Test Doctor", mobile: "7" + stamp, role: "DOCTOR" } });
  const patient = await prisma.user.create({ data: { name: "Resched Test Patient", mobile: "6" + stamp, role: "PATIENT" } });
  const other = await prisma.user.create({ data: { name: "Resched Test Other", mobile: "5" + stamp, role: "PATIENT" } });
  const cookie = (u: typeof doctor) => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile }, SECRET)}`;
  const DOC = cookie(doctor), PAT = cookie(patient), OTHER = cookie(other);
  const clinic = await prisma.clinic.create({
    data: {
      doctorId: doctor.id, name: "Resched Test Clinic", address: "-", lat: 0, lng: 0,
      slots: { create: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => ({ dayOfWeek: d, fromTime: "08:00", toTime: "20:00" })) },
    },
  });

  const patch = async (who: string, id: string, body: unknown) => {
    const r = await fetch(`${BASE}/api/appointments/${id}`, { method: "PATCH", headers: { cookie: who, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, error: (await r.json().catch(() => ({}))).error as string | undefined };
  };
  const row = (id: string) => prisma.appointment.findUniqueOrThrow({ where: { id }, select: { status: true, paymentStatus: true, scheduledAt: true, requestedScheduledAt: true, reminderSentAt: true } });
  const mk = (data: Record<string, unknown> = {}) => prisma.appointment.create({
    data: {
      patientId: patient.id, doctorId: doctor.id, symptoms: "reschedule test", consultType: "CLINIC", clinicId: clinic.id,
      status: "SCHEDULED", paymentMethod: "ONLINE", paymentStatus: "PAID", amount: 500, scheduledAt: at("10:00"), ...data,
    } as never,
  });
  const t = (d: Date | null) => (d ? d.toISOString().slice(11, 16) + "Z" : "null");

  try {
    // 1. Request keeps the booking as-is
    const a = await mk({ reminderSentAt: new Date() });
    const req1 = await patch(PAT, a.id, { scheduledAt: at("11:00").toISOString() });
    let r = await row(a.id);
    check("patient request keeps booking", req1.status === 200 && r.status === "SCHEDULED" && r.paymentStatus === "PAID" && +r.scheduledAt === +at("10:00") && +r.requestedScheduledAt! === +at("11:00"),
      `${req1.status}; ${r.status}/${r.paymentStatus}, at ${t(r.scheduledAt)}, requested ${t(r.requestedScheduledAt)}`);

    // 2. Requested clinic slot is blocked for others (slots API + booking clash + someone else's request)
    const slots = await fetch(`${BASE}/api/doctors/${doctor.id}/slots?clinicId=${clinic.id}&date=${day}`, { headers: { cookie: OTHER } }).then((x) => x.json());
    const times: string[] = slots.slots.map((s: { time: string }) => s.time);
    check("slots API hides original + requested times", !times.includes("10:00") && !times.includes("11:00") && times.includes("12:00"), `10:00 ${times.includes("10:00") ? "shown" : "hidden"}, 11:00 ${times.includes("11:00") ? "shown" : "hidden"}`);
    const b = await mk({ patientId: other.id, scheduledAt: at("12:00") });
    const clash = await patch(OTHER, b.id, { scheduledAt: at("11:00").toISOString() });
    check("another patient can't request the requested slot", clash.status === 409, `${clash.status} ${clash.error}`);

    // 3. Keep original
    const dec = await patch(DOC, a.id, { reschedule: "DECLINE" });
    r = await row(a.id);
    check("doctor keeps original", dec.status === 200 && +r.scheduledAt === +at("10:00") && r.requestedScheduledAt === null && r.status === "SCHEDULED",
      `${dec.status}; at ${t(r.scheduledAt)}, requested ${t(r.requestedScheduledAt)}`);
    const again = await patch(DOC, a.id, { reschedule: "ACCEPT" });
    check("answering with no request → 409", again.status === 409, `${again.status} ${again.error}`);

    // 4. Racing answers: exactly one wins
    await patch(PAT, a.id, { scheduledAt: at("13:00").toISOString() });
    const race = await Promise.all(Array.from({ length: 8 }, (_, i) => patch(DOC, a.id, { reschedule: i % 2 ? "DECLINE" : "ACCEPT" })));
    r = await row(a.id);
    const wins = race.filter((x) => x.status === 200).length;
    const moved = +r.scheduledAt === +at("13:00");
    check("8 racing accept/keep answers → one wins", wins === 1 && race.every((x) => x.status === 200 || x.status === 409) && r.requestedScheduledAt === null && (moved || +r.scheduledAt === +at("10:00")),
      `${wins}×200; ended at ${t(r.scheduledAt)} (${moved ? "accepted" : "kept"})`);

    // 5. Accept moves the time and re-arms the reminder
    const c = await mk({ scheduledAt: at("14:00"), reminderSentAt: new Date() });
    await patch(PAT, c.id, { scheduledAt: at("15:00").toISOString() });
    const acc = await patch(DOC, c.id, { reschedule: "ACCEPT" });
    r = await row(c.id);
    check("doctor accepts new time", acc.status === 200 && +r.scheduledAt === +at("15:00") && r.requestedScheduledAt === null && r.reminderSentAt === null && r.paymentStatus === "PAID",
      `${acc.status}; at ${t(r.scheduledAt)}, reminder ${r.reminderSentAt ? "kept" : "reset"}, ${r.paymentStatus}`);

    // 6. Withdraw
    await patch(PAT, c.id, { scheduledAt: at("16:00").toISOString() });
    const w1 = await patch(PAT, c.id, { withdrawReschedule: true });
    const w2 = await patch(PAT, c.id, { withdrawReschedule: true });
    r = await row(c.id);
    check("patient withdraws (second time → 409)", w1.status === 200 && w2.status === 409 && r.requestedScheduledAt === null && +r.scheduledAt === +at("15:00"), `${w1.status}, ${w2.status}; at ${t(r.scheduledAt)}`);

    // 7. Lapse: an unanswered request whose original time has passed is dropped by the sweep — booking untouched
    const past = new Date(Date.now() - 3600_000);
    const d = await mk({ scheduledAt: past, requestedScheduledAt: at("17:00"), createdAt: new Date(Date.now() - 86400_000) });
    await fetch(`${BASE}/api/appointments/me`, { headers: { cookie: PAT } });
    r = await row(d.id);
    check("sweep lapses stale request, booking stays", r.requestedScheduledAt === null && r.status === "SCHEDULED" && r.paymentStatus === "PAID",
      `${r.status}/${r.paymentStatus}, requested ${t(r.requestedScheduledAt)}`);

    // 8. Cancelling clears a pending request; a still-pending request moves in place
    await patch(PAT, c.id, { scheduledAt: at("18:00").toISOString() });
    const cx = await patch(PAT, c.id, { status: "CANCELLED" });
    r = await row(c.id);
    check("cancel clears pending request", cx.status === 200 && r.status === "CANCELLED" && r.requestedScheduledAt === null, `${cx.status}; ${r.status}, requested ${t(r.requestedScheduledAt)}`);
    const e = await mk({ status: "PENDING_APPROVAL", paymentStatus: "PENDING", scheduledAt: at("09:00") });
    const pe = await patch(PAT, e.id, { scheduledAt: at("09:30").toISOString() });
    r = await row(e.id);
    check("pending request moves in place", pe.status === 200 && r.status === "PENDING_APPROVAL" && +r.scheduledAt === +at("09:30") && r.requestedScheduledAt === null, `${pe.status}; ${r.status} at ${t(r.scheduledAt)}`);
  } finally {
    await prisma.appointment.deleteMany({ where: { doctorId: doctor.id } });
    await prisma.clinic.delete({ where: { id: clinic.id } });
    await prisma.user.deleteMany({ where: { id: { in: [doctor.id, patient.id, other.id] } } });
    await prisma.$disconnect();
  }
  if (failures) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll checks passed");
}

main().catch((e) => { console.error(e); process.exit(1); });
