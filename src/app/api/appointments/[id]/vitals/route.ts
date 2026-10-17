import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { requireActiveNurse } from "@/lib/providerGuard";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { classifyVitals, parseVitals, vitalsSummary } from "@/lib/vitals";

const MAX_PER_VISIT = 6;
const LATE_ENTRY_MS = 12 * 60 * 60 * 1000;

// POST: the nurse records vitals during (or just after) a visit she started.
// A CRITICAL reading alerts the patient's account holder and — if this
// visit came from a doctor's referral — that doctor, straight away.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "NURSE") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const denied = await requireActiveNurse(authUser);
  if (denied) return denied;

  const { id } = await params;
  const appt = await prisma.appointment.findUnique({
    where: { id },
    include: {
      patient: { select: { name: true } },
      nurseReferral: { select: { appointment: { select: { doctorId: true } } } },
      _count: { select: { vitals: true } },
    },
  });
  if (!appt || appt.doctorId !== authUser.id || appt.providerType !== "NURSE") {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }
  const started = !!appt.visitStartedAt;
  const late = appt.status === "COMPLETED" && started && Date.now() - appt.visitStartedAt!.getTime() < LATE_ENTRY_MS;
  if (!(appt.status === "SCHEDULED" && started) && !late) {
    return NextResponse.json({ error: "Record vitals once the visit has started (with the patient's code)." }, { status: 400 });
  }
  if (appt._count.vitals >= MAX_PER_VISIT) {
    return NextResponse.json({ error: "That's enough readings for one visit." }, { status: 400 });
  }

  const parsed = parseVitals(await req.json().catch(() => ({})));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { level, alerts } = classifyVitals(parsed.data);

  const reading = await prisma.vitalReading.create({
    data: {
      ...parsed.data,
      patientId: appt.patientId,
      dependentId: appt.dependentId,
      appointmentId: appt.id,
      recordedById: authUser.id,
      alertLevel: level,
      alerts: alerts.length ? alerts.map((a) => a.message).join("; ") : null,
    },
  });

  if (level === "CRITICAL") {
    const who = appt.patientName ?? appt.patient.name;
    const what = alerts.filter((a) => a.level === "CRITICAL").map((a) => a.message).join("; ");
    void sendPushToUser(appt.patientId, {
      title: `⚠ Urgent: ${who}'s vitals need attention`,
      body: `${what}. Nurse ${authUser.name} recorded this just now — contact your doctor.`,
      url: "/patient/profile/vitals",
    });
    const doctorId = appt.nurseReferral?.appointment.doctorId;
    if (doctorId) {
      void sendPushToUser(doctorId, {
        title: `⚠ Critical vitals: ${who}`,
        body: `${what} (${vitalsSummary(parsed.data)}) — recorded by Nurse ${authUser.name} on the visit you referred.`,
        url: `/doctor/patients/${appt.patientId}${appt.dependentId ? `?dependentId=${appt.dependentId}` : ""}`,
      });
    }
  }

  return NextResponse.json({ reading, level, alerts, doctorAlerted: level === "CRITICAL" && !!appt.nurseReferral });
}
