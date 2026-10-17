import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { requireActiveNurse } from "@/lib/providerGuard";
import { sendPushToUser, sendPushToAdmins } from "@/lib/firebaseAdmin";

const MAX_ATTEMPTS = 5;

// POST { code } — the nurse, at the door, enters the 4-digit code shown in
// the patient's app; that's what starts the visit (and proves she was there).
// POST { skipReason } — the patient can't produce the code (no phone, the
// account holder is elsewhere and unreachable…): start anyway, but the reason
// is recorded, the patient is told, and the admin is alerted.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "NURSE") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const denied = await requireActiveNurse(authUser);
  if (denied) return denied;

  const { id } = await params;
  const appt = await prisma.appointment.findUnique({ where: { id }, include: { patient: { select: { name: true } } } });
  if (!appt || appt.doctorId !== authUser.id || appt.providerType !== "NURSE") {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }
  if (appt.status !== "SCHEDULED") {
    return NextResponse.json({ error: "Only a confirmed visit can be started." }, { status: 400 });
  }
  if (appt.travelStatus !== "ARRIVED") {
    return NextResponse.json({ error: "Mark that you've arrived first." }, { status: 400 });
  }
  if (appt.visitStartedAt) {
    return NextResponse.json({ error: "This visit has already started." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));

  if (typeof body.skipReason === "string") {
    const reason = body.skipReason.trim();
    if (reason.length < 10) {
      return NextResponse.json({ error: "Please explain why the code isn't available (at least a short sentence)." }, { status: 400 });
    }
    const updated = await prisma.appointment.update({
      where: { id },
      data: { visitStartedAt: new Date(), visitStartNote: reason.slice(0, 500) },
      omit: { visitOtp: true },
    });
    void sendPushToUser(appt.patientId, {
      title: "Visit started without your code",
      body: `${authUser.name} started the visit without the code: "${reason.slice(0, 80)}". If this wasn't you, contact support.`,
      url: "/patient/appointments",
    });
    void sendPushToAdmins({
      title: "Nurse visit started without code",
      body: `${authUser.name} → ${appt.patient.name}: ${reason.slice(0, 100)}`,
      url: "/admin/bookings",
    });
    return NextResponse.json(updated);
  }

  if (appt.visitOtpAttempts >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: "Too many wrong codes. Ask the patient to check the code in their app, or start without the code and tell us why.", code: "OTP_LOCKED" },
      { status: 429 }
    );
  }
  const code = String(body.code ?? "").replace(/\D/g, "");
  const expected = appt.visitOtp ?? "";
  const match = code.length === 4 && expected.length === 4 && timingSafeEqual(Buffer.from(code), Buffer.from(expected));
  if (!match) {
    const after = await prisma.appointment.update({
      where: { id },
      data: { visitOtpAttempts: { increment: 1 } },
      select: { visitOtpAttempts: true },
    });
    const left = MAX_ATTEMPTS - after.visitOtpAttempts;
    return NextResponse.json(
      { error: left > 0 ? `That code doesn't match. ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many wrong codes. Start without the code and tell us why.", code: left > 0 ? "OTP_WRONG" : "OTP_LOCKED" },
      { status: 400 }
    );
  }

  const updated = await prisma.appointment.update({
    where: { id },
    data: { visitStartedAt: new Date() },
    omit: { visitOtp: true },
  });
  void sendPushToUser(appt.patientId, {
    title: "Your nurse visit has started",
    body: `${authUser.name} verified your code and started the visit.`,
    url: "/patient/appointments",
  });
  return NextResponse.json(updated);
}
