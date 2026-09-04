import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { expireStalePendingRequests } from "@/lib/expireAppointments";
import { safeNum } from "@/lib/adminAuth";

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
        doctor: { select: { name: true, doctorProfile: { select: { specialty: true, photoUrl: true, clinicName: true, address: true, lat: true, lng: true } } } },
        clinic: { select: { name: true, address: true, lat: true, lng: true } },
        review: true,
        medicines: true,
        attachments: true,
        reassignedTo: { select: { id: true, doctor: { select: { name: true } } } },
        reassignedFrom: { select: { id: true, doctor: { select: { name: true } } } },
        _count: { select: { messages: { where: { senderId: { not: authUser.id }, readAt: null } } } },
      },
    });
    return NextResponse.json(
      appointments.map(({ _count, ...a }) => ({
        ...a,
        amount: safeNum(a.amount),
        platformFee: safeNum(a.platformFee),
        discountAmount: safeNum(a.discountAmount),
        unreadMessageCount: _count.messages,
      }))
    );
  }

  if (authUser.role === "DOCTOR") {
    const appointments = await prisma.appointment.findMany({
      where: { doctorId: authUser.id },
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
