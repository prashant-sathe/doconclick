import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { commissionPercentForConsultType } from "@/lib/platformFee";
import { isClinicOpenNow } from "@/lib/clinicAvailability";
import { haversine, withinSearchRadius } from "@/lib/geo";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { missingProfileFields } from "@/lib/bookingProfile";
import { isDoctorBookable, UNBOOKABLE_MESSAGE } from "@/lib/doctorBookable";
import { parseVisitInput, snapshotFromProfile, type VisitSnapshot } from "@/lib/visitAddress";
import { verifyVisitCoordinates } from "@/lib/visitVerify";
import { parseBody, appointmentBookingSchema } from "@/lib/schemas";
import { doctorSlotProblem, snapToClinicGrid, snapToDoctorHours, isSlotIndexViolation } from "@/lib/doctorSlots";
import { checkBookingRateLimit, getBookingHorizonDays, horizonProblem, doctorHoursProblem, openRequestsProblem } from "@/lib/bookingLimits";
import { timeOffProblem, TIME_OFF_CODE } from "@/lib/timeOff";
import { withErrorLocale } from "@/lib/apiErrors";

const MAX_SYMPTOM_PHOTOS = 3;

export const POST = withErrorLocale(async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  // Every request pushes the doctor — cap how fast one patient can send them.
  if (!checkBookingRateLimit(authUser.id)) {
    return NextResponse.json({ error: "Too many booking attempts. Please wait a few minutes and try again." }, { status: 429 });
  }

  try {
    const body = await req.json().catch(() => null);
    const parsed = parseBody(appointmentBookingSchema, body);
    if (parsed.response) return parsed.response;
    const { symptoms, patientLat, patientLng } = parsed.data;
    const {
      doctorId,
      dependentId,
      allergies,
      consentGiven,
      consultType,
      scheduledAt,
      followUpOfId,
      clinicId,
      symptomPhotoIds,
    } = body;

    if (!doctorId || !symptoms || !consultType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!["CLINIC", "HOME", "VIDEO"].includes(consultType)) {
      return NextResponse.json({ error: "Invalid consultation type" }, { status: 400 });
    }

    // Photos attached under "Symptoms / Reason": already uploaded to the
    // patient's own vault — only their own image documents are linked.
    const photoIds = Array.isArray(symptomPhotoIds)
      ? [...new Set(symptomPhotoIds.filter((id: unknown): id is string => typeof id === "string"))]
      : [];
    if (photoIds.length > MAX_SYMPTOM_PHOTOS) {
      return NextResponse.json({ error: `You can attach at most ${MAX_SYMPTOM_PHOTOS} photos.` }, { status: 400 });
    }
    if (photoIds.length > 0) {
      const owned = await prisma.patientDocument.findMany({
        where: { id: { in: photoIds }, patientId: authUser.id },
        select: { fileUrl: true },
      });
      if (owned.length !== photoIds.length || owned.some((d) => !/\.(jpe?g|png)$/i.test(d.fileUrl))) {
        return NextResponse.json({ error: "That photo couldn't be attached. Please upload it again." }, { status: 400 });
      }
    }

    // Booking for someone other than yourself always goes through a saved
    // dependent profile now — patientName/relation/allergies for that case
    // are derived from it below, never trusted from the client directly.
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
    const normalizedRelation = dependent ? dependent.relation : "Self";

    if (!consentGiven) {
      return NextResponse.json(
        { error: "Please agree to the consent statement to continue." },
        { status: 400 }
      );
    }

    // The session cookie can outlive the underlying user (e.g. a dev database
    // reseed) — verify it still resolves before writing anything.
    const patient = await prisma.user.findUnique({
      where: { id: authUser.id },
      include: {
        patientProfile: { select: { age: true, gender: true, homeAddress: true, landmark: true, pinCode: true, lat: true, lng: true } },
      },
    });
    if (!patient) {
      return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });
    }

    // The Terms gate in AuthProvider is client-side only — enforce it here so
    // an old app build or a direct API call can't book without accepting.
    if (!patient.termsAcceptedAt) {
      return NextResponse.json(
        { error: "Please accept the Terms of Service and Privacy Policy to book.", code: "TERMS_REQUIRED" },
        { status: 409 }
      );
    }

    // Quick signup skips name/age/gender — they're collected by the booking
    // page's profile sheet, and enforced here so no appointment is ever
    // created without them.
    const missing = missingProfileFields(patient.name, patient.patientProfile, { forDependent: !!dependent });
    if (missing.length > 0) {
      return NextResponse.json(
        { error: "Please complete your profile to book.", code: "PROFILE_INCOMPLETE", missing },
        { status: 409 }
      );
    }

    const doctor = await prisma.user.findUnique({
      where: { id: doctorId },
      include: { doctorProfile: true },
    });
    // Same rule as the listing — a doctor hidden from search (unverified,
    // lapsed trial/plan, deleted) can't be booked by a direct request either.
    // Covers follow-ups too, which come through here with followUpOfId.
    if (!isDoctorBookable(doctor) || !doctor?.doctorProfile) {
      return NextResponse.json({ error: UNBOOKABLE_MESSAGE }, { status: 404 });
    }

    // A scheduled booking can only be placed for a future moment — the client
    // restricts the picker, this guards a hand-crafted request.
    // The moment this booking holds the doctor for (null = "book now"). Pickers
    // only offer whole minutes; clinic times are snapped onto the slot grid below.
    let bookAt: Date | null = null;
    if (scheduledAt) {
      const when = new Date(scheduledAt);
      if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
        return NextResponse.json({ error: "Please pick a time in the future." }, { status: 400 });
      }
      bookAt = new Date(Math.floor(when.getTime() / 60_000) * 60_000);
      const tooFar = horizonProblem(bookAt, await getBookingHorizonDays());
      if (tooFar) return NextResponse.json({ error: tooFar }, { status: 400 });
    }

    if (consultType === "HOME" && !doctor.doctorProfile.offersHomeVisit) {
      return NextResponse.json({ error: "This doctor does not offer home visits" }, { status: 400 });
    }

    // A home visit's address is snapshotted onto the booking, so a later
    // profile edit can't send the doctor to the wrong house: the visit
    // address the client sent, else the saved profile address — with the
    // phone's position as the coordinates only when the profile has none.
    let visit: VisitSnapshot | null = null;
    if (consultType === "HOME") {
      const visitInput = parseVisitInput(body.visit);
      if (visitInput && "error" in visitInput) {
        return NextResponse.json({ error: visitInput.error, code: "LOCATION_REQUIRED" }, { status: 400 });
      }
      visit = visitInput?.snapshot ?? snapshotFromProfile(patient.patientProfile);
      // Coordinates straight from the saved profile need no re-check; the
      // request's (visit input, or the phone's position) do.
      let coordsFromSaved = !visitInput && visit.visitLat != null;
      if (visit.visitLat == null && typeof patientLat === "number" && typeof patientLng === "number") {
        visit = { ...visit, visitLat: patientLat, visitLng: patientLng };
        coordsFromSaved = false;
      }
      // Same gates as nurse-bookings: somewhere to go, and coordinates to
      // check the doctor's travel radius against — never skipped.
      if (!visit.visitAddress) {
        return NextResponse.json(
          { error: "Please add your home address (Profile → Address) so the doctor knows where to come.", code: "ADDRESS_REQUIRED" },
          { status: 409 }
        );
      }
      if (visit.visitLat == null || visit.visitLng == null) {
        return NextResponse.json(
          { error: "Please pin your home address on the map (Profile → Address) or allow location, so we can check the doctor travels there.", code: "LOCATION_REQUIRED" },
          { status: 409 }
        );
      }

      // They must belong to the address (src/lib/visitVerify.ts) — the radius
      // check below is only as good as the coordinates it's given.
      const verified = await verifyVisitCoordinates(visit, patient.patientProfile, { coordsFromSaved });
      if ("problem" in verified) {
        return NextResponse.json({ error: verified.problem.error, code: verified.problem.code }, { status: verified.problem.status });
      }
      visit = verified.visit;
      const { visitLat, visitLng } = visit as { visitLat: number; visitLng: number };

      let baseLat = doctor.doctorProfile.lat;
      let baseLng = doctor.doctorProfile.lng;
      if (baseLat == null || baseLng == null) {
        const firstClinic = await prisma.clinic.findFirst({
          where: { doctorId, isActive: true },
          orderBy: { sortOrder: "asc" },
        });
        baseLat = firstClinic?.lat ?? null;
        baseLng = firstClinic?.lng ?? null;
      }
      // A doctor with no pin at all isn't blocked — same rule as the listing.
      const distanceKm = baseLat != null && baseLng != null ? haversine(visitLat, visitLng, baseLat, baseLng) : null;
      if (!withinSearchRadius(distanceKm, doctor.doctorProfile.radius, false)) {
        return NextResponse.json(
          {
            error: `This doctor only offers home visits within ${doctor.doctorProfile.radius} km, and you're ${distanceKm!.toFixed(1)} km away. Home visit isn't available right now.`,
          },
          { status: 400 }
        );
      }
    }
    if (consultType === "CLINIC" && !doctor.doctorProfile.offersClinic) {
      return NextResponse.json({ error: "This doctor does not offer clinic visits" }, { status: 400 });
    }

    if (consultType === "CLINIC") {
      if (clinicId) {
        const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, include: { slots: true, leaves: true } });
        if (!clinic || clinic.doctorId !== doctorId || !clinic.isActive) {
          return NextResponse.json({ error: "Please select a valid clinic location." }, { status: 400 });
        }
        const effectiveTime = bookAt ?? new Date();
        if (!isClinicOpenNow(clinic.slots, effectiveTime, clinic.leaves.map((l) => l.date))) {
          return NextResponse.json(
            { error: "The doctor is not available at this clinic at the selected time. Please choose a different clinic or time." },
            { status: 400 }
          );
        }
        // A scheduled clinic visit must be one of the slots the slots API
        // offers — never an arbitrary minute between two of them.
        if (bookAt) {
          const snapped = snapToClinicGrid(clinic, bookAt);
          if (snapped.error !== null) return NextResponse.json({ error: snapped.error }, { status: 400 });
          bookAt = snapped.when;
        }
      } else {
        // A doctor with clinics must have one picked and validated above —
        // only doctors with no clinics at all skip this (legacy fallback).
        const clinicCount = await prisma.clinic.count({ where: { doctorId, isActive: true } });
        if (clinicCount > 0) {
          return NextResponse.json({ error: "Please select a clinic location." }, { status: 400 });
        }
      }
    }
    if (consultType === "VIDEO" && !doctor.doctorProfile.offersVideo) {
      return NextResponse.json({ error: "This doctor does not offer video consultations" }, { status: 400 });
    }

    // A scheduled home/video time must be within the doctor's set hours (a
    // clinic time was already checked against that clinic's slots above).
    if (bookAt && consultType !== "CLINIC") {
      const outside = doctorHoursProblem(doctor.doctorProfile.availability, bookAt);
      if (outside) return NextResponse.json({ error: outside, code: "OUTSIDE_HOURS" }, { status: 400 });
      // …and one of the slots the slots API offers for those hours.
      const snapped = snapToDoctorHours(doctor.doctorProfile.availability, bookAt);
      if (snapped.error !== null) return NextResponse.json({ error: snapped.error }, { status: 400 });
      bookAt = snapped.when;
    }

    const tooMany = await openRequestsProblem(authUser.id, doctorId);
    if (tooMany) return NextResponse.json({ error: tooMany, code: "TOO_MANY_REQUESTS" }, { status: 409 });

    // On time off / offline. (A chosen time is checked by doctorSlotProblem below.)
    if (!bookAt) {
      const away = await timeOffProblem(doctorId, new Date(), "patient");
      if (away) return NextResponse.json({ error: away, code: TIME_OFF_CODE }, { status: 409 });
    }

    // A scheduled booking holds the doctor for a slot across all their clinics
    // and consult types. "Now" bookings are exempt: there's no discrete slot
    // to collide on (see src/lib/doctorSlots.ts).
    if (bookAt) {
      const problem = await doctorSlotProblem({ doctorId, when: bookAt, against: "live", viewer: "patient" });
      if (problem) return NextResponse.json({ error: problem }, { status: 409 });
    }

    if (followUpOfId) {
      const original = await prisma.appointment.findUnique({ where: { id: followUpOfId } });
      if (!original || original.patientId !== authUser.id || original.doctorId !== doctorId) {
        return NextResponse.json({ error: "Invalid follow-up appointment" }, { status: 400 });
      }
    }

    const settings = await prisma.platformSettings.findFirst();
    const commission = commissionPercentForConsultType(settings, consultType);
    // The fee is always the doctor's own price for this consult type — never
    // whatever the client sent (a hand-crafted request could otherwise book
    // a consultation for ₹1).
    const amount =
      consultType === "HOME" ? doctor.doctorProfile.homeVisitFee
        : consultType === "VIDEO" ? doctor.doctorProfile.videoFee
          : doctor.doctorProfile.consultFee;
    const platformFee = (amount * commission) / 100;

    const appointment = await prisma.appointment.create({
      data: {
        patientId: authUser.id,
        doctorId,
        symptoms,
        patientName: dependent ? dependent.name : null,
        relation: normalizedRelation,
        dependentId: dependent?.id,
        allergies: allergies?.trim() ? allergies.trim() : null,
        consentGiven: Boolean(consentGiven),
        consultType,
        amount,
        platformFee,
        status: "PENDING_APPROVAL",
        paymentMethod: "ONLINE",
        followUpOfId: followUpOfId ?? undefined,
        clinicId: consultType === "CLINIC" && clinicId ? clinicId : undefined,
        ...(visit ?? {}),
        ...(bookAt ? { scheduledAt: bookAt } : {}),
        ...(photoIds.length > 0 ? { symptomPhotos: { connect: photoIds.map((id) => ({ id })) } } : {}),
      },
      include: {
        patient: { select: { name: true } },
        doctor: { select: { name: true } },
      },
    });

    void sendPushToUser(doctorId, {
      key: "apptRequested",
      values: { patient: appointment.patientName ?? appointment.patient.name, consultType },
      url: "/doctor/dashboard",
    });

    return NextResponse.json(appointment);
  } catch (err) {
    // Two patients raced for the same slot — the partial unique index let one through.
    if (isSlotIndexViolation(err)) {
      return NextResponse.json({ error: "That time was just taken by another patient. Please pick a different slot." }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "Booking failed. Please try again." }, { status: 500 });
  }
});
