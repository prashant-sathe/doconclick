import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { isDoctorBookable, DOCTOR_BOOKABLE_SELECT } from "@/lib/doctorBookable";
import { formatDoctorName } from "@/lib/utils";
import { addDaysYmd, istDayKey, istMinutesOfDay, istStartOfDay } from "@/lib/istDate";
import { followUpBookHref } from "@/lib/followUp";
import { doseMinutes, parseDurationDays, parseFrequency, QUIET_END_MIN, QUIET_START_MIN } from "@/lib/medicineSchedule";

// Medicine reminders (FP1-22): dose pushes for what the doctor prescribed,
// and one "your medicines are running out" nudge near the end of the course.
// Rows are rebuilt from the prescription inside the same transaction that
// saves it (replacePrescription, src/lib/consultation.ts); the sweeps run with
// the appointment reminders every 5 minutes (src/instrumentation.ts).
//
// Pushes stay generic on the lock screen — a count and a time, never a
// medicine name or who it's for; the details are on /patient/profile/medicines.

export const MEDICINES_URL = "/patient/profile/medicines";

// Prescriptions whose medicines are being taken: not a cancelled/declined visit.
const LIVE_PRESCRIPTION = ["SCHEDULED", "COMPLETED"];
const LIVE_BOOKING = ["PENDING_APPROVAL", "SCHEDULED"];

export const nameKeyOf = (name: string) => name.trim().toLowerCase();

type Med = { name: string; dosage: string; frequency: string; duration: string };

/**
 * Rebuilds an appointment's reminders from its saved medicines. A medicine
 * already there (same name) keeps its start day, on/off and dose history;
 * its times and end day are re-read only when the doctor changed its
 * frequency or duration (so a patient's own pick survives a typo fix).
 * "As needed" medicines get no reminder; medicines that were removed lose theirs.
 */
export async function syncMedicineReminders(
  tx: Prisma.TransactionClient,
  appointmentId: string,
  medicines: Med[],
  now: Date = new Date(),
) {
  const appt = await tx.appointment.findUnique({ where: { id: appointmentId }, select: { patientId: true } });
  if (!appt) return;
  const existing = await tx.medicineReminder.findMany({ where: { appointmentId }, orderBy: { createdAt: "asc" } });
  const pool = new Map<string, typeof existing>();
  for (const r of existing) pool.set(r.nameKey, [...(pool.get(r.nameKey) ?? []), r]);
  const today = istDayKey(now);
  const kept = new Set<string>();

  for (const m of medicines) {
    const freq = parseFrequency(m.frequency);
    if (freq.kind === "asNeeded") continue;
    const nameKey = nameKeyOf(m.name);
    const prev = pool.get(nameKey)?.shift();
    const schedule = (startYmd: string) => {
      const days = parseDurationDays(m.duration);
      return {
        timesOfDay: freq.kind === "times" ? freq.times : [],
        endDate: days ? istStartOfDay(addDaysYmd(startYmd, days - 1)) : null,
        setByPatient: false,
      };
    };
    const base = { name: m.name, nameKey, dosage: m.dosage, frequency: m.frequency, duration: m.duration };
    if (prev) {
      kept.add(prev.id);
      const unchanged = prev.frequency === m.frequency && prev.duration === m.duration;
      await tx.medicineReminder.update({
        where: { id: prev.id },
        data: { ...base, ...(unchanged ? {} : schedule(istDayKey(prev.startDate))) },
      });
    } else {
      await tx.medicineReminder.create({
        data: { appointmentId, patientId: appt.patientId, ...base, startDate: istStartOfDay(today), ...schedule(today) },
      });
    }
  }
  const gone = existing.filter((r) => !kept.has(r.id)).map((r) => r.id);
  if (gone.length) await tx.medicineReminder.deleteMany({ where: { id: { in: gone } } });
}

// A dose is pushed once, in the first sweep at or after its time — within
// this window, so a dose missed while the server was down isn't sent hours late.
const DOSE_WINDOW_MIN = 30;

const inQuietHours = (min: number) => min >= QUIET_START_MIN || min < QUIET_END_MIN;

const isUniqueViolation = (err: unknown) => !!err && typeof err === "object" && "code" in err && err.code === "P2002";

/**
 * "Time for your medicines" — one push per patient per dose time, counting
 * that time's medicines. Each dose is claimed by inserting its MedicineDose
 * row (unique per reminder + day + time), so overlapping sweeps can't send it
 * twice, and a dose the patient already ticked as taken isn't pushed at all.
 * Nothing in quiet hours, for a deleted account, with the master switch off,
 * a medicine switched off, or a cancelled visit's prescription.
 */
export async function sendDueMedicineReminders(now: Date = new Date()): Promise<number> {
  const nowMin = istMinutesOfDay(now);
  if (inQuietHours(nowMin)) return 0;
  const today = istDayKey(now);
  const todayStart = istStartOfDay(today);

  const reminders = await prisma.medicineReminder.findMany({
    where: {
      enabled: true,
      timesOfDay: { isEmpty: false },
      startDate: { lte: todayStart },
      endDate: { gte: todayStart },
      patient: { deletedAt: null, medicineRemindersEnabled: true },
      appointment: { status: { in: LIVE_PRESCRIPTION } },
    },
    select: { id: true, patientId: true, timesOfDay: true },
  });

  const byPatientTime = new Map<string, { patientId: string; time: string; count: number }>();
  for (const r of reminders) {
    for (const time of r.timesOfDay) {
      const at = doseMinutes(time);
      if (at === null || nowMin < at || nowMin >= at + DOSE_WINDOW_MIN) continue;
      try {
        await prisma.medicineDose.create({ data: { reminderId: r.id, doseDate: today, doseTime: time, notifiedAt: now } });
      } catch (err) {
        if (isUniqueViolation(err)) continue;
        throw err;
      }
      const key = `${r.patientId}|${time}`;
      const hit = byPatientTime.get(key) ?? { patientId: r.patientId, time, count: 0 };
      hit.count++;
      byPatientTime.set(key, hit);
    }
  }

  for (const { patientId, time, count } of byPatientTime.values()) {
    await sendPushToUser(patientId, {
      key: "medicineDose",
      values: { count, time: new Date(todayStart.getTime() + doseMinutes(time)! * 60_000) },
      url: MEDICINES_URL,
    });
  }
  return byPatientTime.size;
}

// The refill nudge goes out in the daytime only.
const REFILL_FROM_MIN = 9 * 60;
const REFILL_UNTIL_MIN = 21 * 60;

/**
 * "Your medicines are running out — see the doctor again": once per
 * prescription (medicineRefillSentAt, claimed row by row), on the last two
 * days of a course of 3+ days, linking to the one-tap follow-up booking.
 * Skipped (still marked) when the doctor already set a follow-up date (that
 * has its own reminder), the patient already has a booking with this doctor,
 * or the doctor can't be booked.
 */
export async function sendDueRefillReminders(now: Date = new Date()): Promise<number> {
  const nowMin = istMinutesOfDay(now);
  if (nowMin < REFILL_FROM_MIN || nowMin >= REFILL_UNTIL_MIN) return 0;
  const today = istDayKey(now);
  const todayStart = istStartOfDay(today);
  const tomorrowStart = istStartOfDay(addDaysYmd(today, 1));

  const due = await prisma.appointment.findMany({
    where: {
      status: "COMPLETED",
      providerType: "DOCTOR",
      medicineRefillSentAt: null,
      followUpDate: null,
      patient: { deletedAt: null, medicineRemindersEnabled: true },
      medicineReminders: {
        some: { enabled: true, endDate: { gte: todayStart, lte: tomorrowStart } },
        none: { endDate: { gt: tomorrowStart } },
      },
    },
    select: {
      id: true, patientId: true, doctorId: true, consultType: true, clinicId: true,
      doctor: { select: { name: true, ...DOCTOR_BOOKABLE_SELECT } },
      medicineReminders: { select: { startDate: true, endDate: true } },
    },
  });

  let sent = 0;
  for (const a of due) {
    const start = Math.min(...a.medicineReminders.map((r) => r.startDate.getTime()));
    const end = Math.max(...a.medicineReminders.map((r) => r.endDate?.getTime() ?? 0));
    if (end - start < 2 * 24 * 60 * 60_000) continue; // a 1–2 day course: nothing to refill
    const { count } = await prisma.appointment.updateMany({
      where: { id: a.id, medicineRefillSentAt: null },
      data: { medicineRefillSentAt: now },
    });
    if (count === 0 || !isDoctorBookable(a.doctor)) continue;
    const rebooked = await prisma.appointment.findFirst({
      where: {
        patientId: a.patientId,
        doctorId: a.doctorId,
        OR: [
          { followUpOfId: a.id, status: { in: [...LIVE_BOOKING, "COMPLETED"] } },
          { status: { in: LIVE_BOOKING }, scheduledAt: { gte: todayStart } },
        ],
      },
      select: { id: true },
    });
    if (rebooked) continue;
    await sendPushToUser(a.patientId, {
      key: "medicineRefill",
      values: { doctor: formatDoctorName(a.doctor.name) },
      url: followUpBookHref(a),
    });
    sent++;
  }
  return sent;
}

// ── The patient's screen (GET /api/patients/me/medicine-reminders) ──

const RECENT_COURSE_DAYS = 7;

/**
 * The account holder's current medicines (their own and their family
 * members'), today's doses with what's been ticked, and the "see the doctor
 * again" cards for courses ending within 2 days or in the last week.
 * Only `patientId`'s own rows are ever read.
 */
export async function patientMedicineView(patientId: string, now: Date = new Date()) {
  const today = istDayKey(now);
  const todayStart = istStartOfDay(today);
  const [user, rows] = await Promise.all([
    prisma.user.findUnique({ where: { id: patientId }, select: { medicineRemindersEnabled: true } }),
    prisma.medicineReminder.findMany({
      where: {
        patientId,
        appointment: { status: { in: LIVE_PRESCRIPTION } },
        OR: [{ endDate: null }, { endDate: { gte: istStartOfDay(addDaysYmd(today, -RECENT_COURSE_DAYS)) } }],
      },
      orderBy: [{ startDate: "desc" }, { createdAt: "asc" }],
      select: {
        id: true, name: true, dosage: true, frequency: true, duration: true, timesOfDay: true,
        startDate: true, endDate: true, enabled: true, appointmentId: true,
        doses: { where: { doseDate: today, takenAt: { not: null } }, select: { doseTime: true } },
        appointment: {
          select: {
            id: true, status: true, providerType: true, doctorId: true, consultType: true, clinicId: true,
            relation: true, patientName: true, followUpDate: true,
            doctor: { select: { name: true, ...DOCTOR_BOOKABLE_SELECT } },
            medicines: { select: { name: true, instructions: true } },
          },
        },
      },
    }),
  ]);

  const reminders = rows
    .filter((r) => !r.endDate || r.endDate.getTime() >= todayStart.getTime())
    .map((r) => {
      const a = r.appointment;
      const endYmd = r.endDate ? istDayKey(r.endDate) : null;
      return {
        id: r.id,
        name: r.name,
        dosage: r.dosage,
        frequency: r.frequency,
        duration: r.duration,
        instructions: a.medicines.find((m) => nameKeyOf(m.name) === nameKeyOf(r.name))?.instructions ?? null,
        timesOfDay: r.timesOfDay,
        startDate: istDayKey(r.startDate),
        endDate: endYmd,
        enabled: r.enabled,
        needsSetup: r.timesOfDay.length === 0 || !endYmd,
        startsLater: r.startDate.getTime() > todayStart.getTime(),
        takenToday: r.doses.map((d) => d.doseTime),
        person: a.relation !== "Self" && a.patientName ? { name: a.patientName, relation: a.relation } : null,
        doctorName: formatDoctorName(a.doctor.name),
        appointmentId: a.id,
      };
    });

  // One card per prescription whose whole course ends soon or just ended.
  const byAppt = new Map<string, (typeof rows)[number][]>();
  for (const r of rows) byAppt.set(r.appointmentId, [...(byAppt.get(r.appointmentId) ?? []), r]);
  const refills = [];
  const soonEnd = istStartOfDay(addDaysYmd(today, 1)).getTime();
  for (const [appointmentId, list] of byAppt) {
    const a = list[0].appointment;
    if (a.status !== "COMPLETED" || a.providerType !== "DOCTOR" || !isDoctorBookable(a.doctor)) continue;
    if (list.some((r) => !r.endDate)) continue;
    const end = Math.max(...list.map((r) => r.endDate!.getTime()));
    if (end > soonEnd) continue;
    refills.push({
      appointmentId,
      doctorName: formatDoctorName(a.doctor.name),
      person: a.relation !== "Self" && a.patientName ? { name: a.patientName, relation: a.relation } : null,
      endDate: istDayKey(new Date(end)),
      ended: end < todayStart.getTime(),
      href: followUpBookHref(a),
    });
  }
  const rebooked = refills.length
    ? await prisma.appointment.findMany({
        where: { patientId, followUpOfId: { in: refills.map((c) => c.appointmentId) }, status: { in: [...LIVE_BOOKING, "COMPLETED"] } },
        select: { followUpOfId: true },
      })
    : [];
  const done = new Set(rebooked.map((b) => b.followUpOfId));

  return {
    enabled: user?.medicineRemindersEnabled ?? true,
    today,
    reminders,
    refills: refills.filter((c) => !done.has(c.appointmentId)),
  };
}
