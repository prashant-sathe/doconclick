import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const doctors = await prisma.user.findMany({
    where: { role: "DOCTOR", deletedAt: null },
    include: {
      doctorProfile: true,
      clinics: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const filtered = status
    ? doctors.filter((d) => d.doctorProfile?.status === status)
    : doctors;

  return NextResponse.json(filtered);
}
