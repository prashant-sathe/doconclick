import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, readJson } from "@/lib/routeGuards";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { requireActiveProvider } from "@/lib/providerGuard";
import { journeyStartProblem } from "@/lib/journeyWindow";

// NOT_STARTED is "Stop journey" — back from ON_THE_WAY, e.g. started by
// mistake or turned back.
const VALID_STATUSES = ["NOT_STARTED", "ON_THE_WAY", "ARRIVED"];

const TRAVEL_PUSH_COPY: Record<string, { title: (provider: string) => string; body: (name: string) => string }> = {
  ON_THE_WAY: { title: (p) => `Your ${p} is on the way!`, body: (d) => `${d} has started the journey to you.` },
  ARRIVED: { title: (p) => `Your ${p} has arrived!`, body: (d) => `${d} is here for your visit.` },
  NOT_STARTED: { title: (p) => `Your ${p} has stopped the journey`, body: (d) => `${d} isn't on the way right now — they'll start again before your visit, or contact you.` },
};

// A finite number (or numeric string) within ±max.
const isCoord = (v: unknown, max: number) =>
  (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) && Math.abs(Number(v)) <= max;

// PATCH: Doctor or nurse starts/updates/ends a home-visit journey.
// Called once to start (ON_THE_WAY + initial position — only within the
// start window, src/lib/journeyWindow.ts), then repeatedly while travelling
// to push updated coordinates, then once more with ARRIVED — or NOT_STARTED
// to stop the journey. The patient is pushed only when the status changes.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { authUser, denied } = await requireRole("DOCTOR", "NURSE");
  if (denied) return denied;
  const suspendedResponse = await requireActiveProvider(authUser, { requireSubscription: true });
  if (suspendedResponse) return suspendedResponse;

  const { id } = await params;
  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment || appointment.doctorId !== authUser.id) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (appointment.consultType !== "HOME" || appointment.status !== "SCHEDULED") {
    return NextResponse.json({ error: "Live tracking only applies to confirmed home visits" }, { status: 400 });
  }

  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;
  const { travelStatus, lat, lng } = body;
  if (typeof travelStatus !== "string" || !VALID_STATUSES.includes(travelStatus)) {
    return NextResponse.json({ error: "Invalid travel status" }, { status: 400 });
  }
  const hasCoords = lat != null && lng != null;
  if (hasCoords && !(isCoord(lat, 90) && isCoord(lng, 180))) {
    return NextResponse.json({ error: "Invalid location" }, { status: 400 });
  }
  if (appointment.travelStatus === "ARRIVED") {
    return NextResponse.json({ error: "This visit has already arrived" }, { status: 400 });
  }
  const from = appointment.travelStatus;
  if (travelStatus === "NOT_STARTED" && from !== "ON_THE_WAY") {
    return NextResponse.json({ error: "The journey hasn't started." }, { status: 400 });
  }
  // Setting off (or arriving without a tracked journey) is only allowed
  // around the visit time; position updates mid-journey aren't re-checked.
  if (from === "NOT_STARTED" && travelStatus !== "NOT_STARTED") {
    const problem = journeyStartProblem(appointment);
    if (problem) return NextResponse.json({ error: problem.message, code: problem.code }, { status: 400 });
  }
  const changed = travelStatus !== from;

  try {
    // Conditional on the status read above, so two racing requests (a
    // position update and "Stop journey") can't both win.
    const { count } = await prisma.appointment.updateMany({
      where: { id, travelStatus: from, status: "SCHEDULED" },
      data: {
        travelStatus,
        ...(travelStatus === "NOT_STARTED"
          // Stopped: stop showing a stale position to the patient.
          ? { doctorLat: null, doctorLng: null, doctorLocationUpdatedAt: null }
          : hasCoords
            ? { doctorLat: Number(lat), doctorLng: Number(lng), doctorLocationUpdatedAt: new Date() }
            : {}),
      },
    });
    if (count === 0) {
      return NextResponse.json({ error: "This visit just changed — refresh and try again." }, { status: 409 });
    }
    const updated = await prisma.appointment.findUniqueOrThrow({ where: { id } });
    const copy = changed ? TRAVEL_PUSH_COPY[travelStatus] : undefined;
    if (copy) {
      void sendPushToUser(appointment.patientId, {
        title: copy.title(appointment.providerType === "NURSE" ? "nurse" : "doctor"),
        body: copy.body(authUser.name),
        url: `/patient/track/${id}`,
      });
    }
    // Never hand the patient's door code back to the nurse.
    const { visitOtp: _code, ...safe } = updated;
    void _code;
    return NextResponse.json(safe);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Could not update the visit. Please try again." }, { status: 500 });
  }
}
