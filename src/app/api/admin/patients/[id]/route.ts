import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { deleteAccount, DeletionBlockedError } from "@/lib/userDeletion";

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

// DELETE – cancel + refund the patient's open bookings, then soft-delete and
// anonymize their account (src/lib/userDeletion.ts), freeing their mobile/email for reuse
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  let deleted;
  try {
    deleted = await deleteAccount(id, "PATIENT");
  } catch (err) {
    if (err instanceof DeletionBlockedError) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ...deleted.user, password: undefined });
}
