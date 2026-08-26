import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { sendPushToUser } from "@/lib/firebaseAdmin";

// Chat is only open once a booking has been accepted — matches the "once the
// doctor accepts, patient and doctor can chat" requirement — and stays open
// after completion for post-visit follow-up questions.
const CHAT_ENABLED_STATUSES = ["SCHEDULED", "COMPLETED"];

// A message's fileUrl must point at our own upload bucket — it's only ever
// meant to be set from the upload endpoint's response, never a client-typed
// URL (e.g. to avoid using chat as an arbitrary image-beaconing vector).
function isOwnAttachmentUrl(url: string): boolean {
  const bucket = process.env.S3_BUCKET_NAME;
  const region = process.env.AWS_REGION;
  if (!bucket || !region) return false;
  try {
    return new URL(url).hostname === `${bucket}.s3.${region}.amazonaws.com`;
  } catch {
    return false;
  }
}

export async function loadAndAuthorize(id: string, userId: string) {
  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment || (appointment.patientId !== userId && appointment.doctorId !== userId)) {
    return { error: NextResponse.json({ error: "Appointment not found" }, { status: 404 }) };
  }
  if (!CHAT_ENABLED_STATUSES.includes(appointment.status)) {
    return {
      error: NextResponse.json(
        { error: "Chat opens once the doctor accepts this appointment." },
        { status: 403 }
      ),
    };
  }
  return { appointment };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const { error } = await loadAndAuthorize(id, authUser.id);
  if (error) return error;

  const messages = await prisma.message.findMany({
    where: { appointmentId: id },
    orderBy: { createdAt: "asc" },
    include: { sender: { select: { id: true, name: true, role: true } } },
  });

  return NextResponse.json(messages);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const { error, appointment } = await loadAndAuthorize(id, authUser.id);
  if (error) return error;

  const { text, fileUrl, fileName, fileType } = await req.json();
  const trimmedText = typeof text === "string" ? text.trim() : "";

  if (fileUrl !== undefined && fileUrl !== null) {
    if (typeof fileUrl !== "string" || !isOwnAttachmentUrl(fileUrl)) {
      return NextResponse.json({ error: "Invalid attachment" }, { status: 400 });
    }
  }
  if (!trimmedText && !fileUrl) {
    return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
  }

  const message = await prisma.message.create({
    data: {
      appointmentId: id,
      senderId: authUser.id,
      text: trimmedText.slice(0, 2000),
      fileUrl: fileUrl || undefined,
      fileName: typeof fileName === "string" ? fileName.slice(0, 255) : undefined,
      fileType: typeof fileType === "string" ? fileType.slice(0, 100) : undefined,
    },
    include: { sender: { select: { id: true, name: true, role: true } } },
  });

  const recipientIsDoctor = appointment!.patientId === authUser.id;
  const recipientId = recipientIsDoctor ? appointment!.doctorId : appointment!.patientId;
  void sendPushToUser(recipientId, {
    title: `New message from ${authUser.name}`,
    body: message.text ? message.text.slice(0, 120) : "Sent a file",
    url: recipientIsDoctor ? `/doctor/chat/${id}` : `/patient/chat/${id}`,
  });

  return NextResponse.json(message);
}
