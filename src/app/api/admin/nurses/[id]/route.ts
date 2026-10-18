import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { revokeSessions } from "@/lib/auth";
import { sendPushToUser } from "@/lib/firebaseAdmin";

const STATUS_PUSH_COPY: Record<string, { title: string; body: string }> = {
  APPROVED: { title: "Application approved", body: "Your nurse application has been approved — patients can now book you." },
  REJECTED: { title: "Application not approved", body: "Your nurse application was not approved this time." },
  SUSPENDED: { title: "Account suspended", body: "Your account has been suspended by the admin." },
};

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

  const visits = await prisma.appointment.groupBy({ by: ["status"], where: { doctorId: id }, _count: true });
  const count = (s: string) => visits.find((v) => v.status === s)?._count ?? 0;
  return NextResponse.json({
    ...user,
    stats: { completedCount: count("COMPLETED"), scheduledCount: count("SCHEDULED"), cancelledCount: count("CANCELLED") },
  });
}

// PATCH { status?, isVerified? } — approve / reject / suspend / verify.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const { status, isVerified } = await req.json().catch(() => ({}));

  const profile = await prisma.nurseProfile.findUnique({ where: { userId: id } });
  if (!profile) return NextResponse.json({ error: "Nurse not found" }, { status: 404 });

  const data: { status?: string; isVerified?: boolean } = {};
  if (status !== undefined) {
    if (!["APPROVED", "REJECTED", "SUSPENDED", "PENDING"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    // Registered nurses only — approval needs the council number and its certificate.
    if (status === "APPROVED" && (!profile.councilRegNo || !profile.councilCertUrl)) {
      return NextResponse.json(
        { error: "Cannot approve: the nurse hasn't added a Nursing Council registration number and certificate yet." },
        { status: 400 }
      );
    }
    if (status === "APPROVED" && (profile.lat == null || profile.lng == null)) {
      return NextResponse.json(
        { error: "Cannot approve: the nurse hasn't set their base location yet, so patients can't be matched to them." },
        { status: 400 }
      );
    }
    data.status = status;
  }
  if (isVerified !== undefined) data.isVerified = Boolean(isVerified);
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const updated = await prisma.nurseProfile.update({ where: { userId: id }, data });
  // Sign them out everywhere; they can log back in, and then see the
  // suspended notice instead of a session that keeps working as before.
  if (data.status === "SUSPENDED") await revokeSessions(id);
  if (data.status && data.status !== profile.status && STATUS_PUSH_COPY[data.status]) {
    void sendPushToUser(id, { ...STATUS_PUSH_COPY[data.status], url: "/nurse/dashboard" });
  }
  return NextResponse.json(updated);
}
