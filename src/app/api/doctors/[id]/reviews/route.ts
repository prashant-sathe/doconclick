import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicName } from "@/lib/publicName";
import { withErrorLocale } from "@/lib/apiErrors";

// GET: Recent reviews for a doctor's public profile. Unauthenticated, so the
// reviewer is only "Raj S." — never the full name or any patient id.
export const GET = withErrorLocale(async function GET(
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

  return NextResponse.json(
    reviews.map(({ patient, ...r }) => ({ ...r, reviewer: publicName(patient.name) }))
  );
});
