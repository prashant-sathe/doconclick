import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const complaints = await prisma.complaint.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, role: true } } },
  });
  return NextResponse.json(complaints);
}

export async function PATCH(req: Request) {
  const { id, status } = await req.json();
  const updated = await prisma.complaint.update({
    where: { id },
    data: { status },
  });
  return NextResponse.json(updated);
}
