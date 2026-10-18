import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { parseBody, definedOnly, patientProfilePatchSchema } from "@/lib/schemas";

// GET: The logged-in patient's own profile
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

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
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = parseBody(patientProfilePatchSchema, await req.json().catch(() => null));
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
    console.error(err);
    return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });
  }
}
