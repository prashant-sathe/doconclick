import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { resolveDoctorScope } from "@/lib/staffGuard";
import { cashDueProblem, CASH_DUE_LIMIT_CODE } from "@/lib/duesPayments";

// PATCH { paymentMethod: "CASH" | "ONLINE" }: the desk changes how a walk-in
// pays — the patient's phone can't pay online after all, or they'd rather
// scan than hand over cash. Only for bookings the doctor's side made
// (bookedById) and only while unpaid; a patient's own booking is always
// online. If an online payment for it still lands afterwards, settlement
// marks it paid online (src/lib/paymentOrders.ts), so nothing is lost.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const scope = await resolveDoctorScope(authUser);
  if (scope.denied) return scope.denied;
  const { id } = await params;

  const { paymentMethod } = await req.json().catch(() => ({}));
  if (paymentMethod !== "CASH" && paymentMethod !== "ONLINE") {
    return NextResponse.json({ error: "Choose cash or online." }, { status: 400 });
  }

  const appt = await prisma.appointment.findUnique({
    where: { id },
    select: { doctorId: true, bookedById: true, status: true, paymentStatus: true, paymentMethod: true, discountAmount: true },
  });
  if (!appt || appt.doctorId !== scope.doctorId) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (!appt.bookedById) {
    return NextResponse.json({ error: "Only walk-in bookings made from the clinic can change how they're paid." }, { status: 400 });
  }
  if (appt.paymentStatus === "PAID") return NextResponse.json({ error: "This appointment is already paid." }, { status: 400 });
  if (appt.status !== "SCHEDULED") {
    return NextResponse.json({ error: "This appointment is no longer active." }, { status: 400 });
  }
  if (paymentMethod === "CASH" && appt.discountAmount > 0) {
    return NextResponse.json({ error: "The patient applied a coupon for online payment — they need to pay online." }, { status: 400 });
  }
  if (appt.paymentMethod === paymentMethod) return NextResponse.json({ paymentMethod });
  if (paymentMethod === "CASH") {
    const due = await cashDueProblem(scope.doctorId, authUser.role === "STAFF" ? "staff" : "doctor");
    if (due) return NextResponse.json({ error: due.message, code: CASH_DUE_LIMIT_CODE }, { status: 403 });
  }

  // Conditional, so a payment settling at this moment wins.
  const updated = await prisma.appointment.updateMany({
    where: { id, status: "SCHEDULED", paymentStatus: { not: "PAID" } },
    data: { paymentMethod },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "This appointment just changed — refresh and try again." }, { status: 409 });
  }
  return NextResponse.json({ paymentMethod });
}
