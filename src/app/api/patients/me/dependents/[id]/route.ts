import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserAny } from "@/lib/auth";

// DELETE: remove a saved family-member profile. Any past appointments keep
// their own patientName/relation snapshot and just lose the dependentId
// link (schema default SetNull), so history isn't affected.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUserAny(req);
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const dependent = await prisma.patientDependent.findUnique({
    where: { id },
    include: { patientProfile: { select: { userId: true } } },
  });
  if (!dependent || dependent.patientProfile.userId !== authUser.id) {
    return NextResponse.json({ error: "Family member not found" }, { status: 404 });
  }

  await prisma.patientDependent.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
