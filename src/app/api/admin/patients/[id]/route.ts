import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { deleteAccount, DeletionBlockedError } from "@/lib/userDeletion";
import { accountImpact, impactConfirmationResponse } from "@/lib/accountImpact";

async function requireAdmin() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  return null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

  // Live patients only — this route must not expose or act on admins,
  // doctors, or deleted accounts.
  const user = await prisma.user.findFirst({
    where: { id, role: "PATIENT", deletedAt: null },
    include: {
      patientProfile: true,
      asPatient: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          doctor: { select: { name: true, mobile: true, doctorProfile: { select: { specialty: true } } } },
        },
      },
      complaints: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const totalSpent     = user.asPatient.filter((a) => a.status === "COMPLETED").reduce((s, a) => s + (a.amount ?? 0), 0);
  const completedCount = user.asPatient.filter((a) => a.status === "COMPLETED").length;
  const scheduledCount = user.asPatient.filter((a) => a.status === "SCHEDULED").length;
  const cancelledCount = user.asPatient.filter((a) => a.status === "CANCELLED").length;
  const noShowCount    = user.asPatient.filter((a) => a.status === "NO_SHOW").length;

  return NextResponse.json({
    ...user,
    password: undefined,
    stats: { totalSpent, completedCount, scheduledCount, cancelledCount, noShowCount },
  });
}

// DELETE { confirmBookingIds? } – soft-delete and anonymize the patient's
// account (src/lib/userDeletion.ts), freeing their mobile/email for reuse.
// Upcoming bookings and any wallet balance are reviewed first (409
// ACCOUNT_HAS_IMPACT); on confirm the bookings are cancelled + refunded to
// their wallet and the providers notified. Wallet money can't be used once
// the account is gone — the admin sees the total to pay out manually.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const { confirmBookingIds } = await req.json().catch(() => ({}));
  if (!(await prisma.user.findFirst({ where: { id, role: "PATIENT", deletedAt: null }, select: { id: true } }))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const confirm = impactConfirmationResponse(await accountImpact(id, "PATIENT", "delete"), "PATIENT", { confirmBookingIds });
  if (confirm) return confirm;

  let deleted;
  try {
    deleted = await deleteAccount(id, "PATIENT");
  } catch (err) {
    if (err instanceof DeletionBlockedError) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const wallet = await prisma.wallet.findUnique({ where: { userId: id }, select: { balance: true } });
  return NextResponse.json({
    ...deleted.user,
    password: undefined,
    bookings: { cancelled: deleted.cancelledBookings, refundTotal: deleted.refundTotal },
    walletBalance: wallet?.balance ?? 0,
  });
}
