import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, safeNum } from "@/lib/adminAuth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

  const appointment = await prisma.appointment.findUnique({
    where: { id },
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
    },
  });

  if (!appointment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ...appointment,
    amount: safeNum(appointment.amount),
    platformFee: safeNum(appointment.platformFee),
  });
}
