import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { expireStalePendingRequests } from "@/lib/expireAppointments";
import { safeNum } from "@/lib/adminAuth";
import { resolveDoctorScope } from "@/lib/staffGuard";
import { resolveProviderScope } from "@/lib/providerGuard";
import { isDoctorBookable } from "@/lib/doctorBookable";
import { visitLocation } from "@/lib/visitAddress";
import { hasCareAccess } from "@/lib/careAccess";
import { GATEWAY_OMIT, withLiveLocationOnlyWhileLive } from "@/lib/appointmentView";
import { parseFeedView, feedWhere, feedPaging, feedResponse, badCursor } from "@/lib/appointmentFeed";
import { withErrorLocale } from "@/lib/apiErrors";

// GET: The logged-in user's own appointments (as patient or as doctor).
// ?view=active (polling) / ?view=history (paged) — see src/lib/appointmentFeed.ts.
export const GET = withErrorLocale(async function GET(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const parsed = await parseFeedView(req.url);
  if ("response" in parsed) return parsed.response;
  const { view } = parsed;

  await expireStalePendingRequests();

  if (authUser.role === "PATIENT") {
    const owner = { patientId: authUser.id };
    const bad = await badCursor(owner, view);
    if (bad) return bad;
    const appointments = await prisma.appointment.findMany({
      where: feedWhere(owner, view),
      ...feedPaging(view, [{ scheduledAt: "desc" }]),
      // No gateway ids or internal accounting; the visit code is the patient's own.
      omit: { ...GATEWAY_OMIT, settlementId: true, visitOtpAttempts: true, couponId: true },
      include: {
        doctor: {
          select: {
            name: true,
            role: true,
            deletedAt: true,
            doctorProfile: {
              select: {
                specialty: true, photoUrl: true, clinicName: true, address: true, lat: true, lng: true,
                status: true, isVerified: true, trialEndsAt: true, subscriptionPaidUntil: true,
              },
            },
          },
        },
        clinic: { select: { name: true, address: true, lat: true, lng: true } },
        review: true,
        medicines: true,
        attachments: true,
        reassignedTo: { select: { id: true, doctor: { select: { name: true } } } },
        package: { select: { visits: true, intervalDays: true } },
        nurseService: { select: { kind: true, durationMinutes: true } },
        vitals: { orderBy: { recordedAt: "desc" }, take: 1 },
        referralGiven: {
          select: {
            id: true, visits: true, intervalDays: true, instructions: true,
            service: { select: { id: true, name: true } },
            bookings: { where: { status: { in: ["PENDING_APPROVAL", "SCHEDULED", "COMPLETED"] } }, select: { id: true }, take: 1 },
          },
        },
        reassignedFrom: { select: { id: true, doctor: { select: { name: true } } } },
        _count: { select: { messages: { where: { senderId: { not: authUser.id }, readAt: null } } } },
      },
    });
    return feedResponse(owner, view,
      appointments.map(({ _count, doctor: { role, deletedAt, doctorProfile, ...doctor }, ...a }) => ({
        // The provider's position only while they're on the way (not after the visit).
        ...withLiveLocationOnlyWhileLive(a),
        // The bookable-rule fields are only read here, never sent to the client.
        doctor: {
          ...doctor,
          doctorProfile: doctorProfile && {
            specialty: doctorProfile.specialty, photoUrl: doctorProfile.photoUrl, clinicName: doctorProfile.clinicName,
            address: doctorProfile.address, lat: doctorProfile.lat, lng: doctorProfile.lng,
          },
        },
        // Whether "Book Follow-up" can go through (doctors only).
        doctorBookable: isDoctorBookable({ role, deletedAt, doctorProfile }),
        amount: safeNum(a.amount),
        platformFee: safeNum(a.platformFee),
        discountAmount: safeNum(a.discountAmount),
        unreadMessageCount: _count.messages,
      }))
    );
  }

  if (authUser.role === "DOCTOR" || authUser.role === "STAFF") {
    const scope = await resolveDoctorScope(authUser);
    if (scope.denied) return scope.denied;
    const owner = { doctorId: scope.doctorId };
    const bad = await badCursor(owner, view);
    if (bad) return bad;

    const appointments = await prisma.appointment.findMany({
      where: feedWhere(owner, view),
      // By visit time, soonest first — the queue order. (History lists on the
      // dashboard re-sort newest-first themselves.)
      ...feedPaging(view, [{ scheduledAt: "asc" }, { createdAt: "asc" }]),
      // The door code is the patient's; gateway ids are the admin's.
      omit: { ...GATEWAY_OMIT, visitOtp: true },
      include: {
        patient: {
          select: {
            name: true,
            mobile: true,
            // Read only for the HOME-visit fallback below — never sent.
            patientProfile: { select: { lat: true, lng: true, homeAddress: true, landmark: true, pinCode: true } },
          },
        },
        // So a cancelled consultation can show its (now void) referral for removal.
        referralGiven: { select: { id: true, service: { select: { name: true } } } },
        // The dashboard's clinic filter.
        clinic: { select: { name: true } },
        _count: { select: { messages: { where: { senderId: { not: authUser.id }, readAt: null } } } },
      },
    });
    // Vitals nurses recorded for these patients in the last 30 days — so at
    // the next consultation the doctor sees what happened in between. Only
    // for people the doctor currently has care access to (accepted visit, or
    // completed within the window — src/lib/careAccess.ts), never for a
    // pending, declined or long-past booking.
    // Judged on every visit with the person, not just this page/view of them.
    const person = (a: { patientId: string; dependentId: string | null }) => `${a.patientId}|${a.dependentId ?? ""}`;
    const allVisits = appointments.length
      ? await prisma.appointment.findMany({
          where: { doctorId: scope.doctorId, patientId: { in: [...new Set(appointments.map((a) => a.patientId))] } },
          select: { patientId: true, dependentId: true, status: true, scheduledAt: true },
        })
      : [];
    const visitsByPerson = new Map<string, typeof allVisits>();
    for (const a of allVisits) visitsByPerson.set(person(a), [...(visitsByPerson.get(person(a)) ?? []), a]);
    // A receptionist (STAFF) runs the queue — nurse vitals are clinical, for the doctor only.
    const withAccess = authUser.role === "STAFF"
      ? new Set<string>()
      : new Set([...visitsByPerson].filter(([, visits]) => hasCareAccess(visits)).map(([key]) => key));
    const active = appointments.filter((a) => withAccess.has(person(a)));
    const recentVitals = active.length
      ? await prisma.vitalReading.findMany({
          where: {
            patientId: { in: [...new Set(active.map((a) => a.patientId))] },
            recordedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
          orderBy: { recordedAt: "desc" },
          select: {
            patientId: true, dependentId: true, recordedAt: true, alertLevel: true, alerts: true,
            systolic: true, diastolic: true, pulse: true, spo2: true, temperatureC: true, sugarMgDl: true, sugarType: true,
          },
        }).then((rows) => rows.filter((v) => withAccess.has(person(v))))
      : [];
    const latestFor = (patientId: string, dependentId: string | null) =>
      recentVitals.find((v) => v.patientId === patientId && v.dependentId === dependentId) ?? null;
    const countFor = (patientId: string, dependentId: string | null) =>
      recentVitals.filter((v) => v.patientId === patientId && v.dependentId === dependentId).length;

    return feedResponse(owner, view,
      appointments.map(({ _count, patient: { patientProfile, ...patient }, ...a }) => ({
        ...a,
        // The saved home address never rides along on the queue: a desk could
        // otherwise book any number and read where that person lives.
        patient,
        amount: safeNum(a.amount),
        platformFee: safeNum(a.platformFee),
        unreadMessageCount: _count.messages,
        // Where to go for a HOME visit: the booking's snapshot. Only an older
        // row the patient booked themselves (asking the doctor to come home)
        // falls back to their profile address; a desk-made booking never does.
        visit: visitLocation(a, a.bookedById ? null : patientProfile),
        latestVitals: latestFor(a.patientId, a.dependentId),
        recentVitalsCount: countFor(a.patientId, a.dependentId),
      }))
    );
  }

  if (authUser.role === "NURSE") {
    const scope = await resolveProviderScope(authUser);
    if (scope.denied) return scope.denied;

    const owner = { doctorId: authUser.id };
    const bad = await badCursor(owner, view);
    if (bad) return bad;
    const appointments = await prisma.appointment.findMany({
      where: feedWhere(owner, view),
      ...feedPaging(view, [{ createdAt: "desc" }]),
      // The door code is the patient's to share — never the nurse's to read.
      omit: { ...GATEWAY_OMIT, visitOtp: true },
      include: {
        patient: {
          select: {
            name: true,
            mobile: true,
            patientProfile: { select: { lat: true, lng: true, homeAddress: true, landmark: true, pinCode: true, age: true, gender: true } },
          },
        },
        dependent: { select: { age: true, gender: true } },
        prescriptionDoc: { select: { title: true, fileUrl: true, fileName: true } },
        review: { select: { rating: true, comment: true } },
        package: { select: { visits: true, intervalDays: true } },
        nurseService: { select: { kind: true, durationMinutes: true } },
        vitals: { orderBy: { recordedAt: "desc" } },
        nurseReferral: {
          select: {
            instructions: true, visits: true, intervalDays: true,
            appointment: {
              select: {
                scheduledAt: true, doctorNotes: true,
                doctor: { select: { name: true } },
                medicines: { select: { name: true, dosage: true, frequency: true, duration: true, instructions: true } },
              },
            },
          },
        },
        _count: { select: { messages: { where: { senderId: { not: authUser.id }, readAt: null } } } },
      },
    });
    return feedResponse(owner, view,
      appointments.map(({ _count, ...a }) => ({
        ...a,
        amount: safeNum(a.amount),
        platformFee: safeNum(a.platformFee),
        unreadMessageCount: _count.messages,
        // Where to go: the booking's snapshot (profile for older rows).
        visit: visitLocation(a, a.patient.patientProfile),
      }))
    );
  }

  return NextResponse.json({ error: "Not authorized" }, { status: 403 });
});
