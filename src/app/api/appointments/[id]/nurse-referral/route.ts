import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveDoctor } from "@/lib/doctorGuard";
import { requireRole } from "@/lib/routeGuards";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { parseReferral } from "@/lib/consultation";
import { referralPushCopy } from "@/lib/nurseReferral";
import { withErrorLocale } from "@/lib/apiErrors";

// Writing a referral needs an accepted or completed consultation; removing
// one is allowed whatever happened to it — that's how a doctor clears the
// (already void) referral left on a cancelled consultation.
async function loadOwnConsult(id: string, purpose: "write" | "delete") {
  const { authUser, denied } = await requireRole("DOCTOR");
  if (denied) return { error: denied };
  const suspended = await requireActiveDoctor(authUser);
  if (suspended) return { error: suspended };
  const appt = await prisma.appointment.findUnique({
    where: { id },
    select: { id: true, doctorId: true, patientId: true, status: true, providerType: true },
  });
  if (!appt || appt.doctorId !== authUser.id || appt.providerType !== "DOCTOR") {
    return { error: NextResponse.json({ error: "Appointment not found" }, { status: 404 }) };
  }
  if (purpose === "write" && !["SCHEDULED", "COMPLETED"].includes(appt.status)) {
    return { error: NextResponse.json({ error: "Nurse care can only be added to an accepted or completed consultation." }, { status: 400 }) };
  }
  return { appt, authUser };
}

// POST { serviceId, visits, intervalDays, instructions } — the doctor says
// "this patient needs nurse care at home". The patient then gets a one-tap
// "Book a nurse" on the consultation, with this prescription attached.
export const POST = withErrorLocale(async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { appt, authUser, error } = await loadOwnConsult(id, "write");
  if (error) return error;

  const input = await parseReferral(await req.json().catch(() => ({})));
  if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });
  const { serviceId, serviceName, visits, intervalDays, instructions } = input;

  const existed = await prisma.nurseReferral.findUnique({ where: { appointmentId: appt!.id }, select: { id: true } });
  const referral = await prisma.nurseReferral.upsert({
    where: { appointmentId: appt!.id },
    create: { appointmentId: appt!.id, serviceId, visits, intervalDays, instructions },
    update: { serviceId, visits, intervalDays, instructions },
  });
  // A new referral on a completed consultation is bookable right away. One
  // added during an accepted consultation (the usual "complete" flow) is
  // announced when that consultation is marked complete instead.
  if (!existed && appt!.status === "COMPLETED") {
    void sendPushToUser(appt!.patientId, referralPushCopy(authUser!.name, serviceName));
  }
  return NextResponse.json(referral);
});

export const DELETE = withErrorLocale(async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { appt, error } = await loadOwnConsult(id, "delete");
  if (error) return error;
  await prisma.nurseReferral.deleteMany({ where: { appointmentId: appt!.id } });
  return NextResponse.json({ ok: true });
});
