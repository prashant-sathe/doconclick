import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { commissionPercentForConsultType } from "@/lib/platformFee";
import { isClinicOpenNow } from "@/lib/clinicAvailability";
import { haversine } from "@/lib/geo";
import { sendPushToUser } from "@/lib/firebaseAdmin";

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
      amount,
      scheduledAt,
      isEmergency,
      followUpOfId,
      clinicId,
      patientLat,
      patientLng,
    } = await req.json();

    if (!doctorId || !symptoms || !consultType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
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

    // Emergency requests are a deliberate one-tap flow — consent is implied by the
    // act of requesting urgent help. Every other booking requires an explicit checkbox.
    if (!isEmergency && !consentGiven) {
      return NextResponse.json(
        { error: "Please agree to the consent statement to continue." },
        { status: 400 }
      );
    }

    // The session cookie can outlive the underlying user (e.g. a dev database
    // reseed) — verify it still resolves before writing anything.
    const patient = await prisma.user.findUnique({ where: { id: authUser.id } });
    if (!patient) {
      return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });
    }

    const doctor = await prisma.user.findUnique({
      where: { id: doctorId },
      include: { doctorProfile: true },
    });
    if (!doctor?.doctorProfile || doctor.role !== "DOCTOR") {
      return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
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
        const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, include: { slots: true } });
        if (!clinic || clinic.doctorId !== doctorId || !clinic.isActive) {
          return NextResponse.json({ error: "Please select a valid clinic location." }, { status: 400 });
        }
        const effectiveTime = scheduledAt ? new Date(scheduledAt) : new Date();
        if (!isClinicOpenNow(clinic.slots, effectiveTime)) {
          return NextResponse.json(
            { error: "The doctor is not available at this clinic at the selected time. Please choose a different clinic or time." },
            { status: 400 }
          );
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

    if (followUpOfId) {
      const original = await prisma.appointment.findUnique({ where: { id: followUpOfId } });
      if (!original || original.patientId !== authUser.id || original.doctorId !== doctorId) {
        return NextResponse.json({ error: "Invalid follow-up appointment" }, { status: 400 });
      }
    }

    const settings = await prisma.platformSettings.findFirst();
    const commission = commissionPercentForConsultType(settings, consultType);
    const platformFee = (Number(amount) * commission) / 100;

    const appointment = await prisma.appointment.create({
      data: {
        patientId: authUser.id,
        doctorId,
        symptoms,
        patientName: dependent ? dependent.name : null,
        relation: normalizedRelation,
        dependentId: dependent?.id,
        allergies: allergies?.trim() ? allergies.trim() : null,
        consentGiven: isEmergency ? true : Boolean(consentGiven),
        consultType,
        amount: Number(amount),
        platformFee,
        status: "PENDING_APPROVAL",
        paymentMethod: "ONLINE",
        isEmergency: Boolean(isEmergency),
        followUpOfId: followUpOfId ?? undefined,
        clinicId: consultType === "CLINIC" && clinicId ? clinicId : undefined,
        ...(scheduledAt ? { scheduledAt: new Date(scheduledAt) } : {}),
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
    console.error(err);
    return NextResponse.json({ error: "Booking failed. Please try again." }, { status: 500 });
  }
}
