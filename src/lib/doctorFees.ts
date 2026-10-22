import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { DEFAULT_DOCTOR_REGISTRATION_FEE } from "@/lib/cashfree";

export const DOCTOR_REGISTRATION_FEE_MAX = 100000;

/** The doctor registration fee the admin set in Settings (₹0 = free). */
export async function getDoctorRegistrationFee(): Promise<number> {
  const settings = await prisma.platformSettings.findFirst({ select: { doctorRegistrationFee: true } });
  const fee = settings?.doctorRegistrationFee;
  return typeof fee === "number" && Number.isFinite(fee) && fee >= 0 ? fee : DEFAULT_DOCTOR_REGISTRATION_FEE;
}

/** "₹99" — or "free" when the admin set it to ₹0. */
export function registrationFeeLabel(fee: number): string {
  return fee > 0 ? `₹${fee.toLocaleString("en-IN")}` : "free";
}

/**
 * Marks a doctor's registration fee paid: the one-time 6-month free trial of
 * patient access starts, the payment is logged and a reserved coupon is
 * confirmed. Used by the Cashfree webhook and by checkout itself when the fee
 * is ₹0 (no gateway order).
 */
export async function activateRegistration(
  profile: { id: string; userId: string },
  payment: { amount: number; discount: number; couponCode: string | null; cashfreePaymentId: string | null; orderId: string | null },
) {
  const sixMonthsOut = new Date();
  sixMonthsOut.setMonth(sixMonthsOut.getMonth() + 6);
  await prisma.$transaction([
    prisma.doctorProfile.update({
      where: { id: profile.id },
      data: {
        registrationFeePaid: true,
        registrationFeeStatus: "PAID",
        cashfreePaymentId: payment.cashfreePaymentId,
        // First-time-only free trial of patient-access — this only ever
        // fires once per doctor, at their one and only registration payment.
        trialEndsAt: sixMonthsOut,
      },
    }),
    prisma.doctorPaymentLog.create({
      data: {
        doctorId: profile.userId,
        type: "REGISTRATION",
        amount: payment.amount,
        couponCode: payment.discount > 0 ? payment.couponCode : null,
        discountAmount: payment.discount,
        cashfreePaymentId: payment.cashfreePaymentId,
      },
    }),
    ...(payment.orderId
      ? [prisma.couponRedemption.updateMany({ where: { orderId: payment.orderId, status: "RESERVED" }, data: { status: "CONFIRMED" } })]
      : []),
  ]);
  void sendPushToUser(profile.userId, {
    title: payment.amount > 0 ? "Registration fee received" : "Account activated",
    body: "Your application is now under review.",
    url: "/doctor/dashboard",
  });
}
