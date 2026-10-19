import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, type JWTPayload } from "@/lib/auth";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { requireActiveProvider } from "@/lib/providerGuard";
import { resolveDoctorScope } from "@/lib/staffGuard";
import { readJson } from "@/lib/routeGuards";
import { chatState, getChatFollowUpDays } from "@/lib/chatAccess";

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

// `authUser` rather than a bare userId — a STAFF caller's own id never
// matches appointment.doctorId directly, so it needs their assigned
// doctor's id resolved via resolveDoctorScope instead. `purpose` is what the
// caller wants to do: reading works for most statuses, sending only while
// the chat is open (src/lib/chatAccess.ts).
export async function loadAndAuthorize(id: string, authUser: JWTPayload, purpose: "read" | "send") {
  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment) {
    return { error: NextResponse.json({ error: "Appointment not found" }, { status: 404 }) };
  }
  let authorized = appointment.patientId === authUser.id || appointment.doctorId === authUser.id;
  if (!authorized && authUser.role === "STAFF") {
    const scope = await resolveDoctorScope(authUser);
    authorized = !scope.denied && appointment.doctorId === scope.doctorId;
  }
  if (!authorized) {
    return { error: NextResponse.json({ error: "Appointment not found" }, { status: 404 }) };
  }
  const chat = chatState(appointment, await getChatFollowUpDays());
  if (purpose === "read" ? !chat.canRead : !chat.canSend) {
    return { error: NextResponse.json({ error: chat.reason, code: "CHAT_CLOSED" }, { status: 403 }) };
  }
  return { appointment, chat };
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
  const { error, chat } = await loadAndAuthorize(id, authUser, "read");
  if (error) return error;

  const messages = await prisma.message.findMany({
    where: { appointmentId: id },
    orderBy: { createdAt: "asc" },
    include: { sender: { select: { id: true, name: true, role: true } } },
  });

  // `chat` tells the UI whether to show the composer, and why not.
  return NextResponse.json({ messages, chat: { canSend: chat!.canSend, reason: chat!.reason, sendUntil: chat!.sendUntil } });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (authUser.role === "DOCTOR" || authUser.role === "NURSE") {
    const suspendedResponse = await requireActiveProvider(authUser);
    if (suspendedResponse) return suspendedResponse;
  }

  const { id } = await params;
  const { error, appointment } = await loadAndAuthorize(id, authUser, "send");
  if (error) return error;

  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;
  const { text, fileUrl, fileName, fileType } = body;
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
    url: recipientIsDoctor
      ? `/${appointment!.providerType === "NURSE" ? "nurse" : "doctor"}/chat/${id}`
      : `/patient/chat/${id}`,
  });

  return NextResponse.json(message);
}
