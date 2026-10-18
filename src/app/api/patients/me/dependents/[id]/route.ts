import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, readJson } from "@/lib/routeGuards";
import { parseBody, dependentUpdateSchema, dependentData } from "@/lib/schemas";

// PATCH: update a saved family-member profile
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { authUser, denied } = await requireRole("PATIENT");
  if (denied) return denied;

  const { id } = await params;
  const dependent = await prisma.patientDependent.findUnique({
    where: { id },
    include: { patientProfile: { select: { userId: true } } },
  });
  if (!dependent || dependent.patientProfile.userId !== authUser.id) {
    return NextResponse.json({ error: "Family member not found" }, { status: 404 });
  }

  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;
  const parsed = parseBody(dependentUpdateSchema, body);
  if (parsed.response) return parsed.response;

  const updated = await prisma.patientDependent.update({
    where: { id },
    data: dependentData(parsed.data),
  });

  return NextResponse.json(updated);
}

// DELETE: remove a saved family-member profile. Any past appointments keep
// their own patientName/relation snapshot and just lose the dependentId
// link (schema default SetNull), so history isn't affected.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { authUser, denied } = await requireRole("PATIENT");
  if (denied) return denied;

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
