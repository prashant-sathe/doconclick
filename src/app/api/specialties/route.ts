import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureSpecialtiesSeeded } from "@/lib/specialties";

// GET: Active specialties for doctor/patient pickers — bootstraps the
// table with the default list the first time it's ever called.
export async function GET() {
  await ensureSpecialtiesSeeded();

  const rows = await prisma.specialty.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { name: true, color: true },
  });
  return NextResponse.json(rows);
}
