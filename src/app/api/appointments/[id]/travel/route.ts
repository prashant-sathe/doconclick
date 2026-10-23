import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, readJson } from "@/lib/routeGuards";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { requireActiveProvider } from "@/lib/providerGuard";
import { journeyStartProblem } from "@/lib/journeyWindow";
import { isUnpaidOnline, sendPayReminder, UNPAID_VISIT_CODE } from "@/lib/payReminder";
import { withErrorLocale } from "@/lib/apiErrors";

// NOT_STARTED is "Stop journey" — back from ON_THE_WAY, e.g. started by
// mistake or turned back.
const VALID_STATUSES = ["NOT_STARTED", "ON_THE_WAY", "ARRIVED"];

// Patient push per travel status (messages/<locale>/push.json).
const TRAVEL_PUSH_KEY = {
  ON_THE_WAY: "travelOnTheWay",
  ARRIVED: "travelArrived",
  NOT_STARTED: "travelStopped",
} as const;

// A finite number (or numeric string) within ±max.
const isCoord = (v: unknown, max: number) =>
  (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) && Math.abs(Number(v)) <= max;

// PATCH: Doctor or nurse starts/updates/ends a home-visit journey.
// Called once to start (ON_THE_WAY + initial position — only within the
// start window, src/lib/journeyWindow.ts), then repeatedly while travelling
// to push updated coordinates, then once more with ARRIVED — or NOT_STARTED
// to stop the journey. The patient is pushed only when the status changes.
export const PATCH = withErrorLocale(async function PATCH(
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
  const { travelStatus, lat, lng, acknowledgeUnpaid } = body;
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
  // Setting off for a visit the patient hasn't paid for: they're reminded to
  // pay either way, and the provider has to say they're going anyway — the
  // visit can't be completed until it's paid (PATCH /api/appointments/[id]).
  let unpaidDue: number | null = null;
  if (from === "NOT_STARTED" && travelStatus !== "NOT_STARTED" && isUnpaidOnline(appointment)) {
    const reminder = await sendPayReminder(appointment, authUser.name, "leaving");
    if (acknowledgeUnpaid !== true) {
      return NextResponse.json(
        {
          error: `The patient hasn't paid ₹${reminder.amount} for this visit yet. You can't complete it until they pay.`,
          code: UNPAID_VISIT_CODE,
          amount: reminder.amount,
          reminderSent: reminder.sent,
          reminderSentAt: reminder.at,
        },
        { status: 409 }
      );
    }
    unpaidDue = reminder.amount;
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
    const key = changed && travelStatus in TRAVEL_PUSH_KEY ? TRAVEL_PUSH_KEY[travelStatus as keyof typeof TRAVEL_PUSH_KEY] : undefined;
    if (key) {
      void sendPushToUser(appointment.patientId, {
        key,
        values: {
          providerType: appointment.providerType,
          provider: authUser.name,
          due: unpaidDue != null && travelStatus === "ON_THE_WAY" ? "yes" : "no",
          amount: unpaidDue ?? 0,
        },
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
});
