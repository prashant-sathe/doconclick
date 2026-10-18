import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, readJson, isRecordNotFound } from "@/lib/routeGuards";
import { parseBody, definedOnly, patientProfilePatchSchema } from "@/lib/schemas";

// GET: The logged-in patient's own profile
export async function GET() {
  const { authUser, denied } = await requireRole("PATIENT");
  if (denied) return denied;

  const patient = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: {
      id: true,
      name: true,
      mobile: true,
      email: true,
      patientProfile: true,
    },
  });

  if (!patient) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  return NextResponse.json(patient);
}

// PATCH: Update the logged-in patient's own profile
export async function PATCH(req: Request) {
  const { authUser, denied } = await requireRole("PATIENT");
  if (denied) return denied;

  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;
  const parsed = parseBody(patientProfilePatchSchema, body);
  if (parsed.response) return parsed.response;
  const data: Record<string, string | number | null> = definedOnly(parsed.data);

  try {
    let updated;
    try {
      updated = await prisma.patientProfile.update({ where: { userId: authUser.id }, data });
    } catch (err) {
      // A dev server still running against a pre-migration Prisma client will
      // reject the newer `searchRadiusKm` field — save the rest rather than
      // failing the whole request. Self-heals once the server is restarted.
      if ("searchRadiusKm" in data) {
        delete data.searchRadiusKm;
        updated = await prisma.patientProfile.update({ where: { userId: authUser.id }, data });
      } else {
        throw err;
      }
    }
    return NextResponse.json(updated);
  } catch (err) {
    if (isRecordNotFound(err)) {
      return NextResponse.json({ error: "Patient profile not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Could not save your profile. Please try again." }, { status: 500 });
  }
}
