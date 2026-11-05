import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { readJson } from "@/lib/routeGuards";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { ADMIN_NOTE_MAX, ADMIN_SETTABLE_STATUSES, cancelLabBooking, isLabBookingStatus } from "@/lib/labBookings";

const STATUS_PUSH: Record<string, "labBookingConfirmed" | "labBookingSampleCollected" | "labBookingCompleted" | null> = {
  REQUESTED: null,
  CONFIRMED: "labBookingConfirmed",
  SAMPLE_COLLECTED: "labBookingSampleCollected",
  COMPLETED: "labBookingCompleted",
};

// PATCH: the admin moves a paid request along by hand.
//   { status }    — REQUESTED / CONFIRMED / SAMPLE_COLLECTED / COMPLETED / CANCELLED
//   { adminNote } — shown to the patient ("" clears it)
// A cancelled booking is final; cancelling refunds the payment to the wallet.
// A booking still waiting for its online payment can only be cancelled.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authUser, denied } = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;

  let adminNote: string | null | undefined;
  if (body.adminNote !== undefined) {
    if (body.adminNote !== null && typeof body.adminNote !== "string") return NextResponse.json({ error: "adminNote must be text." }, { status: 400 });
    adminNote = typeof body.adminNote === "string" ? body.adminNote.trim() || null : null;
    if (adminNote && adminNote.length > ADMIN_NOTE_MAX) return NextResponse.json({ error: `Note is too long (max ${ADMIN_NOTE_MAX} characters).` }, { status: 400 });
  }
  const status = body.status;
  if (status !== undefined && !(isLabBookingStatus(status) && ADMIN_SETTABLE_STATUSES.includes(status))) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (status === undefined && adminNote === undefined) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const booking = await prisma.labBooking.findUnique({ where: { id } });
  if (!booking) return NextResponse.json({ error: "Lab booking not found" }, { status: 404 });
  if (booking.status === "CANCELLED") return NextResponse.json({ error: "This booking was cancelled and can't be changed." }, { status: 409 });

  if (status === "CANCELLED") {
    if (booking.status === "COMPLETED") return NextResponse.json({ error: "A completed booking can't be cancelled." }, { status: 409 });
    const result = await cancelLabBooking(id, { role: "ADMIN", adminId: authUser.id, note: adminNote });
    if (!result) return NextResponse.json({ error: "This booking can't be cancelled any more." }, { status: 409 });
    void sendPushToUser(booking.patientId, {
      key: result.refunded ? "labBookingCancelledRefunded" : "labBookingCancelled",
      values: { amount: result.refunded },
      url: "/patient/lab-tests",
    });
    return NextResponse.json(await fullBooking(id));
  }

  if (booking.status === "PENDING_PAYMENT") return NextResponse.json({ error: "This booking is waiting for the patient's payment." }, { status: 409 });

  // Guarded on the status we read, so a parallel patient cancel wins cleanly.
  const updated = await prisma.labBooking.updateMany({
    where: { id, status: booking.status },
    data: {
      ...(status ? { status } : {}),
      ...(adminNote !== undefined ? { adminNote } : {}),
    },
  });
  if (updated.count === 0) return NextResponse.json({ error: "This booking changed meanwhile — refresh and try again." }, { status: 409 });

  const pushKey = status && status !== booking.status ? STATUS_PUSH[status] ?? null : null;
  if (pushKey) void sendPushToUser(booking.patientId, { key: pushKey, url: "/patient/lab-tests" });
  return NextResponse.json(await fullBooking(id));
}

function fullBooking(id: string) {
  return prisma.labBooking.findUnique({
    where: { id },
    include: {
      items: true,
      reports: { orderBy: { createdAt: "asc" } },
      patient: { select: { id: true, name: true, mobile: true } },
      appointment: { select: { id: true, scheduledAt: true, doctor: { select: { name: true } } } },
    },
  });
}
