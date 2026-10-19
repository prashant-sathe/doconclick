import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/routeGuards";

// GET: the caller's home visit that's currently ON_THE_WAY, if any — so the
// journey tracker (src/components/JourneyTracker.tsx) can resume sharing
// location after a reload or app restart. A provider is one person, so at
// most one journey is live; the most recently updated wins.
export async function GET() {
  const { authUser, denied } = await requireRole("DOCTOR", "NURSE");
  if (denied) return denied;

  const active = await prisma.appointment.findFirst({
    where: { doctorId: authUser.id, status: "SCHEDULED", consultType: "HOME", travelStatus: "ON_THE_WAY" },
    orderBy: [{ doctorLocationUpdatedAt: { sort: "desc", nulls: "last" } }, { scheduledAt: "asc" }],
    select: { id: true },
  });
  return NextResponse.json({ id: active?.id ?? null });
}
