import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, revokeSessions } from "@/lib/auth";
import { deleteAccount, DeletionBlockedError, accountDeletionPreview } from "@/lib/userDeletion";
import { accountImpact, impactConfirmationResponse, resolveProviderBookings, type BookingAction } from "@/lib/accountImpact";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { DOCTOR_REGISTRATION_FEE } from "@/lib/cashfree";

const MAX_REASON_LENGTH = 500;

const STATUS_PUSH_COPY: Record<string, { title: string; body: string }> = {
  APPROVED: { title: "Application approved", body: "Your doctor application has been approved." },
  REJECTED: { title: "Application not approved", body: "Your doctor application was not approved this time." },
  SUSPENDED: { title: "Account suspended", body: "Your account has been suspended by the admin." },
};

async function requireAdmin() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  return null;
}

// GET – full doctor profile for admin view
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

  // Live doctors only — this route must not expose or act on admins,
  // patients, or deleted accounts.
  const user = await prisma.user.findFirst({
    where: { id, role: "DOCTOR", deletedAt: null },
    include: {
      doctorProfile: true,
      clinics: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } },
      changeRequests: { where: { status: "PENDING" }, take: 1 },
      asDoctor: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { patient: { select: { name: true, mobile: true } } },
      },
    },
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const totalEarnings = user.asDoctor
    .filter((a) => a.status === "COMPLETED")
    .reduce((sum, a) => sum + (a.amount ?? 0), 0);

  const completedCount  = user.asDoctor.filter((a) => a.status === "COMPLETED").length;
  const scheduledCount  = user.asDoctor.filter((a) => a.status === "SCHEDULED").length;
  const cancelledCount  = user.asDoctor.filter((a) => a.status === "CANCELLED").length;
  // Kept separate from cancelledCount — a patient no-show isn't the doctor's
  // doing and shouldn't be read as a cancellation on their record.
  const noShowCount     = user.asDoctor.filter((a) => a.status === "NO_SHOW").length;

  const { changeRequests, ...rest } = user;
  return NextResponse.json({
    ...rest,
    // A verified doctor's pending registration/qualification/specialty change.
    pendingChangeRequest: changeRequests[0] ?? null,
    password: undefined,
    stats: { totalEarnings, completedCount, scheduledCount, cancelledCount, noShowCount },
  });
}

// PATCH { status?, rejectionReason?, isVerified? } – approve / reject /
// suspend / verify. Approval needs the documents patients' safety relies on
// (registration number + certificate, KYC) and the paid registration fee,
// like the nurse route; a rejection needs a reason, which is pushed to the
// doctor. Pushes go out only for an actual change, never for a re-send.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const { status, isVerified, rejectionReason, bookingAction, confirmBookingIds } = await req.json().catch(() => ({}));

  const target = await prisma.user.findFirst({
    where: { id, role: "DOCTOR", deletedAt: null },
    select: {
      doctorProfile: {
        select: { status: true, isVerified: true, medRegNo: true, medRegCertUrl: true, kycDocUrl: true, registrationFeePaid: true },
      },
    },
  });
  const profile = target?.doctorProfile;
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const feeDue = DOCTOR_REGISTRATION_FEE > 0 && !profile.registrationFeePaid;
  const data: { status?: string; isVerified?: boolean } = {};
  let reason = "";

  if (status !== undefined) {
    const valid = ["APPROVED", "REJECTED", "SUSPENDED", "PENDING"];
    if (!valid.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    if (status === "APPROVED" && status !== profile.status) {
      const missing = [
        !profile.medRegNo?.trim() && "a medical registration number",
        !profile.medRegCertUrl && "the registration certificate",
        !profile.kycDocUrl && "a government ID (KYC)",
      ].filter(Boolean);
      if (missing.length > 0) {
        return NextResponse.json(
          { error: `Cannot approve: the doctor hasn't added ${missing.join(", ")} yet.` },
          { status: 400 }
        );
      }
      if (feeDue) {
        return NextResponse.json(
          { error: `Cannot approve: the doctor hasn't paid the ₹${DOCTOR_REGISTRATION_FEE} registration fee yet.` },
          { status: 400 }
        );
      }
    }
    if (status === "REJECTED") {
      reason = typeof rejectionReason === "string" ? rejectionReason.trim() : "";
      if (!reason) {
        return NextResponse.json({ error: "Give a reason for the rejection — it's sent to the doctor." }, { status: 400 });
      }
      if (reason.length > MAX_REASON_LENGTH) {
        return NextResponse.json({ error: `Keep the reason under ${MAX_REASON_LENGTH} characters.` }, { status: 400 });
      }
    }
    data.status = status;
  }

  if (isVerified !== undefined) {
    if (isVerified && feeDue) {
      return NextResponse.json(
        { error: `Cannot verify: doctor hasn't paid the ₹${DOCTOR_REGISTRATION_FEE} registration fee yet.` },
        { status: 400 }
      );
    }
    data.isVerified = Boolean(isVerified);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Taking an approved doctor off the platform (suspend, reject, back to
  // pending) strands their upcoming bookings — the admin reviews those first
  // and picks cancel + refund or reassign (see src/lib/accountImpact.ts).
  const statusChanged = data.status !== undefined && data.status !== profile.status;
  const leavingApproved = statusChanged && profile.status === "APPROVED";
  if (leavingApproved) {
    const confirm = impactConfirmationResponse(await accountImpact(id, "DOCTOR", "suspend"), "DOCTOR", { bookingAction, confirmBookingIds });
    if (confirm) return confirm;
  }

  // Conditional on the status read above, so two admins acting at once can't
  // both "change" it (and both push the doctor).
  const { count } = await prisma.doctorProfile.updateMany({
    where: { userId: id, status: profile.status },
    data,
  });
  if (count === 0) {
    return NextResponse.json({ error: "This doctor was just updated by someone else. Please refresh." }, { status: 409 });
  }
  const updated = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: id } });

  // Sign them out everywhere; they can log back in, and then see the
  // suspended notice instead of a session that keeps working as before.
  if (statusChanged && data.status === "SUSPENDED") await revokeSessions(id);

  if (statusChanged && data.status === "REJECTED") {
    void sendPushToUser(id, {
      title: STATUS_PUSH_COPY.REJECTED.title,
      body: `${STATUS_PUSH_COPY.REJECTED.body} Reason: ${reason}`,
      url: "/doctor/dashboard",
    });
  } else if (statusChanged && data.status && STATUS_PUSH_COPY[data.status]) {
    void sendPushToUser(id, { ...STATUS_PUSH_COPY[data.status], url: "/doctor/dashboard" });
  }
  if (data.isVerified === true && !profile.isVerified) {
    void sendPushToUser(id, {
      title: "You're verified!",
      body: "Your profile is now visible to patients.",
      url: "/doctor/dashboard",
    });
  }

  // Now hidden from new bookings, so handle the ones they had (re-read, in
  // case one landed after the review).
  const bookings = leavingApproved
    ? await resolveProviderBookings(id, "DOCTOR", (bookingAction as BookingAction) ?? "CANCEL", "suspended")
    : null;

  return NextResponse.json({ ...updated, bookings });
}

// DELETE { bookingAction?, confirmBookingIds? } – soft-delete and anonymize
// the doctor's account (src/lib/userDeletion.ts), freeing their mobile/email
// for reuse. Upcoming bookings are reviewed first (409 ACCOUNT_HAS_IMPACT);
// on confirm they're reassigned where possible (REASSIGN) and the rest
// cancelled + refunded to the patients' wallets.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const { bookingAction, confirmBookingIds } = await req.json().catch(() => ({}));
  if (!(await prisma.user.findFirst({ where: { id, role: "DOCTOR", deletedAt: null }, select: { id: true } }))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Checked before anything moves, so a refusal never leaves bookings half-handled.
  const { blocker } = await accountDeletionPreview(id, "DOCTOR");
  if (blocker) return NextResponse.json({ error: blocker }, { status: 409 });
  const confirm = impactConfirmationResponse(await accountImpact(id, "DOCTOR", "delete"), "DOCTOR", { bookingAction, confirmBookingIds });
  if (confirm) return confirm;

  // Reassign what can be first; deleteAccount then cancels + refunds the
  // rest (and any open booking left from before now) as it deletes.
  const reassignedBookings = bookingAction === "REASSIGN"
    ? await resolveProviderBookings(id, "DOCTOR", "REASSIGN", "removed")
    : null;

  let deleted;
  try {
    deleted = await deleteAccount(id, "DOCTOR");
  } catch (err) {
    if (err instanceof DeletionBlockedError) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ...deleted.user,
    password: undefined,
    bookings: {
      reassigned: reassignedBookings?.reassigned ?? 0,
      cancelled: (reassignedBookings?.cancelled ?? 0) + deleted.cancelledBookings,
      refundTotal: (reassignedBookings?.refundTotal ?? 0) + deleted.refundTotal,
    },
  });
}

