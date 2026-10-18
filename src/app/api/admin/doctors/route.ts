import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(req: Request) {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const doctors = await prisma.user.findMany({
    where: { role: "DOCTOR", deletedAt: null },
    // Never ship password hashes to the browser.
    omit: { password: true },
    include: {
      doctorProfile: true,
      clinics: { where: { deletedAt: null }, select: { id: true } },
      changeRequests: { where: { status: "PENDING" }, select: { id: true }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  const filtered = status
    ? doctors.filter((d) => d.doctorProfile?.status === status)
    : doctors;

  return NextResponse.json(filtered);
}
