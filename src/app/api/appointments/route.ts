import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { commissionPercentForConsultType } from "@/lib/platformFee";
import { isClinicOpenNow } from "@/lib/clinicAvailability";
import { haversine } from "@/lib/geo";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { missingProfileFields } from "@/lib/bookingProfile";
import { doctorSlotProblem, snapToClinicGrid, isSlotIndexViolation } from "@/lib/doctorSlots";

export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const {
      doctorId,
      symptoms,
      dependentId,
      allergies,
      consentGiven,
      consultType,
      scheduledAt,
      followUpOfId,
      clinicId,
      patientLat,
      patientLng,
    } = await req.json();

    if (!doctorId || !symptoms || !consultType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!["CLINIC", "HOME", "VIDEO"].includes(consultType)) {
      return NextResponse.json({ error: "Invalid consultation type" }, { status: 400 });
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
      include: { patientProfile: { select: { age: true, gender: true } } },
    });
    if (!patient) {
      return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });
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
    if (!doctor?.doctorProfile || doctor.role !== "DOCTOR" || doctor.doctorProfile.status !== "APPROVED") {
      return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
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
    }

    if (consultType === "HOME" && !doctor.doctorProfile.offersHomeVisit) {
      return NextResponse.json({ error: "This doctor does not offer home visits" }, { status: 400 });
    }

    if (consultType === "HOME" && typeof patientLat === "number" && typeof patientLng === "number") {
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
      if (baseLat != null && baseLng != null) {
        const distanceKm = haversine(patientLat, patientLng, baseLat, baseLng);
        if (distanceKm > doctor.doctorProfile.radius) {
          return NextResponse.json(
            {
              error: `This doctor only offers home visits within ${doctor.doctorProfile.radius} km, and you're ${distanceKm.toFixed(1)} km away. Home visit isn't available right now.`,
            },
            { status: 400 }
          );
        }
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
        ...(bookAt ? { scheduledAt: bookAt } : {}),
      },
      include: {
        patient: { select: { name: true } },
        doctor: { select: { name: true } },
      },
    });

    void sendPushToUser(doctorId, {
      title: "New appointment request",
      body: `${appointment.patientName ?? appointment.patient.name} requested a ${consultType.toLowerCase()} consultation.`,
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
}
