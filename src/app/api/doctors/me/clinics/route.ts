import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { formatDoctorName } from "@/lib/utils";

interface SlotInput {
  dayOfWeek: string;
  fromTime: string;
  toTime: string;
}

interface ClinicInput {
  name: string;
  address: string;
  photoUrl?: string | null;
  lat: number;
  lng: number;
  sortOrder?: number;
  slots: SlotInput[];
}

// GET: The currently logged-in doctor's clinics (+ their slots)
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const clinics = await prisma.clinic.findMany({
    where: { doctorId: authUser.id },
    orderBy: { sortOrder: "asc" },
    include: { slots: true },
  });
  return NextResponse.json(clinics);
}

// POST: Add a new clinic location for the logged-in doctor
export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body: ClinicInput = await req.json();
  if (!body.address?.trim() || body.lat == null || body.lng == null) {
    return NextResponse.json({ error: "Address and location are required." }, { status: 400 });
  }
  if (!body.slots?.length) {
    return NextResponse.json({ error: "Please set at least one day-wise time slot." }, { status: 400 });
  }

  const clinic = await prisma.clinic.create({
    data: {
      doctorId: authUser.id,
      name: body.name?.trim() || `${formatDoctorName(authUser.name)}'s Clinic`,
      address: body.address.trim(),
      photoUrl: body.photoUrl || null,
      lat: body.lat,
      lng: body.lng,
      sortOrder: body.sortOrder ?? 0,
      slots: { create: (body.slots ?? []).map((s) => ({ dayOfWeek: s.dayOfWeek, fromTime: s.fromTime, toTime: s.toTime })) },
    },
    include: { slots: true },
  });
  return NextResponse.json(clinic);
}
