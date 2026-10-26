import { NextResponse } from "next/server";
import { verifyVisitCoordinates } from "@/lib/visitVerify";
import { prisma } from "@/lib/prisma";
import { requireRole, readJson, isRecordNotFound } from "@/lib/routeGuards";
import { parseBody, definedOnly, patientProfilePatchSchema } from "@/lib/schemas";
import { withErrorLocale } from "@/lib/apiErrors";

// GET: The logged-in patient's own profile
export const GET = withErrorLocale(async function GET() {
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
});

// PATCH: Update the logged-in patient's own profile
export const PATCH = withErrorLocale(async function PATCH(req: Request) {
  const { authUser, denied } = await requireRole("PATIENT");
  if (denied) return denied;

  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;
  const parsed = parseBody(patientProfilePatchSchema, body);
  if (parsed.response) return parsed.response;
  const data: Record<string, string | number | null> = definedOnly(parsed.data);

  // The saved home coordinates are what bookings trust for the home address
  // (src/lib/visitVerify.ts), so they must belong to it: new coordinates are
  // checked against the address they're saved with; a new address without a
  // new pin keeps the old pin only if it still matches.
  const sentCoords = typeof data.lat === "number" && typeof data.lng === "number";
  if (sentCoords || typeof data.homeAddress === "string") {
    const current = await prisma.patientProfile.findUnique({ where: { userId: authUser.id }, select: { homeAddress: true, pinCode: true, lat: true, lng: true } });
    const address = (data.homeAddress as string | undefined) ?? current?.homeAddress ?? null;
    const pinCode = (data.pinCode as string | undefined) ?? current?.pinCode ?? null;
    const lat = sentCoords ? (data.lat as number) : current?.lat ?? null;
    const lng = sentCoords ? (data.lng as number) : current?.lng ?? null;
    const addressChanged = typeof data.homeAddress === "string" && data.homeAddress !== current?.homeAddress;
    if (address && lat != null && lng != null && (sentCoords || addressChanged)) {
      const check = await verifyVisitCoordinates(
        { visitAddress: address, visitLandmark: null, visitPinCode: pinCode, visitLat: lat, visitLng: lng },
        null,
      );
      if ("problem" in check) {
        if (sentCoords) {
          return NextResponse.json({ error: check.problem.error, code: check.problem.code }, { status: check.problem.status });
        }
        // The old pin doesn't belong to the new address — drop it rather
        // than let a booking trust it (the address page asks for a new pin).
        data.lat = null;
        data.lng = null;
      }
    }
  }

  try {
    let updated;
    try {
      updated = await prisma.patientProfile.update({ where: { userId: authUser.id }, data });
    } catch (err) {
      // A dev server still running against a pre-migration Prisma client will
      // reject the newer `searchRadiusKm` / `reminderLeadMinutes` fields — save
      // the rest rather than failing the whole request. Self-heals once the
      // server is restarted.
      if ("searchRadiusKm" in data || "reminderLeadMinutes" in data) {
        delete data.searchRadiusKm;
        delete data.reminderLeadMinutes;
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
});
