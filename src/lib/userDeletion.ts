import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { revokeSessions } from "@/lib/auth";
import { netPayable } from "@/lib/coupons";
import { cancelManyAndRefund, LIVE_STATUSES } from "@/lib/appointmentCancel";
import { sendPushToUser } from "@/lib/firebaseAdmin";

// Roles that can delete their own account in-app (Profile → Password &
// Security). Admins are removed by another admin; staff by their doctor.
export const SELF_DELETABLE_ROLES = ["PATIENT", "DOCTOR", "NURSE"];

export const IN_PROGRESS_MESSAGE =
  "A visit is in progress right now. Finish or sort it out with the other party first, then delete your account.";

// Thrown inside the deletion transaction to roll the whole thing back.
export class DeletionBlockedError extends Error {}

type OpenBooking = {
  travelStatus: string;
  visitStartedAt: Date | null;
};

// Once the doctor has arrived for a home visit (or a nurse has started one),
// cancelling would strand them mid-visit — same rule as the patient-cancel
// route, applied to both sides.
const isInProgress = (a: OpenBooking) => a.travelStatus === "ARRIVED" || !!a.visitStartedAt;

// Patients own bookings as patientId; doctors and nurses both as doctorId.
function openBookingsWhere(userId: string, role: string): Prisma.AppointmentWhereInput | null {
  if (role === "PATIENT") return { patientId: userId, status: { in: LIVE_STATUSES } };
  if (role === "DOCTOR" || role === "NURSE") return { doctorId: userId, status: { in: LIVE_STATUSES } };
  return null;
}

// What deleting would do, for the confirmation screen.
export async function accountDeletionPreview(userId: string, role: string) {
  const where = openBookingsWhere(userId, role);
  const open = where
    ? await prisma.appointment.findMany({
        where,
        select: { paymentStatus: true, amount: true, discountAmount: true, travelStatus: true, visitStartedAt: true },
      })
    : [];
  const refundTotal = open.filter((a) => a.paymentStatus === "PAID").reduce((sum, a) => sum + netPayable(a), 0);
  const wallet = role === "PATIENT"
    ? await prisma.wallet.findUnique({ where: { userId }, select: { balance: true } })
    : null;
  return {
    openBookings: open.length,
    refundTotal,
    // What a patient's wallet will hold once the refunds above land.
    walletBalanceAfter: role === "PATIENT" ? (wallet?.balance ?? 0) + refundTotal : 0,
    blocker: open.some(isInProgress) ? IN_PROGRESS_MESSAGE : null,
  };
}

type Cancelled = {
  id: string;
  patientId: string;
  doctorId: string;
  providerType: string;
  scheduledAt: Date;
  refund: number;
};

// Cancels every open booking the user is party to, through the shared
// cancel-and-refund path (paid → patient's wallet, unpaid → coupon slot
// back). One a concurrent request already closed is skipped, not refunded twice.
async function cancelOpenBookings(tx: Prisma.TransactionClient, userId: string, role: string): Promise<Cancelled[]> {
  const where = openBookingsWhere(userId, role);
  if (!where) return [];
  const open = await tx.appointment.findMany({ where });
  if (open.some(isInProgress)) throw new DeletionBlockedError(IN_PROGRESS_MESSAGE);

  const by = role === "PATIENT" ? "the patient" : `the ${role === "NURSE" ? "nurse" : "doctor"}`;
  const results = await cancelManyAndRefund(tx, open.map((a) => a.id), {
    note: (id) => `Refund for appointment ${id}, cancelled because ${by} deleted their account`,
    skipClosed: true,
  });
  const cancelled: Cancelled[] = results.map(({ cancelled: row, refund }) => ({
    id: row.id, patientId: row.patientId, doctorId: row.doctorId, providerType: row.providerType, scheduledAt: row.scheduledAt, refund,
  }));
  return cancelled;
}

// Wipes personal data while keeping the row (and everything hanging off it)
// for the other party's history and the payout audit trail. Patients lose
// their name too; doctors and nurses keep name, qualification, registration
// number and signature, since those are printed on prescriptions and visit
// records patients still rely on.
async function anonymize(tx: Prisma.TransactionClient, userId: string, role: string) {
  await tx.user.update({
    where: { id: userId },
    data: {
      ...(role === "PATIENT" ? { name: "Deleted user" } : {}),
      // Derived from the id, not the old number, so nothing identifying is
      // left and the mobile/email are free for a new registration.
      mobile: `deleted_${userId}`,
      email: null,
      password: "",
      photoUrl: null,
    },
  });
  await tx.pushToken.deleteMany({ where: { userId } });

  if (role === "PATIENT") {
    const cleared = {
      bloodGroup: null, height: null, weight: null, allergies: null, chronicDiseases: null,
      medications: null, surgeries: null, emergencyContactName: null, emergencyContactPhone: null,
    };
    await tx.patientProfile.updateMany({
      where: { userId },
      data: { ...cleared, location: null, homeAddress: null, landmark: null, pinCode: null, photoUrl: null, lat: null, lng: null, searchRadiusKm: null },
    });
    await tx.patientDependent.updateMany({ where: { patientProfile: { userId } }, data: cleared });
    // Documents a completed nurse visit relied on (its prescription) are part
    // of that visit's record; everything else in the vault goes.
    await tx.patientDocument.deleteMany({ where: { patientId: userId, nurseBookings: { none: { status: "COMPLETED" } } } });
    // Self-logged readings only — ones taken during a visit belong to it.
    await tx.vitalReading.deleteMany({ where: { patientId: userId, appointmentId: null } });
    await tx.savedDoctor.deleteMany({ where: { patientId: userId } });
    // Home-visit addresses copied onto their bookings are the same personal
    // data as the profile address — the visit records stay, the address goes.
    await tx.appointment.updateMany({
      where: { patientId: userId },
      data: { visitAddress: null, visitLandmark: null, visitPinCode: null, visitLat: null, visitLng: null },
    });
  }

  if (role === "DOCTOR") {
    await tx.doctorProfile.updateMany({
      where: { userId },
      data: {
        photoUrl: null, bio: null, address: null, lat: null, lng: null, clinicPhotoUrl: null,
        medRegCertUrl: null, degreeCertUrl: null, kycDocUrl: null,
      },
    });
    await tx.clinic.updateMany({ where: { doctorId: userId }, data: { isActive: false } });
    await tx.savedDoctor.deleteMany({ where: { doctorId: userId } });
  }

  if (role === "NURSE") {
    await tx.nurseProfile.updateMany({
      where: { userId },
      data: {
        photoUrl: null, bio: null, address: null, lat: null, lng: null,
        councilCertUrl: null, degreeCertUrl: null, kycDocUrl: null, policeVerifUrl: null,
      },
    });
  }
}

// Deletes an account: cancels + refunds its open bookings, soft-deletes the
// User (blocks login, hides it from every list) and anonymizes its personal
// data — all in one transaction, so a failure leaves nothing half-done.
// Appointments, reviews, messages and settlements are kept for the other
// party's history and the payout audit trail. A doctor's staff accounts go
// with them.
//
// Only acts on a live account of the given role — returns null for a wrong
// role (so e.g. the patients route can't remove an admin and bypass the
// last-admin guard), an unknown id, or an already deleted user. Throws
// DeletionBlockedError while a visit is in progress.
export async function deleteAccount(userId: string, role: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, role, deletedAt: null } });
  if (!user) return null;

  const result = await prisma.$transaction(async (tx) => {
    // Claimed first and conditionally, so two concurrent deletes can't both
    // run, and the account stops accepting new bookings before the sweep.
    const claimed = await tx.user.updateMany({
      where: { id: userId, role, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (claimed.count === 0) return null;

    const cancelled = await cancelOpenBookings(tx, userId, role);
    await anonymize(tx, userId, role);

    let staffIds: string[] = [];
    if (role === "DOCTOR") {
      staffIds = (await tx.staffProfile.findMany({ where: { doctorId: userId }, select: { userId: true } })).map((s) => s.userId);
      await tx.staffProfile.updateMany({ where: { doctorId: userId }, data: { active: false } });
      await tx.user.updateMany({ where: { id: { in: staffIds }, deletedAt: null }, data: { deletedAt: new Date() } });
      for (const staffId of staffIds) await anonymize(tx, staffId, "STAFF");
    }
    return { cancelled, staffIds };
  }, { timeout: 30_000 });
  if (!result) return null;

  // deletedAt alone already fails verifySession, but this also evicts the
  // cached session state so they're signed out immediately.
  for (const id of [userId, ...result.staffIds]) await revokeSessions(id);

  for (const a of result.cancelled) notifyCancelled(a, user.name, role);

  const deleted = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return {
    user: deleted,
    cancelledBookings: result.cancelled.length,
    refundTotal: result.cancelled.reduce((sum, a) => sum + a.refund, 0),
  };
}

const fmtIST = (d: Date) =>
  d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

function notifyCancelled(a: Cancelled, name: string, role: string) {
  if (role === "PATIENT") {
    void sendPushToUser(a.doctorId, {
      title: "Appointment cancelled",
      body: `${name} closed their DocOnClick account, so their appointment on ${fmtIST(a.scheduledAt)} was cancelled.`,
      url: a.providerType === "NURSE" ? "/nurse/dashboard" : "/doctor/dashboard",
    });
    return;
  }
  const who = role === "NURSE" ? name : `Dr. ${name}`;
  void sendPushToUser(a.patientId, {
    title: "Appointment cancelled",
    body: a.refund > 0
      ? `${who} is no longer on DocOnClick, so your appointment on ${fmtIST(a.scheduledAt)} was cancelled. ₹${a.refund} was refunded to your wallet — please book again.`
      : `${who} is no longer on DocOnClick, so your appointment on ${fmtIST(a.scheduledAt)} was cancelled. Please book again.`,
    url: "/patient/appointments",
  });
}
