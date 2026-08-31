import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import {
  normalizeCode,
  netPayable,
  validateCoupon,
  reserveCoupon,
  releaseCouponRedemption,
} from "@/lib/coupons";

// The coupon can only be attached while the appointment is accepted but not
// yet paid — the same window the /patient/payment page is shown in.
async function loadPayableAppointment(appointmentId: string, patientId: string) {
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment || appointment.patientId !== patientId) {
    return { error: NextResponse.json({ error: "Appointment not found" }, { status: 404 }) };
  }
  if (
    appointment.status !== "SCHEDULED" ||
    appointment.paymentMethod !== "ONLINE" ||
    appointment.paymentStatus === "PAID"
  ) {
    return {
      error: NextResponse.json(
        { error: "A coupon can only be applied to an accepted appointment that hasn't been paid yet." },
        { status: 400 },
      ),
    };
  }
  return { appointment };
}

// POST: attach a coupon to an appointment and reserve a redemption slot.
export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { appointmentId, code } = await req.json();
  if (!appointmentId || typeof code !== "string" || !code.trim()) {
    return NextResponse.json({ error: "Enter a coupon code." }, { status: 400 });
  }

  const { appointment, error } = await loadPayableAppointment(appointmentId, authUser.id);
  if (error) return error;

  const coupon = await prisma.coupon.findUnique({ where: { code: normalizeCode(code) } });
  if (!coupon) {
    return NextResponse.json({ error: "That coupon code isn't valid." }, { status: 400 });
  }

  // Redemptions this patient has ever made for this coupon, excluding one that
  // may already be attached to *this* appointment (a re-apply of the same code).
  const redemptionCountForUser = await prisma.couponRedemption.count({
    where: { couponId: coupon.id, userId: authUser.id, appointmentId: { not: appointment.id } },
  });

  const result = validateCoupon({
    coupon,
    context: "APPOINTMENT",
    baseAmount: appointment.amount,
    consultType: appointment.consultType,
    redemptionCountForUser,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const { discountAmount } = result;

  try {
    await prisma.$transaction(async (tx) => {
      // Swap: drop any coupon already on this appointment first.
      await releaseCouponRedemption(tx, { appointmentId: appointment.id });

      const reserved = await reserveCoupon(tx, {
        coupon,
        userId: authUser.id,
        discountAmount,
        kind: "APPOINTMENT",
        appointmentId: appointment.id,
      });
      if (!reserved.ok) throw new Error("LIMIT_REACHED");

      await tx.appointment.update({
        where: { id: appointment.id },
        data: { couponId: coupon.id, couponCode: coupon.code, discountAmount },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "LIMIT_REACHED") {
      return NextResponse.json({ error: "This coupon has reached its usage limit." }, { status: 400 });
    }
    console.error("Failed to apply coupon", coupon.code, "to appointment", appointment.id, err);
    return NextResponse.json({ error: "Could not apply the coupon. Please try again." }, { status: 500 });
  }

  return NextResponse.json({
    discountAmount,
    netPayable: netPayable({ amount: appointment.amount, discountAmount }),
    coupon: { code: coupon.code, description: coupon.description },
  });
}

// DELETE: remove the coupon from an appointment and free its slot.
export async function DELETE(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { appointmentId } = await req.json();
  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }

  const { appointment, error } = await loadPayableAppointment(appointmentId, authUser.id);
  if (error) return error;

  await prisma.$transaction((tx) => releaseCouponRedemption(tx, { appointmentId: appointment.id }));

  return NextResponse.json({
    discountAmount: 0,
    netPayable: appointment.amount,
  });
}
