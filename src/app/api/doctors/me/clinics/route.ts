import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { formatDoctorName } from "@/lib/utils";
import { requireActiveDoctor } from "@/lib/doctorGuard";
import { validateClinicInput } from "@/lib/clinicInput";
import { withErrorLocale } from "@/lib/apiErrors";

// GET: The currently logged-in doctor's clinics (+ their slots)
export const GET = withErrorLocale(async function GET() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const suspendedResponse = await requireActiveDoctor(authUser);
  if (suspendedResponse) return suspendedResponse;

  const clinics = await prisma.clinic.findMany({
    where: { doctorId: authUser.id, deletedAt: null },
    orderBy: { sortOrder: "asc" },
    include: { slots: true },
  });
  return NextResponse.json(clinics);
});

// POST: Add a new clinic location for the logged-in doctor
export const POST = withErrorLocale(async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const suspendedResponse = await requireActiveDoctor(authUser);
  if (suspendedResponse) return suspendedResponse;

  const input = validateClinicInput(await req.json().catch(() => ({})));
  if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });
  const body = input.clinic;

  const clinic = await prisma.clinic.create({
    data: {
      doctorId: authUser.id,
      name: body.name || `${formatDoctorName(authUser.name)}'s Clinic`,
      address: body.address,
      photoUrl: body.photoUrl,
      lat: body.lat,
      lng: body.lng,
      sortOrder: body.sortOrder ?? 0,
      slots: { create: body.slots.map((s) => ({ dayOfWeek: s.dayOfWeek, fromTime: s.fromTime, toTime: s.toTime })) },
    },
    include: { slots: true },
  });
  return NextResponse.json(clinic);
});
