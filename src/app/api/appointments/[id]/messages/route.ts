import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// Chat is only open once a booking has been accepted — matches the "once the
// doctor accepts, patient and doctor can chat" requirement — and stays open
// after completion for post-visit follow-up questions.
const CHAT_ENABLED_STATUSES = ["SCHEDULED", "COMPLETED"];

async function loadAndAuthorize(id: string, userId: string) {
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
  const { error } = await loadAndAuthorize(id, authUser.id);
  if (error) return error;

  const { text } = await req.json();
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
  }

  const message = await prisma.message.create({
    data: { appointmentId: id, senderId: authUser.id, text: text.trim().slice(0, 2000) },
    include: { sender: { select: { id: true, name: true, role: true } } },
  });

  return NextResponse.json(message);
}
