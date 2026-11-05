import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { deleteFromS3 } from "@/lib/s3";
import { LAB_REPORT_FOLDER } from "@/lib/labBookings";

// DELETE: removes a report uploaded by mistake — from the booking, from the
// patient's vault (if they still have that copy) and from S3.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; reportId: string }> }) {
  const { denied } = await requireAdmin();
  if (denied) return denied;
  const { id, reportId } = await params;
  const report = await prisma.labReport.findUnique({ where: { id: reportId } });
  if (!report || report.bookingId !== id) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  await prisma.$transaction(async (tx) => {
    await tx.labReport.delete({ where: { id: report.id } });
    if (report.documentId) await tx.patientDocument.deleteMany({ where: { id: report.documentId, fileUrl: report.fileUrl } });
  });
  await deleteFromS3(report.fileUrl, LAB_REPORT_FOLDER);
  return NextResponse.json({ ok: true });
}
