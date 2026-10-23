import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { generateAgoraToken, TOKEN_TTL_SECONDS } from "@/lib/agora";
import { VIDEO_UNLOCK_DELAY_SECONDS, videoJoinWindow } from "@/lib/videoCall";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { requireActiveDoctor } from "@/lib/doctorGuard";

// GET: an Agora token for the caller (doctor or patient) to join — or renew
// their token in — this appointment's video call. Also used for renewal, so
// every check here applies mid-call too.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment || (appointment.patientId !== authUser.id && appointment.doctorId !== authUser.id)) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (authUser.id === appointment.doctorId) {
    const suspendedResponse = await requireActiveDoctor(authUser);
    if (suspendedResponse) return suspendedResponse;
  }
  if (appointment.consultType !== "VIDEO" || appointment.status !== "SCHEDULED") {
    return NextResponse.json(
      { error: "This appointment is not a scheduled video consultation." },
      { status: 403 }
    );
  }
  if (appointment.paymentStatus !== "PAID") {
    return NextResponse.json(
      { error: "Payment is required before joining the video consultation." },
      { status: 403 }
    );
  }
  const unlockAt = appointment.paidAt
    ? appointment.paidAt.getTime() + VIDEO_UNLOCK_DELAY_SECONDS * 1000
    : 0; // defensive: PAID but no paidAt somehow — don't block
  if (Date.now() < unlockAt) {
    return NextResponse.json(
      { error: "Video consultation is unlocking…", availableAt: new Date(unlockAt).toISOString() },
      { status: 403 }
    );
  }

  // Only around the booked time (src/lib/videoCall.ts) — not days early or
  // long after, even though the booking is still SCHEDULED.
  const { opensAt, closesAt } = videoJoinWindow(appointment);
  const now = Date.now();
  if (now < opensAt) {
    return NextResponse.json(
      { error: "The video consultation opens shortly before the appointment time.", code: "VIDEO_NOT_OPEN_YET", availableAt: new Date(opensAt).toISOString() },
      { status: 403 }
    );
  }
  if (now > closesAt) {
    return NextResponse.json(
      { error: "The time for this video consultation has passed. Please book a new appointment.", code: "VIDEO_WINDOW_CLOSED" },
      { status: 403 }
    );
  }

  // The first person to join tells the other — once per appointment, not on
  // every rejoin or token renewal. Claimed atomically so two simultaneous
  // joins can't both send it.
  const isPatient = authUser.id === appointment.patientId;
  const { count: firstJoin } = await prisma.appointment.updateMany({
    where: { id, videoStartedPushAt: null },
    data: { videoStartedPushAt: new Date() },
  });
  if (firstJoin > 0) {
    const otherPartyId = isPatient ? appointment.doctorId : appointment.patientId;
    void sendPushToUser(otherPartyId, {
      key: "videoStarted",
      values: { name: authUser.name },
      url: isPatient ? `/doctor/video/${id}` : `/patient/video/${id}`,
    });
  }

  // The token is bound to this person's own uid (their user id).
  const uid = authUser.id;
  const { appId, token } = generateAgoraToken(id, uid);
  return NextResponse.json({ appId, token, channel: id, uid, expiresInSeconds: TOKEN_TTL_SECONDS });
}
