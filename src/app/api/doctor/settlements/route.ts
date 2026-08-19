import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserAny } from "@/lib/auth";

// GET: the current doctor's own past settlements, newest first
export async function GET(req: Request) {
  const authUser = await getAuthUserAny(req);
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const settlements = await prisma.settlement.findMany({
    where: { doctorId: authUser.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(settlements);
}
