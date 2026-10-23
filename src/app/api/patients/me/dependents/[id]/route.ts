import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, readJson } from "@/lib/routeGuards";
import { parseBody, dependentUpdateSchema, dependentData } from "@/lib/schemas";
import { withErrorLocale } from "@/lib/apiErrors";

async function ownDependent(id: string, userId: string) {
  const dependent = await prisma.patientDependent.findUnique({
    where: { id },
    include: { patientProfile: { select: { userId: true } } },
  });
  return dependent && dependent.patientProfile.userId === userId ? dependent : null;
}

// GET: one saved family-member profile (the Family screen's edit form)
export const GET = withErrorLocale(async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { authUser, denied } = await requireRole("PATIENT");
  if (denied) return denied;

  const { id } = await params;
  if (!(await ownDependent(id, authUser.id))) {
    return NextResponse.json({ error: "Family member not found" }, { status: 404 });
  }

  // vitalsCount: readings the delete would take with it (shown in the confirm).
  const [dependent, vitalsCount] = await Promise.all([
    prisma.patientDependent.findUniqueOrThrow({ where: { id } }),
    prisma.vitalReading.count({ where: { dependentId: id } }),
  ]);
  return NextResponse.json({ ...dependent, vitalsCount });
});

// PATCH: update a saved family-member profile
export const PATCH = withErrorLocale(async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { authUser, denied } = await requireRole("PATIENT");
  if (denied) return denied;

  const { id } = await params;
  if (!(await ownDependent(id, authUser.id))) {
    return NextResponse.json({ error: "Family member not found" }, { status: 404 });
  }

  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;
  const parsed = parseBody(dependentUpdateSchema, body);
  if (parsed.response) return parsed.response;

  const updated = await prisma.patientDependent.update({
    where: { id },
    data: { ...dependentData(parsed.data), ...(parsed.data.relation ? { relation: parsed.data.relation } : {}) },
  });

  return NextResponse.json(updated);
});

// DELETE: remove a saved family-member profile. Any past appointments keep
// their own patientName/relation snapshot and just lose the dependentId
// link (schema default SetNull), so history isn't affected — but their
// vitals readings are deleted with them (VitalReading cascades).
export const DELETE = withErrorLocale(async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { authUser, denied } = await requireRole("PATIENT");
  if (denied) return denied;

  const { id } = await params;
  if (!(await ownDependent(id, authUser.id))) {
    return NextResponse.json({ error: "Family member not found" }, { status: 404 });
  }

  await prisma.patientDependent.delete({ where: { id } });
  return NextResponse.json({ success: true });
});
