import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserAny } from "@/lib/auth";
import { expireStalePendingRequests } from "@/lib/expireAppointments";
import { generateOtp } from "@/lib/otp";

// GET: The logged-in user's own appointments (as patient or as doctor)
export async function GET(req: Request) {
  const authUser = await getAuthUserAny(req);
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  await expireStalePendingRequests();

  if (authUser.role === "PATIENT") {
    const appointments = await prisma.appointment.findMany({
      where: { patientId: authUser.id },
      orderBy: { scheduledAt: "desc" },
      include: {
        doctor: { select: { name: true, doctorProfile: { select: { specialty: true, photoUrl: true } } } },
        review: true,
        medicines: true,
        attachments: true,
        _count: { select: { messages: { where: { senderId: { not: authUser.id }, readAt: null } } } },
      },
    });
    // Backfill for appointments accepted before OTP verification existed.
    await Promise.all(
      appointments
        .filter((a) => a.status === "SCHEDULED" && !a.otpCode)
        .map(async (a) => {
          a.otpCode = generateOtp();
          await prisma.appointment.update({ where: { id: a.id }, data: { otpCode: a.otpCode } });
        })
    );
    return NextResponse.json(
      appointments.map(({ _count, ...a }) => ({ ...a, unreadMessageCount: _count.messages }))
    );
  }

  // DOCTOR — never include otpCode; the patient-only visit-verification code.
  if (authUser.role === "DOCTOR") {
    const appointments = await prisma.appointment.findMany({
      where: { doctorId: authUser.id },
      orderBy: [{ isEmergency: "desc" }, { scheduledAt: "asc" }],
      include: {
        patient: {
          select: {
            name: true,
            mobile: true,
            patientProfile: { select: { lat: true, lng: true, homeAddress: true } },
          },
        },
        attachments: true,
        _count: { select: { messages: { where: { senderId: { not: authUser.id }, readAt: null } } } },
      },
    });
    return NextResponse.json(
      appointments.map(({ _count, otpCode: _otpCode, ...a }) => ({ ...a, unreadMessageCount: _count.messages }))
    );
  }

  return NextResponse.json({ error: "Not authorized" }, { status: 403 });
}
