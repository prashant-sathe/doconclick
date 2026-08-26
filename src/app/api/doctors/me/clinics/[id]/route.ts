import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { formatDoctorName } from "@/lib/utils";
import { requireActiveDoctor } from "@/lib/doctorGuard";

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
  isActive?: boolean;
  slots: SlotInput[];
}

async function loadOwnedClinic(doctorId: string, id: string) {
  const clinic = await prisma.clinic.findUnique({ where: { id } });
  if (!clinic || clinic.doctorId !== doctorId) return null;
  return clinic;
}

// PATCH: Update one of the logged-in doctor's clinics (fields + slots, slots are replaced wholesale)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const suspendedResponse = await requireActiveDoctor(authUser);
  if (suspendedResponse) return suspendedResponse;

  const { id } = await params;
  const existing = await loadOwnedClinic(authUser.id, id);
  if (!existing) {
    return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
  }

  const body: ClinicInput = await req.json();
  if (!body.address?.trim() || body.lat == null || body.lng == null) {
    return NextResponse.json({ error: "Address and location are required." }, { status: 400 });
  }
  if (!body.slots?.length) {
    return NextResponse.json({ error: "Please set at least one day-wise time slot." }, { status: 400 });
  }

  const [, , clinic] = await prisma.$transaction([
    prisma.clinicSlot.deleteMany({ where: { clinicId: id } }),
    prisma.clinicSlot.createMany({
      data: (body.slots ?? []).map((s) => ({ clinicId: id, dayOfWeek: s.dayOfWeek, fromTime: s.fromTime, toTime: s.toTime })),
    }),
    prisma.clinic.update({
      where: { id },
      data: {
        name: body.name?.trim() || `${formatDoctorName(authUser.name)}'s Clinic`,
        address: body.address.trim(),
        photoUrl: body.photoUrl || null,
        lat: body.lat,
        lng: body.lng,
        sortOrder: body.sortOrder ?? existing.sortOrder,
        isActive: body.isActive ?? existing.isActive,
      },
      include: { slots: true },
    }),
  ]);

  return NextResponse.json(clinic);
}

// DELETE: Remove one of the logged-in doctor's clinics
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const suspendedResponse = await requireActiveDoctor(authUser);
  if (suspendedResponse) return suspendedResponse;

  const { id } = await params;
  const existing = await loadOwnedClinic(authUser.id, id);
  if (!existing) {
    return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
  }

  await prisma.clinic.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
