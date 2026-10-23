import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { requireActiveNurse } from "@/lib/providerGuard";
import { sendPushToUser, sendPushToAdmins } from "@/lib/firebaseAdmin";
import { createRateLimiter } from "@/lib/rateLimit";
import { visitStartProblem } from "@/lib/nursePackage";
import { withErrorLocale } from "@/lib/apiErrors";

const MAX_ATTEMPTS = 5;

// Per-nurse cap on code submissions across all of the nurse's visits, so the
// per-visit limit can't be sidestepped by spreading guesses over visits.
const checkCodeRateLimit = createRateLimiter(10, 10 * 60 * 1000);

// POST { code } — the nurse, at the door, enters the 4-digit code shown in
// the patient's app; that's what starts the visit (and proves she was there).
// POST { skipReason } — the patient can't produce the code (no phone, the
// account holder is elsewhere and unreachable…): start anyway, but the reason
// is recorded, the patient is told, and the admin is alerted.
export const POST = withErrorLocale(async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
  // Applies to both paths below, so skipping the code can't dodge it.
  const tooEarlyOrLate = visitStartProblem(appt.scheduledAt);
  if (tooEarlyOrLate) {
    return NextResponse.json({ error: tooEarlyOrLate, code: "OUTSIDE_START_WINDOW" }, { status: 400 });
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
      key: "visitStartedWithoutCode",
      values: { nurse: authUser.name, reason: reason.slice(0, 80) },
      url: "/patient/appointments",
    });
    void sendPushToAdmins({
      key: "adminVisitStartedWithoutCode",
      values: { nurse: authUser.name, patient: appt.patient.name, reason: reason.slice(0, 100) },
      url: "/admin/bookings",
    });
    return NextResponse.json(updated);
  }

  // Checked before an attempt is claimed, so a throttled request doesn't
  // burn one of the visit's five tries.
  if (!checkCodeRateLimit(authUser.id)) {
    return NextResponse.json(
      { error: "Too many code attempts. Please wait a few minutes and try again.", code: "RATE_LIMITED" },
      { status: 429 }
    );
  }

  // Claim an attempt atomically *before* comparing. A read-then-increment
  // let parallel requests all pass the `< MAX_ATTEMPTS` check on the same
  // stale count and guess far more than five codes.
  const claimed = await prisma.appointment.updateMany({
    where: { id, visitOtpAttempts: { lt: MAX_ATTEMPTS } },
    data: { visitOtpAttempts: { increment: 1 } },
  });
  if (claimed.count === 0) {
    return NextResponse.json(
      { error: "Too many wrong codes. Ask the patient to check the code in their app, or start without the code and tell us why.", code: "OTP_LOCKED" },
      { status: 429 }
    );
  }

  const code = String(body.code ?? "").replace(/\D/g, "");
  const expected = appt.visitOtp ?? "";
  const match = code.length === 4 && expected.length === 4 && timingSafeEqual(Buffer.from(code), Buffer.from(expected));
  if (!match) {
    const after = await prisma.appointment.findUnique({ where: { id }, select: { visitOtpAttempts: true } });
    const left = Math.max(0, MAX_ATTEMPTS - (after?.visitOtpAttempts ?? MAX_ATTEMPTS));
    return NextResponse.json(
      { error: left > 0 ? `That code doesn't match. ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many wrong codes. Start without the code and tell us why.", code: left > 0 ? "OTP_WRONG" : "OTP_LOCKED" },
      { status: 400 }
    );
  }

  // Guarded on visitStartedAt so two simultaneous correct codes can't both
  // start the visit (and double-notify the patient).
  const started = await prisma.appointment.updateMany({
    where: { id, visitStartedAt: null },
    data: { visitStartedAt: new Date(), visitOtpAttempts: 0 },
  });
  if (started.count === 0) {
    return NextResponse.json({ error: "This visit has already started." }, { status: 400 });
  }
  const updated = await prisma.appointment.findUnique({ where: { id }, omit: { visitOtp: true } });
  void sendPushToUser(appt.patientId, {
    key: "visitStarted",
    values: { nurse: authUser.name },
    url: "/patient/appointments",
  });
  return NextResponse.json(updated);
});
