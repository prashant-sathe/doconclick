import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { referralProblem, REFERRAL_INACTIVE_CODE } from "@/lib/nurseReferral";

// GET: a referral from one of the patient's own consultations — what the
// nurse booking form needs to pre-fill and to show "prescription attached".
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const referral = await prisma.nurseReferral.findUnique({
    where: { id },
    include: {
      service: { select: { id: true, name: true } },
      appointment: { select: { patientId: true, status: true, scheduledAt: true, doctor: { select: { name: true } } } },
    },
  });
  if (!referral || referral.appointment.patientId !== authUser.id) {
    return NextResponse.json({ error: "Referral not found" }, { status: 404 });
  }
  const inactive = referralProblem(referral.appointment.status);
  if (inactive) return NextResponse.json({ error: inactive, code: REFERRAL_INACTIVE_CODE }, { status: 409 });
  return NextResponse.json({
    id: referral.id,
    service: referral.service,
    visits: referral.visits,
    intervalDays: referral.intervalDays,
    instructions: referral.instructions,
    doctorName: referral.appointment.doctor.name,
    consultedAt: referral.appointment.scheduledAt,
  });
}
