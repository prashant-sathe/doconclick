import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { generateSlotsForDate } from "@/lib/clinicAvailability";

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

  const candidates = generateSlotsForDate(clinic.slots, date, new Date(), clinic.leaves.map((l) => l.date));
  if (candidates.length === 0) {
    return NextResponse.json({ slots: [] });
  }

  // A slot is taken if there's a live (not rejected/cancelled/expired)
  // appointment at that exact clinic + date + time already.
  const dayStart = new Date(`${date}T00:00:00+05:30`);
  const dayEnd = new Date(`${date}T23:59:59.999+05:30`);
  const booked = await prisma.appointment.findMany({
    where: {
      doctorId,
      clinicId,
      status: { in: ["PENDING_APPROVAL", "SCHEDULED"] },
      scheduledAt: { gte: dayStart, lte: dayEnd },
    },
    select: { scheduledAt: true },
  });
  const takenTimes = new Set(
    booked.map((a) => {
      const ist = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(a.scheduledAt);
      return ist; // "HH:MM"
    })
  );

  const slots = candidates.filter((s) => !takenTimes.has(s.time));
  return NextResponse.json({ slots });
}
