import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserAny } from "@/lib/auth";
import { sendPushToUser } from "@/lib/pushNotifications";

const VALID_STATUSES = ["ON_THE_WAY", "ARRIVED"];

// PATCH: Doctor starts/updates/ends a home-visit journey.
// Called once to start (ON_THE_WAY + initial position), then repeatedly while
// travelling to push updated coordinates, then once more with ARRIVED.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUserAny(req);
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment || appointment.doctorId !== authUser.id) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (appointment.consultType !== "HOME" || appointment.status !== "SCHEDULED") {
    return NextResponse.json({ error: "Live tracking only applies to confirmed home visits" }, { status: 400 });
  }

  const { travelStatus, lat, lng } = await req.json();
  if (!VALID_STATUSES.includes(travelStatus)) {
    return NextResponse.json({ error: "Invalid travel status" }, { status: 400 });
  }
  if (appointment.travelStatus === "ARRIVED") {
    return NextResponse.json({ error: "This visit has already arrived" }, { status: 400 });
  }

  try {
    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        travelStatus,
        ...(lat != null && lng != null
          ? { doctorLat: Number(lat), doctorLng: Number(lng), doctorLocationUpdatedAt: new Date() }
          : {}),
      },
    });
    sendPushToUser(appointment.patientId, {
      title: travelStatus === "ARRIVED" ? "Doctor has arrived" : "Doctor is on the way",
      body:
        travelStatus === "ARRIVED"
          ? "Your doctor has arrived at your location."
          : "Your doctor is on the way to your location.",
      data: { type: "travel_status", appointmentId: id, travelStatus },
    });
    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });
  }
}
