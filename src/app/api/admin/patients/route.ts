import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET() {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const patients = await prisma.user.findMany({
    where: { role: "PATIENT", deletedAt: null },
    // Never ship password hashes to the browser.
    omit: { password: true },
    include: {
      patientProfile: true,
      asPatient: { select: { id: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(patients);
}
