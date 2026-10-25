import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, safeNum } from "@/lib/adminAuth";
import { ADMIN_AUDIT_INCLUDE } from "@/lib/appointmentView";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

  const appointment = await prisma.appointment.findUnique({
    where: { id },
    // The visit code is the patient's to share at the door, and the provider's
    // live position is only for the patient during the journey.
    omit: { visitOtp: true, visitOtpAttempts: true, doctorLat: true, doctorLng: true, doctorLocationUpdatedAt: true, ...ADMIN_AUDIT_INCLUDE },
    include: {
      patient: {
        select: {
          name: true, mobile: true, email: true,
          patientProfile: { select: { age: true, gender: true, homeAddress: true } },
        },
      },
      doctor: {
        select: {
          name: true, mobile: true,
          doctorProfile: { select: { specialty: true, qualification: true, medRegNo: true, clinicName: true, signatureUrl: true } },
        },
      },
      medicines: true,
      tests: true,
      attachments: { orderBy: { createdAt: "asc" } },
      reassignedTo: { select: { id: true, status: true, doctor: { select: { name: true } } } },
    },
  });

  if (!appointment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // The booking's money trail: its wallet payment and any refund/credit back
  // (both unique per appointment), plus the admin who acted on it, if any.
  const [ledger, adminActionByUser] = await Promise.all([
    prisma.walletTransaction.findMany({
      where: { OR: [{ appointmentId: id }, { refundOfAppointmentId: id }] },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, type: true, amount: true, balanceAfter: true, status: true, note: true, createdAt: true,
        admin: { select: { name: true } },
      },
    }),
    appointment.adminActionBy
      ? prisma.user.findUnique({ where: { id: appointment.adminActionBy }, select: { name: true } })
      : null,
  ]);

  return NextResponse.json({
    ...appointment,
    amount: safeNum(appointment.amount),
    platformFee: safeNum(appointment.platformFee),
    ledger,
    adminActionByName: adminActionByUser?.name ?? null,
  });
}
