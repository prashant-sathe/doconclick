import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { expireStalePendingRequests } from "@/lib/expireAppointments";
import { safeNum } from "@/lib/adminAuth";
import { resolveDoctorScope } from "@/lib/staffGuard";
import { resolveProviderScope } from "@/lib/providerGuard";
import { isDoctorBookable } from "@/lib/doctorBookable";

// GET: The logged-in user's own appointments (as patient or as doctor)
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  await expireStalePendingRequests();

  if (authUser.role === "PATIENT") {
    const appointments = await prisma.appointment.findMany({
      where: { patientId: authUser.id },
      orderBy: { scheduledAt: "desc" },
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
    return NextResponse.json(
      appointments.map(({ _count, doctor: { role, deletedAt, doctorProfile, ...doctor }, ...a }) => ({
        ...a,
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

    const appointments = await prisma.appointment.findMany({
      where: { doctorId: scope.doctorId },
      orderBy: [{ createdAt: "desc" }],
      include: {
        patient: {
          select: {
            name: true,
            mobile: true,
            patientProfile: { select: { lat: true, lng: true, homeAddress: true } },
          },
        },
        _count: { select: { messages: { where: { senderId: { not: authUser.id }, readAt: null } } } },
      },
    });
    // Vitals nurses recorded for these patients in the last 30 days — so at
    // the next consultation the doctor sees what happened in between.
    const active = appointments.filter((a) => ["PENDING_APPROVAL", "SCHEDULED", "COMPLETED"].includes(a.status));
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
        })
      : [];
    const latestFor = (patientId: string, dependentId: string | null) =>
      recentVitals.find((v) => v.patientId === patientId && v.dependentId === dependentId) ?? null;
    const countFor = (patientId: string, dependentId: string | null) =>
      recentVitals.filter((v) => v.patientId === patientId && v.dependentId === dependentId).length;

    return NextResponse.json(
      appointments.map(({ _count, ...a }) => ({
        ...a,
        amount: safeNum(a.amount),
        platformFee: safeNum(a.platformFee),
        unreadMessageCount: _count.messages,
        latestVitals: latestFor(a.patientId, a.dependentId),
        recentVitalsCount: countFor(a.patientId, a.dependentId),
      }))
    );
  }

  if (authUser.role === "NURSE") {
    const scope = await resolveProviderScope(authUser);
    if (scope.denied) return scope.denied;

    const appointments = await prisma.appointment.findMany({
      where: { doctorId: authUser.id },
      orderBy: [{ createdAt: "desc" }],
      // The door code is the patient's to share — never the nurse's to read.
      omit: { visitOtp: true },
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
    return NextResponse.json(
      appointments.map(({ _count, ...a }) => ({
        ...a,
        amount: safeNum(a.amount),
        platformFee: safeNum(a.platformFee),
        unreadMessageCount: _count.messages,
      }))
    );
  }

  return NextResponse.json({ error: "Not authorized" }, { status: 403 });
}
