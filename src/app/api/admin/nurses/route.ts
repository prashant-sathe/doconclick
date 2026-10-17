import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

// GET ?status= — every nurse with their profile and offered services.
export async function GET(req: Request) {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const status = new URL(req.url).searchParams.get("status");
  const nurses = await prisma.user.findMany({
    where: { role: "NURSE", deletedAt: null, ...(status ? { nurseProfile: { status } } : {}) },
    omit: { password: true },
    include: {
      nurseProfile: { include: { services: { include: { service: { select: { name: true } } } } } },
      _count: { select: { asDoctor: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(nurses);
}
