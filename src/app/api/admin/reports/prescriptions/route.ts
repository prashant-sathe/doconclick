import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, parseDateRange } from "@/lib/adminAuth";

// GET: prescriptions/documents uploaded for completed bookings — one row per attachment, for audit.
export async function GET(req: Request) {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const range = parseDateRange(searchParams);

  const appointments = await prisma.appointment.findMany({
    where: {
      status: "COMPLETED",
      OR: [{ attachments: { some: {} } }, { medicines: { some: {} } }, { prescriptionUrl: { not: null } }],
    },
    select: {
      id: true,
      scheduledAt: true,
      patient: { select: { name: true, mobile: true } },
      doctor: { select: { name: true } },
      prescriptionUrl: true,
      medicines: { select: { name: true } },
      attachments: {
        select: { url: true, fileName: true, createdAt: true },
        ...(range.gte || range.lte ? { where: { createdAt: range } } : {}),
      },
    },
    orderBy: { scheduledAt: "desc" },
  });

  const rows = appointments.flatMap((a) => {
    const base = {
      appointmentId: a.id,
      patientName: a.patient.name,
      patientMobile: a.patient.mobile,
      doctorName: a.doctor.name,
      scheduledAt: a.scheduledAt,
      medicineCount: a.medicines.length,
    };
    if (a.attachments.length === 0 && a.prescriptionUrl) {
      return [{ ...base, fileName: "prescription (legacy)", url: a.prescriptionUrl, uploadedAt: a.scheduledAt }];
    }
    return a.attachments.map((att) => ({
      ...base,
      fileName: att.fileName ?? "attachment",
      url: att.url,
      uploadedAt: att.createdAt,
    }));
  });

  return NextResponse.json({
    summary: {
      completedBookingsWithDocs: appointments.length,
      totalAttachments: rows.length,
    },
    rows,
  });
}
