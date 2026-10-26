import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { generateSlotsForDate, SLOT_INTERVAL_MINUTES, type TimeSlot } from "@/lib/clinicAvailability";
import { isTimedBooking, doctorHoursSlotsForDate } from "@/lib/doctorSlots";
import { getBookingHorizonDays, horizonProblem } from "@/lib/bookingLimits";
import { providerOffOnDate } from "@/lib/timeOff";
import { withErrorLocale } from "@/lib/apiErrors";

// GET /api/doctors/[id]/slots?clinicId=X&date=YYYY-MM-DD
// GET /api/doctors/[id]/slots?consultType=HOME|VIDEO&date=YYYY-MM-DD
// Discrete bookable time slots for one date — a clinic's open-hour ranges
// (ClinicSlot), or for a home visit / video call the doctor's own "Available
// Timings", divided into fixed intervals, minus whatever's already booked.
// Patient-facing (any signed-in patient can check any doctor's slots — same
// visibility as the doctor's public profile).
export const GET = withErrorLocale(async function GET(
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
  const consultType = searchParams.get("consultType");
  const date = searchParams.get("date");
  const forHours = !clinicId && (consultType === "HOME" || consultType === "VIDEO");
  if ((!clinicId && !forHours) || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "clinicId and date (YYYY-MM-DD) are required" }, { status: 400 });
  }

  // The open times for that date, before bookings are taken out.
  let open: TimeSlot[];
  if (clinicId) {
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      include: { slots: true, leaves: true },
    });
    if (!clinic || clinic.doctorId !== doctorId || !clinic.isActive) {
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
    }
    open = generateSlotsForDate(clinic.slots, date, new Date(), clinic.leaves.map((l) => l.date));
  } else {
    const profile = await prisma.doctorProfile.findUnique({
      where: { userId: doctorId },
      select: { availability: true, offersHomeVisit: true, offersVideo: true },
    });
    if (!profile || !(consultType === "HOME" ? profile.offersHomeVisit : profile.offersVideo)) {
      return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
    }
    // Same generator the booking route checks a HOME/VIDEO time against (snapToDoctorHours).
    open = doctorHoursSlotsForDate(profile.availability, date);
  }

  // A whole day on time off (or today, offline) has nothing to book.
  if (await providerOffOnDate(doctorId, date)) {
    return NextResponse.json({ slots: [], away: true });
  }

  // Nothing past the booking horizon — the booking route would refuse it.
  const horizonDays = await getBookingHorizonDays();
  const candidates = open.filter((s) => !horizonProblem(new Date(`${date}T${s.time}:00+05:30`), horizonDays));
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
});
