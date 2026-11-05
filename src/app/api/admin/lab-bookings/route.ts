import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { isLabBookingStatus, LAB_BOOKING_STATUSES } from "@/lib/labBookings";

// GET: lab booking requests, newest first. ?status=REQUESTED&q=<name/mobile>
export async function GET(req: Request) {
  const { denied } = await requireAdmin();
  if (denied) return denied;
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  // Unpaid checkouts the patient replaced with a new booking are noise here.
  const notReplaced: Prisma.LabBookingWhereInput = { OR: [{ cancelledBy: null }, { cancelledBy: { not: "SYSTEM" } }] };
  const where: Prisma.LabBookingWhereInput = { AND: [notReplaced] };
  if (status && status !== "ALL") {
    if (!isLabBookingStatus(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    where.status = status;
  }
  if (q) {
    (where.AND as Prisma.LabBookingWhereInput[]).push({ OR: [
      { patientName: { contains: q, mode: "insensitive" } },
      { patient: { name: { contains: q, mode: "insensitive" } } },
      { patient: { mobile: { contains: q } } },
      { id: q },
    ] });
  }
  const [bookings, grouped] = await Promise.all([
    prisma.labBooking.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        items: true,
        reports: { orderBy: { createdAt: "asc" } },
        patient: { select: { id: true, name: true, mobile: true } },
        appointment: { select: { id: true, scheduledAt: true, doctor: { select: { name: true } } } },
      },
    }),
    prisma.labBooking.groupBy({ by: ["status"], where: notReplaced, _count: { _all: true } }),
  ]);
  const counts = Object.fromEntries(LAB_BOOKING_STATUSES.map((s) => [s, grouped.find((g) => g.status === s)?._count._all ?? 0]));
  return NextResponse.json({ bookings, counts });
}
