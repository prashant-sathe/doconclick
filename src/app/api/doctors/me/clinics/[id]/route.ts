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
import { validateClinicInput } from "@/lib/clinicInput";


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
      key: "apptCancelledClinicClosed",
      values: { doctor: doctorName, clinic: clinic.name, when: cancelled.scheduledAt, refunded: refund > 0 ? "yes" : "no", amount: refund },
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

  const raw = await req.json().catch(() => ({}));
  const input = validateClinicInput(raw, existing.photoUrl);
  if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });
  const body = input.clinic;
  if (raw.isActive !== undefined && typeof raw.isActive !== "boolean") {
    return NextResponse.json({ error: "isActive must be true or false." }, { status: 400 });
  }

  const isActive: boolean = raw.isActive ?? existing.isActive;
  const save = async (tx: Prisma.TransactionClient) => {
    await tx.clinicSlot.deleteMany({ where: { clinicId: id } });
    await tx.clinicSlot.createMany({
      data: body.slots.map((s) => ({ clinicId: id, dayOfWeek: s.dayOfWeek, fromTime: s.fromTime, toTime: s.toTime })),
    });
    return tx.clinic.update({
      where: { id },
      data: {
        name: body.name || `${formatDoctorName(authUser.name)}'s Clinic`,
        address: body.address,
        photoUrl: body.photoUrl,
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
    const closed = await closeClinic(existing, formatDoctorName(authUser.name), "deactivate", raw.confirmBookingIds, save);
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
