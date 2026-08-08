import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: Recent reviews for a doctor's public profile
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const reviews = await prisma.review.findMany({
    where: { doctorId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      rating: true,
      comment: true,
      createdAt: true,
      patient: { select: { name: true } },
    },
  });

  return NextResponse.json(reviews);
}
