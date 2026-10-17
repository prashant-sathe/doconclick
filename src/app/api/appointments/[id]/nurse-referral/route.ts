import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { requireActiveDoctor } from "@/lib/doctorGuard";
import { PACKAGE_INTERVAL_OPTIONS, PACKAGE_MAX_VISITS } from "@/lib/nursePackage";

async function loadOwnConsult(id: string) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  const suspended = await requireActiveDoctor(authUser);
  if (suspended) return { error: suspended };
  const appt = await prisma.appointment.findUnique({ where: { id }, select: { id: true, doctorId: true, status: true, providerType: true } });
  if (!appt || appt.doctorId !== authUser.id || appt.providerType !== "DOCTOR") {
    return { error: NextResponse.json({ error: "Appointment not found" }, { status: 404 }) };
  }
  if (!["SCHEDULED", "COMPLETED"].includes(appt.status)) {
    return { error: NextResponse.json({ error: "Nurse care can only be added to an accepted or completed consultation." }, { status: 400 }) };
  }
  return { appt };
}

// POST { serviceId, visits, intervalDays, instructions } — the doctor says
// "this patient needs nurse care at home". The patient then gets a one-tap
// "Book a nurse" on the consultation, with this prescription attached.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { appt, error } = await loadOwnConsult(id);
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const visits = Number(body.visits ?? 1);
  const intervalDays = Number(body.intervalDays ?? 1);
  if (!Number.isInteger(visits) || visits < 1 || visits > PACKAGE_MAX_VISITS) {
    return NextResponse.json({ error: `Visits must be between 1 and ${PACKAGE_MAX_VISITS}.` }, { status: 400 });
  }
  if (!(PACKAGE_INTERVAL_OPTIONS as readonly number[]).includes(intervalDays)) {
    return NextResponse.json({ error: "Visits can be every 1, 2 or 3 days." }, { status: 400 });
  }
  const service = await prisma.nurseService.findFirst({ where: { id: String(body.serviceId ?? ""), isActive: true } });
  if (!service) return NextResponse.json({ error: "Pick a nurse service." }, { status: 400 });
  const instructions = typeof body.instructions === "string" ? body.instructions.trim().slice(0, 1000) || null : null;

  const referral = await prisma.nurseReferral.upsert({
    where: { appointmentId: appt!.id },
    create: { appointmentId: appt!.id, serviceId: service.id, visits, intervalDays, instructions },
    update: { serviceId: service.id, visits, intervalDays, instructions },
  });
  return NextResponse.json(referral);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { appt, error } = await loadOwnConsult(id);
  if (error) return error;
  await prisma.nurseReferral.deleteMany({ where: { appointmentId: appt!.id } });
  return NextResponse.json({ ok: true });
}
