import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

async function requireAdmin() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  return null;
}

// GET: doctors' platform-fee payments that were received but couldn't be
// applied automatically (src/lib/duesPayments.ts) — the visits they covered
// changed before the money landed. The admin settles them by hand.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const rows = await prisma.duesPayment.findMany({
    where: { status: "PAID", settlementId: null },
    orderBy: { paidAt: "asc" },
    include: { doctor: { select: { name: true, mobile: true, role: true } } },
  });
  return NextResponse.json(rows.map((r) => ({
    id: r.id,
    orderId: r.orderId,
    amount: r.amount,
    cfPaymentId: r.cfPaymentId,
    paidAt: r.paidAt,
    visits: (JSON.parse(r.appointmentIds) as string[]).length,
    doctorId: r.doctorId,
    doctorName: r.doctor.name,
    doctorMobile: r.doctor.mobile,
    providerRole: r.doctor.role,
  })));
}

// PATCH { id }: the admin has accounted for this payment (settled the
// doctor's visits, or refunded it) — take it off the review list.
export async function PATCH(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "string" || !id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const updated = await prisma.duesPayment.updateMany({ where: { id, status: "PAID", settlementId: null }, data: { status: "RESOLVED" } });
  if (updated.count === 0) return NextResponse.json({ error: "Already resolved." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
