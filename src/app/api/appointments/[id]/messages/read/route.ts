import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { loadAndAuthorize } from "../route";
import { withErrorLocale } from "@/lib/apiErrors";

// PATCH: mark every message the other party sent in this thread as read by
// the caller — called when a chat thread is opened, so the unread badge on
// the appointment list clears.
export const PATCH = withErrorLocale(async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const { error, appointment } = await loadAndAuthorize(id, authUser, "read");
  if (error) return error;

  // The doctor and their staff are one side. Staff opening the thread must not
  // clear the doctor's unread badge (readAt is shared), so only the patient and
  // the provider mark; the provider marks only the patient's messages.
  if (authUser.id === appointment!.patientId) {
    await prisma.message.updateMany({
      where: { appointmentId: id, senderId: { not: authUser.id }, readAt: null },
      data: { readAt: new Date() },
    });
  } else if (authUser.id === appointment!.doctorId) {
    await prisma.message.updateMany({
      where: { appointmentId: id, sender: { role: "PATIENT" }, readAt: null },
      data: { readAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
});
