import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { generateAgoraToken } from "@/lib/agora";
import { VIDEO_UNLOCK_DELAY_SECONDS } from "@/lib/videoCall";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { requireActiveDoctor } from "@/lib/doctorGuard";

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
      { error: "Video call is only available for scheduled video consultations." },
      { status: 403 }
    );
  }
  if (appointment.paymentStatus !== "PAID") {
    return NextResponse.json(
      { error: "Payment is required before joining the video call." },
      { status: 403 }
    );
  }
  const unlockAt = appointment.paidAt
    ? appointment.paidAt.getTime() + VIDEO_UNLOCK_DELAY_SECONDS * 1000
    : 0; // defensive: PAID but no paidAt somehow — don't block
  if (Date.now() < unlockAt) {
    return NextResponse.json(
      { error: "Video call is unlocking…", availableAt: new Date(unlockAt).toISOString() },
      { status: 403 }
    );
  }

  const isPatient = authUser.id === appointment.patientId;
  const otherPartyId = isPatient ? appointment.doctorId : appointment.patientId;
  void sendPushToUser(otherPartyId, {
    title: "Video call started",
    body: `${authUser.name} has joined the video call.`,
    url: isPatient ? `/doctor/video/${id}` : `/patient/video/${id}`,
  });

  const { appId, token } = generateAgoraToken(id);
  return NextResponse.json({ appId, token, channel: id });
}
