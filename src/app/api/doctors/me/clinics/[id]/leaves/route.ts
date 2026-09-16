import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { requireActiveDoctor } from "@/lib/doctorGuard";

async function loadOwnedClinic(doctorId: string, id: string) {
  const clinic = await prisma.clinic.findUnique({ where: { id } });
  if (!clinic || clinic.doctorId !== doctorId) return null;
  return clinic;
}

// GET: List upcoming/all leave dates for one of the logged-in doctor's clinics
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const clinic = await loadOwnedClinic(authUser.id, id);
  if (!clinic) {
    return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
  }

  const leaves = await prisma.clinicLeave.findMany({
    where: { clinicId: id },
    orderBy: { date: "asc" },
  });
  return NextResponse.json({ leaves });
}

// POST: Add a leave/holiday date for one of the logged-in doctor's clinics
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const suspendedResponse = await requireActiveDoctor(authUser);
  if (suspendedResponse) return suspendedResponse;

  const { id } = await params;
  const clinic = await loadOwnedClinic(authUser.id, id);
  if (!clinic) {
    return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
  }

  const { date, reason } = await req.json();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "A valid date (YYYY-MM-DD) is required." }, { status: 400 });
  }

  try {
    const leave = await prisma.clinicLeave.create({
      data: { clinicId: id, date, reason: reason?.trim() ? reason.trim() : null },
    });
    return NextResponse.json(leave);
  } catch {
    return NextResponse.json({ error: "That date is already marked as a leave day." }, { status: 409 });
  }
}
