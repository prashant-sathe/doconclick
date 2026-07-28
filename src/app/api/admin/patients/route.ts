import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const patients = await prisma.user.findMany({
    where: { role: "PATIENT" },
    include: {
      patientProfile: true,
      asPatient: { select: { id: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(patients);
}
