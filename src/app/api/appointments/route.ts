import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const { patientId, doctorId, symptoms, consultType, amount } = await req.json();

  const settings = await prisma.platformSettings.findFirst();
  const commission = settings?.commissionPercent ?? 10;
  const platformFee = (amount * commission) / 100;

  const appointment = await prisma.appointment.create({
    data: {
      patientId,
      doctorId,
      symptoms,
      consultType,
      amount: Number(amount),
      platformFee,
      status: "SCHEDULED",
    },
    include: {
      patient: { select: { name: true } },
      doctor: { select: { name: true } },
    },
  });

  return NextResponse.json(appointment);
}
