import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { haversine } from "@/lib/geo";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { missingProfileFields } from "@/lib/bookingProfile";
import { isNurseBookable } from "@/lib/providerGuard";
import { nurseSlotProblem } from "@/lib/nurseSchedule";
import { buildVisitSchedule, intervalLabel, isShift, shiftLabel, PACKAGE_INTERVAL_OPTIONS, PACKAGE_MAX_VISITS, SHIFT_MIN_LEAD_MS } from "@/lib/nursePackage";

// POST: patient books a nurse home visit (or a multi-visit package) for one service. Stored as a
// regular Appointment (providerType NURSE, doctorId = the nurse) so payment,
// wallet refunds, settlement, chat, tracking and reviews all work unchanged.
// Unlike the doctor booking route the fee is never taken from the client —
// it's the nurse's own price for the chosen service.
export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { nurseId, serviceId, notes, dependentId, consentGiven, scheduledAt, prescriptionDocId, patientLat, patientLng } = body;

  if (!nurseId || !serviceId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!consentGiven) {
    return NextResponse.json({ error: "Please agree to the consent statement to continue." }, { status: 400 });
  }

  let dependent: { id: string; name: string; relation: string; allergies: string | null } | null = null;
  if (dependentId) {
    const found = await prisma.patientDependent.findUnique({
      where: { id: dependentId },
      include: { patientProfile: { select: { userId: true } } },
    });
    if (!found || found.patientProfile.userId !== authUser.id) {
      return NextResponse.json({ error: "Invalid family member selected." }, { status: 400 });
    }
    dependent = found;
  }

  const patient = await prisma.user.findUnique({
    where: { id: authUser.id },
    include: { patientProfile: { select: { age: true, gender: true, homeAddress: true, allergies: true, lat: true, lng: true } } },
  });
  if (!patient) {
    return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });
  }
  const missing = missingProfileFields(patient.name, patient.patientProfile, { forDependent: !!dependent });
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "Please complete your profile to book.", code: "PROFILE_INCOMPLETE", missing },
      { status: 409 }
    );
  }
  // The nurse comes to the patient — there has to be somewhere to go.
  if (!patient.patientProfile?.homeAddress?.trim()) {
    return NextResponse.json(
      { error: "Please add your home address so the nurse knows where to come.", code: "ADDRESS_REQUIRED" },
      { status: 409 }
    );
  }

  const [nurse, offering, settings] = await Promise.all([
    prisma.user.findFirst({
      where: { id: nurseId, role: "NURSE", deletedAt: null },
      include: { nurseProfile: true },
    }),
    prisma.nurseServiceOffering.findFirst({
      where: { serviceId, nurseProfile: { userId: nurseId }, service: { isActive: true } },
      include: { service: true },
    }),
    prisma.platformSettings.findFirst(),
  ]);
  if (!nurse?.nurseProfile || !isNurseBookable(nurse.nurseProfile, settings)) {
    return NextResponse.json({ error: "This nurse isn't available for booking right now." }, { status: 404 });
  }
  if (!offering) {
    return NextResponse.json({ error: "This nurse doesn't offer that service." }, { status: 400 });
  }

  if (scheduledAt) {
    const when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      return NextResponse.json({ error: "Please pick a time in the future." }, { status: 400 });
    }
  }

  // A shift (12h / 24h) is planned care: it needs a start time, at least an
  // hour ahead, and runs on consecutive days. It isn't bound by the nurse's
  // daily visiting hours (she chose to offer shifts) — but it does block her
  // calendar for the whole shift, so the clash check below still applies.
  const shift = isShift(offering.service);
  if (shift && (!scheduledAt || new Date(scheduledAt).getTime() < Date.now() + SHIFT_MIN_LEAD_MS)) {
    return NextResponse.json({ error: "Pick the shift's start time — at least an hour from now." }, { status: 400 });
  }

  // Package: 1 visit (default) up to 14, every 1–3 days. The dates skip the
  // nurse's days off — same function the booking form previews with.
  const visitsWanted = body.visits === undefined ? 1 : Number(body.visits);
  const intervalDays = shift ? 1 : body.intervalDays === undefined ? 1 : Number(body.intervalDays);
  if (!Number.isInteger(visitsWanted) || visitsWanted < 1 || visitsWanted > PACKAGE_MAX_VISITS) {
    return NextResponse.json({ error: `Choose between 1 and ${PACKAGE_MAX_VISITS} visits.` }, { status: 400 });
  }
  if (!(PACKAGE_INTERVAL_OPTIONS as readonly number[]).includes(intervalDays)) {
    return NextResponse.json({ error: "Visits can be every 1, 2 or 3 days." }, { status: 400 });
  }
  const schedule = buildVisitSchedule(
    scheduledAt ? new Date(scheduledAt) : new Date(),
    visitsWanted,
    intervalDays,
    shift ? null : nurse.nurseProfile.availability,
  );
  for (let i = 0; i < schedule.length; i++) {
    const problem = await nurseSlotProblem({
      nurseId: nurse.id,
      availability: nurse.nurseProfile.availability,
      when: schedule[i],
      durationMinutes: offering.service.durationMinutes,
      viewer: "patient",
      checkHours: !shift,
    });
    if (problem) {
      const prefix = schedule.length > 1
        ? `Visit ${i + 1} (${schedule[i].toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}): `
        : "";
      return NextResponse.json({ error: prefix + problem, code: "SLOT_UNAVAILABLE" }, { status: 409 });
    }
  }

  // A doctor's "nurse care needed" referral from one of this patient's own
  // consultations — its prescription stands in for an uploaded one.
  let referral: { id: string; serviceId: string; instructions: string | null } | null = null;
  if (body.nurseReferralId) {
    const found = await prisma.nurseReferral.findUnique({
      where: { id: String(body.nurseReferralId) },
      include: { appointment: { select: { patientId: true } }, service: { select: { name: true } } },
    });
    if (!found || found.appointment.patientId !== authUser.id) {
      return NextResponse.json({ error: "That doctor's referral wasn't found." }, { status: 400 });
    }
    if (found.serviceId !== offering.serviceId) {
      return NextResponse.json({ error: `Your doctor's referral is for ${found.service.name}, not ${offering.service.name}.` }, { status: 400 });
    }
    referral = found;
  }

  // Injections, IV, catheter etc. may only be given on a doctor's order.
  let prescriptionDoc: { id: string } | null = null;
  if (prescriptionDocId) {
    prescriptionDoc = await prisma.patientDocument.findFirst({
      where: { id: prescriptionDocId, patientId: authUser.id },
      select: { id: true },
    });
    if (!prescriptionDoc) {
      return NextResponse.json({ error: "Please choose a valid prescription." }, { status: 400 });
    }
  }
  if (offering.service.requiresPrescription && !prescriptionDoc && !referral) {
    return NextResponse.json(
      { error: `${offering.service.name} needs a doctor's prescription. Please attach one.`, code: "PRESCRIPTION_REQUIRED" },
      { status: 400 }
    );
  }

  const pLat = typeof patientLat === "number" ? patientLat : patient.patientProfile.lat;
  const pLng = typeof patientLng === "number" ? patientLng : patient.patientProfile.lng;
  if (pLat == null || pLng == null) {
    return NextResponse.json(
      { error: "Please pick your visit address from the suggestions (or allow location) so we can check the nurse travels there.", code: "LOCATION_REQUIRED" },
      { status: 409 }
    );
  }
  const { lat: nLat, lng: nLng, radius } = nurse.nurseProfile;
  if (nLat != null && nLng != null) {
    const distanceKm = haversine(pLat, pLng, nLat, nLng);
    if (distanceKm > radius) {
      return NextResponse.json(
        { error: `This nurse only travels within ${radius} km, and you're ${distanceKm.toFixed(1)} km away.` },
        { status: 400 }
      );
    }
  }

  const amount = offering.price;
  const platformFee = (amount * (settings?.nurseCommissionPercent ?? 10)) / 100;
  const trimmedNotes = typeof notes === "string" ? notes.trim().slice(0, 1000) : "";

  const created = await prisma.$transaction(async (tx) => {
    const pkg = schedule.length > 1
      ? await tx.nursePackage.create({
          data: { patientId: authUser.id, nurseId: nurse.id, serviceId: offering.serviceId, visits: schedule.length, intervalDays },
        })
      : null;
    const rows = [];
    for (let i = 0; i < schedule.length; i++) {
      rows.push(await tx.appointment.create({
        data: {
          patientId: authUser.id,
          doctorId: nurse.id,
          providerType: "NURSE",
          nurseServiceId: offering.serviceId,
          serviceName: offering.service.name,
          prescriptionDocId: prescriptionDoc?.id,
          nurseReferralId: referral?.id,
          symptoms: trimmedNotes || referral?.instructions?.slice(0, 1000) || offering.service.name,
          patientName: dependent ? dependent.name : null,
          relation: dependent ? dependent.relation : "Self",
          dependentId: dependent?.id,
          allergies: dependent ? dependent.allergies : patient.patientProfile!.allergies,
          consentGiven: true,
          consultType: "HOME",
          amount,
          platformFee,
          status: "PENDING_APPROVAL",
          paymentMethod: "ONLINE",
          scheduledAt: schedule[i],
          ...(pkg ? { packageId: pkg.id, packageIndex: i + 1 } : {}),
        },
      }));
    }
    return { pkg, rows };
  });

  const who = dependent ? dependent.name : patient.name;
  void sendPushToUser(nurse.id, {
    title: created.pkg ? "New visit package request" : "New visit request",
    body: shift
      ? `${who} requested ${schedule.length > 1 ? `${schedule.length} × ` : "a "}${shiftLabel(offering.service.durationMinutes)} (${offering.service.name}).`
      : created.pkg
        ? `${who} requested ${offering.service.name} — ${schedule.length} visits, ${intervalLabel(intervalDays)}.`
        : `${who} requested ${offering.service.name}.`,
    url: "/nurse/dashboard",
  });

  // First visit at the top level (what single-visit clients read), plus the package.
  return NextResponse.json({
    ...created.rows[0],
    visits: created.rows.length,
    totalAmount: amount * created.rows.length,
    scheduledVisits: created.rows.map((r) => r.scheduledAt),
  });
}
