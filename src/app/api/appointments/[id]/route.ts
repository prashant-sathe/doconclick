import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { expireStalePendingRequests } from "@/lib/expireAppointments";
import { sendPushToUser } from "@/lib/firebaseAdmin";

const PATIENT_PUSH_COPY: Record<string, { title: string; body: (doctorName: string) => string; url: string }> = {
  SCHEDULED: { title: "Appointment confirmed!", body: (d) => `${d} accepted your request.`, url: "/patient/appointments" },
  REJECTED: { title: "Request declined", body: (d) => `${d} was unable to accept your request.`, url: "/patient/appointments" },
  COMPLETED: { title: "Consultation completed", body: (d) => `Your visit with ${d} is complete.`, url: "/patient/appointments" },
  CANCELLED: { title: "Appointment cancelled", body: (d) => `Your appointment with ${d} was cancelled.`, url: "/patient/appointments" },
};

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
  await expireStalePendingRequests();
  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const { status, doctorNotes } = await req.json();

  if (authUser.role === "DOCTOR") {
    if (appointment.doctorId !== authUser.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
    if (appointment.status === "EXPIRED") {
      return NextResponse.json(
        { error: "This request timed out and the patient has already been notified — it can no longer be accepted." },
        { status: 409 }
      );
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
    if (status === "COMPLETED" && appointment.paymentMethod === "ONLINE" && appointment.paymentStatus !== "PAID") {
      return NextResponse.json(
        { error: "The patient hasn't completed payment yet. You can mark this consultation complete once payment is received." },
        { status: 400 }
      );
    }
    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        status,
        doctorNotes: doctorNotes ?? appointment.doctorNotes,
        ...(status === "SCHEDULED" ? { acceptedAt: new Date() } : {}),
        ...(status === "COMPLETED" && appointment.paymentMethod === "CASH"
          ? { paymentStatus: "PAID" }
          : {}),
      },
    });
    const copy = PATIENT_PUSH_COPY[status];
    if (copy) {
      void sendPushToUser(appointment.patientId, {
        title: copy.title,
        body: copy.body(authUser.name),
        url: copy.url,
      });
    }
    return NextResponse.json(updated);
  }

  if (authUser.role === "PATIENT") {
    if (appointment.patientId !== authUser.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
    if (status !== "CANCELLED" || appointment.status !== "PENDING_APPROVAL") {
      return NextResponse.json(
        { error: "This appointment can no longer be cancelled." },
        { status: 400 }
      );
    }
    const updated = await prisma.appointment.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    void sendPushToUser(appointment.doctorId, {
      title: "Appointment cancelled",
      body: `${authUser.name} cancelled their appointment request.`,
      url: "/doctor/dashboard",
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Not authorized" }, { status: 403 });
}
