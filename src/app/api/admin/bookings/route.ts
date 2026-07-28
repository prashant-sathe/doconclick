import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const appointments = await prisma.appointment.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      patient: { select: { name: true } },
      doctor: { select: { name: true } },
    },
  });
  return NextResponse.json(appointments);
}
