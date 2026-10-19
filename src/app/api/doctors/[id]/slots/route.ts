import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { generateSlotsForDate, SLOT_INTERVAL_MINUTES } from "@/lib/clinicAvailability";
import { isTimedBooking } from "@/lib/doctorSlots";
import { getBookingHorizonDays, horizonProblem } from "@/lib/bookingLimits";

// GET /api/doctors/[id]/slots?clinicId=X&date=YYYY-MM-DD
// Discrete bookable time slots for one of a doctor's clinics on one date —
// the clinic's open-hour ranges (ClinicSlot) divided into fixed intervals,
// minus whatever's already booked. Patient-facing (any signed-in patient can
// check any doctor's slots — same visibility as the doctor's public profile).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: doctorId } = await params;
  const { searchParams } = new URL(req.url);
  const clinicId = searchParams.get("clinicId");
  const date = searchParams.get("date");
  if (!clinicId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "clinicId and date (YYYY-MM-DD) are required" }, { status: 400 });
  }

  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    include: { slots: true, leaves: true },
  });
  if (!clinic || clinic.doctorId !== doctorId || !clinic.isActive) {
    return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
  }

  // Nothing past the booking horizon — the booking route would refuse it.
  const horizonDays = await getBookingHorizonDays();
  const candidates = generateSlotsForDate(clinic.slots, date, new Date(), clinic.leaves.map((l) => l.date))
    .filter((s) => !horizonProblem(new Date(`${date}T${s.time}:00+05:30`), horizonDays));
  if (candidates.length === 0) {
    return NextResponse.json({ slots: [] });
  }

  // A slot is taken if it overlaps any live timed booking of this doctor —
  // at any of their clinics or consult types, or a patient's pending request
  // to move there. Same rule the booking route enforces (src/lib/doctorSlots.ts).
  const slotMs = SLOT_INTERVAL_MINUTES * 60_000;
  const dayStart = new Date(new Date(`${date}T00:00:00+05:30`).getTime() - slotMs);
  const dayEnd = new Date(new Date(`${date}T23:59:59.999+05:30`).getTime() + slotMs);
  const day = { gte: dayStart, lte: dayEnd };
  const booked = await prisma.appointment.findMany({
    where: {
      doctorId,
      OR: [
        { status: { in: ["PENDING_APPROVAL", "SCHEDULED"] }, scheduledAt: day },
        { status: "SCHEDULED", requestedScheduledAt: day },
      ],
    },
    select: { scheduledAt: true, createdAt: true, requestedScheduledAt: true },
  });
  const busyStarts = booked.flatMap((a) => [
    ...(isTimedBooking(a) ? [a.scheduledAt.getTime()] : []),
    ...(a.requestedScheduledAt ? [a.requestedScheduledAt.getTime()] : []),
  ]);
  const isTaken = (hhmm: string) => {
    const start = new Date(`${date}T${hhmm}:00+05:30`).getTime();
    return busyStarts.some((b) => Math.abs(b - start) < slotMs);
  };

  const slots = candidates.filter((s) => !isTaken(s.time));
  return NextResponse.json({ slots });
}
