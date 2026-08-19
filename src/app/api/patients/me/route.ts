import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserAny } from "@/lib/auth";

const EDITABLE_FIELDS = [
  "location",
  "homeAddress",
  "landmark",
  "pinCode",
  "bloodGroup",
  "height",
  "weight",
  "allergies",
  "chronicDiseases",
  "medications",
  "surgeries",
  "emergencyContactName",
  "emergencyContactPhone",
  "photoUrl",
  "lat",
  "lng",
] as const;

// GET: The logged-in patient's own profile
export async function GET(req: Request) {
  const authUser = await getAuthUserAny(req);
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
  const authUser = await getAuthUserAny(req);
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const data: Record<string, string | number | null> = {};

  for (const key of EDITABLE_FIELDS) {
    if (!(key in body)) continue;
    const value = body[key];
    if (key === "height" || key === "weight" || key === "lat" || key === "lng") {
      data[key] = value === "" || value == null ? null : Number(value);
    } else {
      data[key] = value === "" || value == null ? null : String(value);
    }
  }

  try {
    const updated = await prisma.patientProfile.update({
      where: { userId: authUser.id },
      data,
    });
    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });
  }
}
