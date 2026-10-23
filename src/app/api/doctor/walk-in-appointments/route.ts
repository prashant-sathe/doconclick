import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { resolveDoctorScope } from "@/lib/staffGuard";
import { parseBody, walkInBookingSchema } from "@/lib/schemas";
import { commissionPercentForConsultType } from "@/lib/platformFee";
import { missingProfileFields, isValidAge } from "@/lib/bookingProfile";
import { doctorSlotProblem, snapToClinicGrid, isSlotIndexViolation, isTimedBooking } from "@/lib/doctorSlots";
import { getBookingHorizonDays, horizonProblem } from "@/lib/bookingLimits";
import { snapshotFromProfile, type VisitSnapshot } from "@/lib/visitAddress";
import { settleIfFreeOnAccept } from "@/lib/paymentOrders";
import { signGuestPaymentToken, guestPaymentPath } from "@/lib/guestPaymentToken";
import { externalOrigin } from "@/lib/googleOAuth";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { createRateLimiter } from "@/lib/rateLimit";
import { formatDoctorName } from "@/lib/utils";
import { isClinicOpenNow } from "@/lib/clinicAvailability";
import { hasActiveDoctorSubscription } from "@/lib/subscription";
import { cashDueProblem, CASH_DUE_LIMIT_CODE } from "@/lib/duesPayments";
import { timeOffProblem, TIME_OFF_CODE } from "@/lib/timeOff";
import { withErrorLocale } from "@/lib/apiErrors";
import { isKnownPatient } from "@/lib/knownPatient";

// A busy front desk books a few patients an hour, not dozens a minute.
const checkLimit = createRateLimiter(30, 10 * 60_000);

const FIELD_LABEL = { name: "name", age: "age", gender: "gender" } as const;
const TYPE_LABEL: Record<string, string> = { CLINIC: "clinic visit", HOME: "home visit", VIDEO: "video consultation" };

// GET: what the walk-in form (/doctor/walk-in) can offer — the visit types
// the doctor takes with their fees, and their clinics. For DOCTOR and STAFF.
export const GET = withErrorLocale(async function GET() {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const scope = await resolveDoctorScope(authUser);
  if (scope.denied) return scope.denied;

  const doctor = await prisma.user.findUnique({
    where: { id: scope.doctorId },
    select: {
      name: true,
      doctorProfile: {
        select: {
          status: true, isVerified: true, trialEndsAt: true, subscriptionPaidUntil: true,
          offersClinic: true, offersHomeVisit: true, offersVideo: true,
          consultFee: true, homeVisitFee: true, videoFee: true,
        },
      },
      clinics: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, address: true, slots: true, leaves: { select: { date: true } } },
      },
    },
  });
  const p = doctor?.doctorProfile;
  if (!doctor || !p) return NextResponse.json({ error: "Doctor account not found." }, { status: 404 });

  return NextResponse.json({
    doctorId: scope.doctorId,
    doctorName: doctor.name,
    // Why booking is closed, if it is — the form shows this instead.
    blocked: p.status !== "APPROVED" || !p.isVerified
      ? "Walk-in booking opens once the doctor's profile is verified."
      : !hasActiveDoctorSubscription(p)
        ? authUser.role === "STAFF"
          ? "Your doctor's DocOnClick plan has expired. Ask them to renew it to book patients."
          : "Your DocOnClick plan has expired. Renew it to book patients."
        : null,
    types: [
      ...(p.offersClinic ? [{ type: "CLINIC", fee: p.consultFee }] : []),
      ...(p.offersHomeVisit ? [{ type: "HOME", fee: p.homeVisitFee }] : []),
      ...(p.offersVideo ? [{ type: "VIDEO", fee: p.videoFee }] : []),
    ],
    clinics: doctor.clinics.map((c) => ({
      id: c.id,
      name: c.name,
      address: c.address,
      hasHours: c.slots.length > 0,
      openNow: isClinicOpenNow(c.slots, new Date(), c.leaves.map((l) => l.date)),
    })),
    horizonDays: await getBookingHorizonDays(),
    // Why Cash can't be picked right now (too much platform fee owed), if so.
    cashBlocked: (await cashDueProblem(scope.doctorId, authUser.role === "STAFF" ? "staff" : "doctor"))?.message ?? null,
  });
});

// POST: the doctor or their front desk (STAFF) books a walk-in or phone-in
// patient. The booking is already accepted (SCHEDULED — the doctor's own side
// made it), priced from the doctor's own fee for the visit type (never the
// client's number), and paid either in cash at the visit or online by the
// patient through a pay link/QR (src/lib/guestPaymentToken.ts). A number with
// no account gets one, passwordless until the patient registers with it.
export const POST = withErrorLocale(async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  // Same rule as accepting a request: an expired plan can't take new visits.
  const scope = await resolveDoctorScope(authUser, { requireSubscription: true });
  if (scope.denied) return scope.denied;
  const doctorId = scope.doctorId;

  if (!checkLimit(authUser.id)) {
    return NextResponse.json({ error: "Too many bookings in a short time. Please wait a few minutes and try again." }, { status: 429 });
  }

  const parsed = parseBody(walkInBookingSchema, await req.json().catch(() => null));
  if (parsed.response) return parsed.response;
  const input = parsed.data;

  try {
    const doctor = await prisma.user.findUnique({ where: { id: doctorId }, include: { doctorProfile: true } });
    const profile = doctor?.doctorProfile;
    if (!doctor || doctor.deletedAt || !profile) {
      return NextResponse.json({ error: "Doctor account not found." }, { status: 404 });
    }
    if (profile.status !== "APPROVED" || !profile.isVerified) {
      return NextResponse.json({ error: "Bookings open once the doctor's profile is verified." }, { status: 403 });
    }

    const { consultType } = input;
    if (consultType === "CLINIC" && !profile.offersClinic) {
      return NextResponse.json({ error: "Clinic visits are turned off in the doctor's consultation settings." }, { status: 400 });
    }
    if (consultType === "HOME" && !profile.offersHomeVisit) {
      return NextResponse.json({ error: "Home visits are turned off in the doctor's consultation settings." }, { status: 400 });
    }
    if (consultType === "VIDEO" && !profile.offersVideo) {
      return NextResponse.json({ error: "Video consultations are turned off in the doctor's consultation settings." }, { status: 400 });
    }

    // ── The patient account ──
    const existing = await prisma.user.findUnique({
      where: { mobile: input.mobile },
      include: {
        patientProfile: {
          include: { dependents: { select: { id: true, name: true, relation: true, allergies: true } } },
        },
      },
    });
    if (existing && (existing.role !== "PATIENT" || !existing.patientProfile)) {
      return NextResponse.json(
        { error: "This number belongs to a non-patient DocOnClick account, so it can't be booked as a patient. Use another number.", code: "NOT_A_PATIENT" },
        { status: 409 }
      );
    }

    // The saved address, allergies and family are only the desk's to reuse
    // for someone already the doctor's patient — same rule as the lookup.
    const known = !!existing && (await isKnownPatient(doctorId, existing.id));

    // Who the visit is for.
    let dependent: { id: string; name: string; relation: string; allergies: string | null } | null = null;
    let newDependent = input.newDependent ?? null;
    if (input.dependentId) {
      dependent = existing?.patientProfile?.dependents.find((d) => d.id === input.dependentId) ?? null;
      if (!dependent) return NextResponse.json({ error: "That family member isn't on this patient's account." }, { status: 400 });
      newDependent = null;
    } else if (newDependent && existing?.patientProfile) {
      // The lookup hides a stranger's saved family members, so the desk may
      // type one in again — reuse it rather than adding a duplicate.
      const name = newDependent.name.trim().toLowerCase();
      const match = existing.patientProfile.dependents.find((d) => d.name.trim().toLowerCase() === name);
      if (match) { dependent = match; newDependent = null; }
    }
    const forDependent = !!(dependent || newDependent);

    // Fill in what the account is missing — never overwrite what the patient
    // set themselves.
    const holderName = existing?.name?.trim() ? existing.name : (input.name ?? "").trim();
    const holderAge = existing?.patientProfile && isValidAge(existing.patientProfile.age)
      ? existing.patientProfile.age
      : input.age ?? 0;
    const holderGender = existing?.patientProfile?.gender || input.gender || "";
    const missing = missingProfileFields(holderName, { age: holderAge, gender: holderGender }, { forDependent });
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Enter the patient's ${missing.map((m) => FIELD_LABEL[m]).join(", ")}.`, code: "PROFILE_INCOMPLETE", missing },
        { status: 400 }
      );
    }

    // ── When ──
    let bookAt: Date | null = null;
    if (input.scheduledAt) {
      const when = new Date(input.scheduledAt);
      if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
        return NextResponse.json({ error: "Pick a time in the future, or book for now." }, { status: 400 });
      }
      bookAt = new Date(Math.floor(when.getTime() / 60_000) * 60_000);
      const tooFar = horizonProblem(bookAt, await getBookingHorizonDays());
      if (tooFar) return NextResponse.json({ error: tooFar }, { status: 400 });
    }

    // ── Where ──
    let clinicId: string | null = null;
    if (consultType === "CLINIC") {
      const clinics = await prisma.clinic.findMany({ where: { doctorId, isActive: true }, include: { slots: true, leaves: true } });
      if (input.clinicId && !clinics.some((c) => c.id === input.clinicId)) {
        return NextResponse.json({ error: "Select a valid clinic location." }, { status: 400 });
      }
      if (clinics.length > 0) {
        const clinic = clinics.find((c) => c.id === input.clinicId) ?? (clinics.length === 1 && !input.clinicId ? clinics[0] : null);
        if (!clinic) return NextResponse.json({ error: "Select which clinic the visit is at." }, { status: 400 });
        clinicId = clinic.id;
        // A patient standing at the desk is seen whatever the posted hours say
        // — but a later time must be one of the clinic's slots, like any booking.
        if (bookAt) {
          const snapped = snapToClinicGrid(clinic, bookAt);
          if (snapped.error !== null) return NextResponse.json({ error: snapped.error }, { status: 400 });
          bookAt = snapped.when;
        }
      }
    }

    let visit: VisitSnapshot | null = null;
    if (consultType === "HOME") {
      visit = input.visit
        ? { visitAddress: input.visit.address, visitLandmark: input.visit.landmark, visitPinCode: input.visit.pinCode, visitLat: null, visitLng: null }
        : snapshotFromProfile(known ? existing?.patientProfile : null);
      // Saved coordinates only belong to the saved address (and are only
      // reused for a known patient, so they can't confirm a guessed address).
      if (known && input.visit && existing?.patientProfile?.homeAddress?.trim() === input.visit.address.trim()) {
        visit = { ...visit, visitLat: existing.patientProfile.lat, visitLng: existing.patientProfile.lng };
      }
      if (!visit.visitAddress) {
        return NextResponse.json({ error: "Enter the address for the home visit.", code: "ADDRESS_REQUIRED" }, { status: 400 });
      }
    }

    const away = await timeOffProblem(doctorId, bookAt ?? new Date(), authUser.role === "STAFF" ? "staff" : "provider");
    if (away) return NextResponse.json({ error: away, code: TIME_OFF_CODE }, { status: 409 });

    if (bookAt) {
      const clash = await doctorSlotProblem({ doctorId, when: bookAt, against: "live", viewer: "doctor" });
      if (clash) return NextResponse.json({ error: clash, code: "SLOT_TAKEN" }, { status: 409 });
    }

    // Same person already has a live booking with this doctor — usually a
    // double entry at the desk. The form confirms and resends with `force`.
    // (A family member added just now has no bookings yet.)
    if (existing && !newDependent && !input.force) {
      const live = await prisma.appointment.findFirst({
        where: {
          doctorId,
          patientId: existing.id,
          dependentId: dependent?.id ?? null,
          status: { in: ["PENDING_APPROVAL", "SCHEDULED"] },
        },
        orderBy: { scheduledAt: "asc" },
        select: { id: true, scheduledAt: true, createdAt: true, status: true, consultType: true },
      });
      if (live) {
        const at = isTimedBooking(live)
          ? `on ${live.scheduledAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}`
          : `in the queue (added ${live.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })})`;
        return NextResponse.json(
          {
            error: `${dependent?.name ?? holderName} already has a ${live.status === "SCHEDULED" ? "confirmed" : "pending"} ${TYPE_LABEL[live.consultType] ?? "visit"} ${at}. Book another one anyway?`,
            code: "DUPLICATE_BOOKING",
            existingAppointmentId: live.id,
          },
          { status: 409 }
        );
      }
    }

    if (input.paymentMethod === "CASH") {
      const due = await cashDueProblem(doctorId, authUser.role === "STAFF" ? "staff" : "doctor");
      if (due) return NextResponse.json({ error: due.message, code: CASH_DUE_LIMIT_CODE }, { status: 403 });
    }

    // ── Price ── always the doctor's own fee for this visit type.
    const settings = await prisma.platformSettings.findFirst();
    const amount = consultType === "HOME" ? profile.homeVisitFee : consultType === "VIDEO" ? profile.videoFee : profile.consultFee;
    const platformFee = (amount * commissionPercentForConsultType(settings, consultType)) / 100;

    const { appointment, patientCreated } = await prisma.$transaction(async (tx) => {
      let patientId: string;
      let patientProfileId: string;
      let patientCreated = false;
      if (existing?.patientProfile) {
        patientId = existing.id;
        patientProfileId = existing.patientProfile.id;
        if (!existing.name.trim() && holderName) await tx.user.update({ where: { id: existing.id }, data: { name: holderName } });
        const fill: { age?: number; gender?: string } = {};
        if (!isValidAge(existing.patientProfile.age) && isValidAge(holderAge)) fill.age = holderAge;
        if (!existing.patientProfile.gender && holderGender) fill.gender = holderGender;
        if (Object.keys(fill).length) await tx.patientProfile.update({ where: { id: existing.patientProfile.id }, data: fill });
      } else {
        // Passwordless, like a Google placeholder account: the patient sets a
        // password by registering with this number (api/patients/register).
        const created = await tx.user.create({
          data: {
            name: holderName,
            mobile: input.mobile,
            password: "",
            role: "PATIENT",
            patientProfile: { create: { age: holderAge, gender: holderGender } },
          },
          include: { patientProfile: { select: { id: true } } },
        });
        patientId = created.id;
        patientProfileId = created.patientProfile!.id;
        patientCreated = true;
      }

      if (newDependent) {
        dependent = await tx.patientDependent.create({
          data: {
            patientProfileId,
            name: newDependent.name,
            relation: newDependent.relation,
            age: newDependent.age,
            gender: newDependent.gender,
          },
          select: { id: true, name: true, relation: true, allergies: true },
        });
      }

      const allergies = input.allergies
        ?? (known ? dependent?.allergies ?? (dependent ? null : existing?.patientProfile?.allergies ?? null) : null);
      const appointment = await tx.appointment.create({
        data: {
          patientId,
          doctorId,
          symptoms: input.symptoms,
          patientName: dependent ? dependent.name : null,
          relation: dependent ? dependent.relation : "Self",
          dependentId: dependent?.id,
          allergies,
          consentGiven: true,
          consultType,
          amount,
          platformFee,
          status: "SCHEDULED",
          acceptedAt: new Date(),
          paymentMethod: input.paymentMethod,
          clinicId,
          bookedById: authUser.id,
          ...(visit ?? {}),
          ...(bookAt ? { scheduledAt: bookAt } : {}),
        },
      });
      return { appointment, patientCreated };
    });

    // A ₹0 fee has nothing to collect — paid as soon as it's booked, same as
    // accepting a free request. (A cash visit is marked paid on completion.)
    const free = input.paymentMethod === "ONLINE" && (await settleIfFreeOnAccept([appointment])).size > 0;
    const paymentStatus = free ? "PAID" : appointment.paymentStatus;

    let payment: { url: string; expiresAt: string } | null = null;
    if (input.paymentMethod === "ONLINE" && paymentStatus !== "PAID") {
      const { token, expiresAt } = signGuestPaymentToken(appointment.id);
      payment = { url: `${externalOrigin(req, new URL(req.url))}${guestPaymentPath(appointment.id, token)}`, expiresAt: expiresAt.toISOString() };
    }

    const label = dependent?.name ?? holderName;
    // `scheduled` "no" = a walk-in for right now ("today" / "now" in the copy).
    const timing = { consultType, scheduled: bookAt ? "yes" : "no", when: bookAt ?? new Date() };
    if (!patientCreated) {
      void sendPushToUser(appointment.patientId, {
        key: "walkInBookedPatient",
        values: {
          ...timing,
          doctor: formatDoctorName(doctor.name),
          forDependent: dependent ? "yes" : "no",
          label,
          payNow: payment ? "yes" : "no",
          amount,
        },
        url: "/patient/appointments",
      });
    }
    if (authUser.role === "STAFF") {
      void sendPushToUser(doctorId, {
        key: "walkInBookedDoctor",
        values: { ...timing, staff: authUser.name, label },
        url: "/doctor/dashboard",
      });
    }

    return NextResponse.json({
      appointment: {
        id: appointment.id,
        patientLabel: label,
        consultType,
        scheduledAt: appointment.scheduledAt,
        timed: !!bookAt,
        amount,
        paymentMethod: appointment.paymentMethod,
        paymentStatus,
      },
      patientCreated,
      payment,
    });
  } catch (err) {
    if (isSlotIndexViolation(err)) {
      return NextResponse.json({ error: "That time was just booked. Pick another slot.", code: "SLOT_TAKEN" }, { status: 409 });
    }
    // Two desks registered the same new number at once — the retry finds it.
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "This number was just registered. Please try again." }, { status: 409 });
    }
    console.error("Walk-in booking failed:", err);
    return NextResponse.json({ error: "Booking failed. Please try again." }, { status: 500 });
  }
});
