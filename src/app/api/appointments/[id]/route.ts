import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// Valid status transitions a doctor may make, keyed by the appointment's current status
const DOCTOR_TRANSITIONS: Record<string, string[]> = {
  PENDING_APPROVAL: ["SCHEDULED", "REJECTED"],
  SCHEDULED: ["COMPLETED", "CANCELLED"],
};

// GET: A single appointment, visible only to its own patient or doctor
// (used for lightweight polling, e.g. live travel-status tracking)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: {
      doctor: { select: { name: true, doctorProfile: { select: { specialty: true } } } },
      patient: { select: { name: true } },
    },
  });
  if (!appointment || (appointment.patientId !== authUser.id && appointment.doctorId !== authUser.id)) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  return NextResponse.json(appointment);
}

// PATCH: Doctor accepts/rejects/completes/cancels their own appointment;
// patient cancels their own not-yet-completed appointment.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const { status, doctorNotes } = await req.json();

  if (authUser.role === "DOCTOR") {
    if (appointment.doctorId !== authUser.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
    const allowed = DOCTOR_TRANSITIONS[appointment.status] ?? [];
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    if (status === "COMPLETED" && appointment.consultType === "HOME" && appointment.travelStatus !== "ARRIVED") {
      return NextResponse.json(
        { error: "Mark your journey as arrived before completing this home visit." },
        { status: 400 }
      );
    }
    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        status,
        doctorNotes: doctorNotes ?? appointment.doctorNotes,
        ...(status === "COMPLETED" && appointment.paymentMethod === "CASH"
          ? { paymentStatus: "PAID" }
          : {}),
      },
    });
    return NextResponse.json(updated);
  }

  if (authUser.role === "PATIENT") {
    if (appointment.patientId !== authUser.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
    if (status !== "CANCELLED" || !["PENDING_APPROVAL", "SCHEDULED"].includes(appointment.status)) {
      return NextResponse.json({ error: "Invalid status transition" }, { status: 400 });
    }
    const updated = await prisma.appointment.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Not authorized" }, { status: 403 });
}
