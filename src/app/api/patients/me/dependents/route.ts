import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, readJson } from "@/lib/routeGuards";
import { parseBody, dependentCreateSchema, dependentData } from "@/lib/schemas";

// GET: the current patient's saved family-member profiles
export async function GET() {
  const { authUser, denied } = await requireRole("PATIENT");
  if (denied) return denied;

  const profile = await prisma.patientProfile.findUnique({ where: { userId: authUser.id } });
  if (!profile) return NextResponse.json([]);

  const dependents = await prisma.patientDependent.findMany({
    where: { patientProfileId: profile.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(dependents);
}

// POST: save a new family member's medical profile
export async function POST(req: Request) {
  const { authUser, denied } = await requireRole("PATIENT");
  if (denied) return denied;

  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;
  const parsed = parseBody(dependentCreateSchema, body);
  if (parsed.response) return parsed.response;

  const profile = await prisma.patientProfile.findUnique({ where: { userId: authUser.id } });
  if (!profile) {
    return NextResponse.json({ error: "Complete your own profile first." }, { status: 400 });
  }

  const dependent = await prisma.patientDependent.create({
    data: {
      patientProfileId: profile.id,
      relation: parsed.data.relation,
      ...dependentData(parsed.data),
    },
  });

  return NextResponse.json(dependent);
}
