import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserAny } from "@/lib/auth";
import { deleteFromS3ByUrl } from "@/lib/s3";

// DELETE: Doctor removes an attachment they uploaded to their own appointment
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const authUser = await getAuthUserAny(req);
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id, attachmentId } = await params;
  const attachment = await prisma.prescriptionAttachment.findUnique({
    where: { id: attachmentId },
    include: { appointment: { select: { doctorId: true } } },
  });
  if (!attachment || attachment.appointmentId !== id || attachment.appointment.doctorId !== authUser.id) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  await prisma.prescriptionAttachment.delete({ where: { id: attachmentId } });
  await deleteFromS3ByUrl(attachment.url);

  return NextResponse.json({ success: true });
}
