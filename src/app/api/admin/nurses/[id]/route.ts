import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { revokeSessions } from "@/lib/auth";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { deleteAccount, DeletionBlockedError, accountDeletionPreview } from "@/lib/userDeletion";
import { accountImpact, impactConfirmationResponse, resolveProviderBookings } from "@/lib/accountImpact";
import { nurseApprovalChecklist } from "@/lib/nurseApproval";

const STATUS_PUSH_KEY = {
  APPROVED: "nurseApplicationApproved",
  REJECTED: "nurseApplicationRejected",
  SUSPENDED: "accountSuspended",
} as const;

// GET: one nurse in full, with recent visits and stats.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;

  const user = await prisma.user.findFirst({
    where: { id, role: "NURSE" },
    omit: { password: true },
    include: {
      nurseProfile: { include: { services: { include: { service: true } } } },
      asDoctor: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { patient: { select: { name: true, mobile: true } } },
      },
    },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [visits, approvalChecklist] = await Promise.all([
    prisma.appointment.groupBy({ by: ["status"], where: { doctorId: id }, _count: true }),
    // What approving needs, with each document's file checked (src/lib/nurseApproval.ts).
    user.nurseProfile ? nurseApprovalChecklist(user.nurseProfile) : null,
  ]);
  const count = (s: string) => visits.find((v) => v.status === s)?._count ?? 0;
  return NextResponse.json({
    ...user,
    approvalChecklist,
    stats: { completedCount: count("COMPLETED"), scheduledCount: count("SCHEDULED"), cancelledCount: count("CANCELLED") },
  });
}

// PATCH { status?, isVerified?, bookingAction?, confirmBookingIds? } —
// approve / reject / suspend / verify. Taking an approved nurse off the
// platform needs her upcoming bookings reviewed first (409
// ACCOUNT_HAS_IMPACT); on confirm they're cancelled + refunded and each
// patient notified (src/lib/accountImpact.ts).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const { status, isVerified, bookingAction, confirmBookingIds } = await req.json().catch(() => ({}));

  const profile = await prisma.nurseProfile.findFirst({ where: { userId: id, user: { role: "NURSE", deletedAt: null } } });
  if (!profile) return NextResponse.json({ error: "Nurse not found" }, { status: 404 });

  const data: { status?: string; isVerified?: boolean } = {};
  if (status !== undefined) {
    if (!["APPROVED", "REJECTED", "SUSPENDED", "PENDING"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    // Approval needs the full checklist — council number, base location and
    // every document, each one read back and checked to be the real file
    // type (src/lib/nurseApproval.ts). Re-saving an approved nurse skips it.
    if (status === "APPROVED" && profile.status !== "APPROVED") {
      const checklist = await nurseApprovalChecklist(profile);
      if (!checklist.ready) {
        const missing = checklist.items.filter((i) => !i.ok).map((i) => `${i.label} (${i.problem})`);
        return NextResponse.json(
          { error: `Cannot approve yet: ${missing.join("; ")}.`, code: "APPROVAL_CHECKLIST", checklist },
          { status: 400 }
        );
      }
    }
    data.status = status;
  }
  if (isVerified !== undefined) {
    // "Credentials verified" locks her documents — only for an approved nurse
    // whose checklist is complete.
    if (Boolean(isVerified)) {
      if ((data.status ?? profile.status) !== "APPROVED") {
        return NextResponse.json({ error: "Approve the nurse before marking her credentials verified." }, { status: 400 });
      }
      const checklist = await nurseApprovalChecklist(profile);
      if (!checklist.ready) {
        const missing = checklist.items.filter((i) => !i.ok).map((i) => `${i.label} (${i.problem})`);
        return NextResponse.json(
          { error: `Cannot verify yet: ${missing.join("; ")}.`, code: "APPROVAL_CHECKLIST", checklist },
          { status: 400 }
        );
      }
    }
    data.isVerified = Boolean(isVerified);
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const statusChanged = data.status !== undefined && data.status !== profile.status;
  const leavingApproved = statusChanged && profile.status === "APPROVED";
  if (leavingApproved) {
    const confirm = impactConfirmationResponse(await accountImpact(id, "NURSE", "suspend"), "NURSE", { bookingAction, confirmBookingIds });
    if (confirm) return confirm;
  }

  // Conditional on the status read above, so two admins acting at once can't
  // both change it (and both push her, or both sweep her bookings).
  const { count } = await prisma.nurseProfile.updateMany({ where: { userId: id, status: profile.status }, data });
  if (count === 0) {
    return NextResponse.json({ error: "This nurse was just updated by someone else. Please refresh." }, { status: 409 });
  }
  const updated = await prisma.nurseProfile.findUniqueOrThrow({ where: { userId: id } });
  // Sign them out everywhere; they can log back in, and then see the
  // suspended notice instead of a session that keeps working as before.
  if (statusChanged && data.status === "SUSPENDED") await revokeSessions(id);
  if (statusChanged && data.status && data.status in STATUS_PUSH_KEY) {
    void sendPushToUser(id, { key: STATUS_PUSH_KEY[data.status as keyof typeof STATUS_PUSH_KEY], url: "/nurse/dashboard" });
  }
  const bookings = leavingApproved ? await resolveProviderBookings(id, "NURSE", "CANCEL", "suspended") : null;
  return NextResponse.json({ ...updated, bookings });
}

// DELETE { confirmBookingIds? } – soft-delete and anonymize the nurse's
// account (src/lib/userDeletion.ts). Upcoming bookings are reviewed first
// (409 ACCOUNT_HAS_IMPACT); on confirm they're cancelled + refunded to the
// patients' wallets and each patient notified.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const { bookingAction, confirmBookingIds } = await req.json().catch(() => ({}));

  if (!(await prisma.user.findFirst({ where: { id, role: "NURSE", deletedAt: null }, select: { id: true } }))) {
    return NextResponse.json({ error: "Nurse not found" }, { status: 404 });
  }
  const { blocker } = await accountDeletionPreview(id, "NURSE");
  if (blocker) return NextResponse.json({ error: blocker }, { status: 409 });
  const confirm = impactConfirmationResponse(await accountImpact(id, "NURSE", "delete"), "NURSE", { bookingAction, confirmBookingIds });
  if (confirm) return confirm;

  let deleted;
  try {
    deleted = await deleteAccount(id, "NURSE");
  } catch (err) {
    if (err instanceof DeletionBlockedError) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
  if (!deleted) return NextResponse.json({ error: "Nurse not found" }, { status: 404 });
  return NextResponse.json({
    ...deleted.user,
    password: undefined,
    bookings: { cancelled: deleted.cancelledBookings, reassigned: 0, refundTotal: deleted.refundTotal },
  });
}
