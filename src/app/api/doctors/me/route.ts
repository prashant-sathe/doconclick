import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// GET: The currently logged-in doctor's own profile
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const doctor = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: {
      id: true,
      name: true,
      mobile: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      doctorProfile: true,
    },
  });

  if (!doctor) {
    return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  }

  return NextResponse.json(doctor);
}

const EDITABLE_FIELDS = [
  "specialty",
  "qualification",
  "medRegNo",
  "experience",
  "consultFee",
  "videoFee",
  "homeVisitFee",
  "availability",
  "radius",
  "offersHomeVisit",
  "languages",
  "bio",
  "bankDetails",
  "address",
  "lat",
  "lng",
] as const;

// PATCH: Update the logged-in doctor's own profile
export async function PATCH(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const data: Record<string, string | number | boolean | null> = {};

  for (const key of EDITABLE_FIELDS) {
    if (!(key in body)) continue;
    const value = body[key];
    if (key === "experience") {
      data[key] = value === "" || value == null ? 0 : Number(value);
    } else if (key === "consultFee" || key === "videoFee" || key === "homeVisitFee") {
      data[key] = value === "" || value == null ? 0 : Number(value);
    } else if (key === "radius") {
      data[key] = Math.min(20, Math.max(5, Number(value) || 5));
    } else if (key === "lat" || key === "lng") {
      data[key] = value === "" || value == null ? null : Number(value);
    } else if (key === "offersHomeVisit") {
      data[key] = Boolean(value);
    } else {
      data[key] = value === "" || value == null ? null : String(value);
    }
  }

  try {
    const updated = await prisma.doctorProfile.update({
      where: { userId: authUser.id },
      data,
    });
    return NextResponse.json(updated);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "This registration number is already in use." }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });
  }
}
