import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { getAuthUser } from "@/lib/auth";
import { formatDoctorName } from "@/lib/utils";
import { requireActiveDoctor } from "@/lib/doctorGuard";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import {
  cancelManyAndRefund, isAlreadyClosed, isTransientConflict,
  needsBookingConfirmation, affectedBookingSummary, BOOKINGS_CHANGED_MESSAGE,
} from "@/lib/appointmentCancel";

interface SlotInput {
  dayOfWeek: string;
  fromTime: string;
  toTime: string;
}

interface ClinicInput {
  name: string;
  address: string;
  photoUrl?: string | null;
  lat: number;
  lng: number;
  sortOrder?: number;
  isActive?: boolean;
  slots: SlotInput[];
  confirmBookingIds?: string[];
}

async function loadOwnedClinic(doctorId: string, id: string) {
  const clinic = await prisma.clinic.findUnique({ where: { id } });
  if (!clinic || clinic.doctorId !== doctorId || clinic.deletedAt) return null;
  return clinic;
}

// Bookings that would be stranded if this clinic closed: every scheduled
// visit from now on, plus any still-pending request (a "book now" request's
// time is already in the past). Past visits nobody closed are left alone —
// they keep their clinic, and refunding one that may have happened is wrong.
function openClinicBookings(clinicId: string) {
  return prisma.appointment.findMany({
    where: {
      clinicId,
      OR: [{ status: "SCHEDULED", scheduledAt: { gte: new Date() } }, { status: "PENDING_APPROVAL" }],
    },
    orderBy: { scheduledAt: "asc" },
    include: { patient: { select: { name: true } } },
  });
}

const fmtWhen = (d: Date) =>
  d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// Deactivating or deleting a clinic with open bookings needs the doctor to
// confirm (409 CLINIC_HAS_BOOKINGS lists them); confirming cancels them —
// refunded to the patient's wallet or coupon freed, through the shared
// cancel path — in the same transaction as `close`, then pushes each patient.
// Returns a response to send, or the close's result plus what was cancelled.
async function closeClinic<T>(
  clinic: { id: string; name: string },
  doctorName: string,
  action: "deactivate" | "delete",
  confirmBookingIds: unknown,
  close: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<NextResponse | { result: T; cancelledBookings: number; refundTotal: number }> {
  const affected = await openClinicBookings(clinic.id);
  if (needsBookingConfirmation(affected, confirmBookingIds)) {
    return NextResponse.json(
      {
        error: `Patients have upcoming bookings at this clinic. Confirm to cancel and refund them before you ${action} it.`,
        code: "CLINIC_HAS_BOOKINGS",
        bookings: affected.map(affectedBookingSummary),
      },
      { status: 409 }
    );
  }

  let out;
  try {
    out = await prisma.$transaction(async (tx) => {
      const cancelled = await cancelManyAndRefund(tx, affected.map((a) => a.id), {
        data: { doctorNotes: `Cancelled: the doctor ${action === "delete" ? "removed" : "closed"} this clinic` },
        note: (apptId) => `Refund for appointment ${apptId}, cancelled because the clinic was ${action === "delete" ? "removed" : "closed"}`,
      });
      return { result: await close(tx), cancelled };
    }, { timeout: 30_000 });
  } catch (err) {
    // A booking changed between the list and the confirm; nothing was written.
    if (isAlreadyClosed(err) || isTransientConflict(err)) {
      return NextResponse.json({ error: BOOKINGS_CHANGED_MESSAGE }, { status: 409 });
    }
    throw err;
  }

  for (const { cancelled, refund } of out.cancelled) {
    void sendPushToUser(cancelled.patientId, {
      title: "Appointment cancelled",
      body: `${doctorName} is no longer seeing patients at ${clinic.name}, so your appointment on ${fmtWhen(cancelled.scheduledAt)} was cancelled.`
        + (refund > 0 ? ` ₹${refund} was refunded to your wallet.` : "")
        + " Please book again.",
      url: "/patient/appointments",
    });
  }
  return {
    result: out.result,
    cancelledBookings: out.cancelled.length,
    refundTotal: out.cancelled.reduce((sum, c) => sum + c.refund, 0),
  };
}

// PATCH: Update one of the logged-in doctor's clinics (fields + slots, slots are replaced wholesale)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const suspendedResponse = await requireActiveDoctor(authUser);
  if (suspendedResponse) return suspendedResponse;

  const { id } = await params;
  const existing = await loadOwnedClinic(authUser.id, id);
  if (!existing) {
    return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
  }

  const body: ClinicInput = await req.json();
  if (!body.address?.trim() || body.lat == null || body.lng == null) {
    return NextResponse.json({ error: "Address and location are required." }, { status: 400 });
  }
  if (!body.slots?.length) {
    return NextResponse.json({ error: "Please set at least one day-wise time slot." }, { status: 400 });
  }

  const isActive = body.isActive ?? existing.isActive;
  const save = async (tx: Prisma.TransactionClient) => {
    await tx.clinicSlot.deleteMany({ where: { clinicId: id } });
    await tx.clinicSlot.createMany({
      data: (body.slots ?? []).map((s) => ({ clinicId: id, dayOfWeek: s.dayOfWeek, fromTime: s.fromTime, toTime: s.toTime })),
    });
    return tx.clinic.update({
      where: { id },
      data: {
        name: body.name?.trim() || `${formatDoctorName(authUser.name)}'s Clinic`,
        address: body.address.trim(),
        photoUrl: body.photoUrl || null,
        lat: body.lat,
        lng: body.lng,
        sortOrder: body.sortOrder ?? existing.sortOrder,
        isActive,
      },
      include: { slots: true },
    });
  };

  // Turning an active clinic off strands its open bookings — same confirm,
  // cancel and refund as deleting it.
  if (existing.isActive && !isActive) {
    const closed = await closeClinic(existing, formatDoctorName(authUser.name), "deactivate", body.confirmBookingIds, save);
    if (closed instanceof NextResponse) return closed;
    return NextResponse.json({ ...closed.result, cancelledBookings: closed.cancelledBookings, refundTotal: closed.refundTotal });
  }

  return NextResponse.json(await prisma.$transaction(save));
}

// DELETE { confirmBookingIds? }: remove one of the logged-in doctor's
// clinics. Soft delete — the row stays (deletedAt + isActive false) so past
// appointments keep their clinic, and open bookings must be confirmed for
// cancel + refund first (see closeClinic).
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const suspendedResponse = await requireActiveDoctor(authUser);
  if (suspendedResponse) return suspendedResponse;

  const { id } = await params;
  const existing = await loadOwnedClinic(authUser.id, id);
  if (!existing) {
    return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
  }

  const { confirmBookingIds } = await req.json().catch(() => ({}));
  const closed = await closeClinic(existing, formatDoctorName(authUser.name), "delete", confirmBookingIds, (tx) =>
    tx.clinic.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } })
  );
  if (closed instanceof NextResponse) return closed;
  return NextResponse.json({ ok: true, cancelledBookings: closed.cancelledBookings, refundTotal: closed.refundTotal });
}
