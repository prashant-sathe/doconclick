import { prisma } from "@/lib/prisma";
import { createCashfreeOrder } from "@/lib/cashfree";
import { externalOrigin } from "@/lib/googleOAuth";
import { labOrderId } from "@/lib/labBookings";
import type { JWTPayload } from "@/lib/auth";

/**
 * Opens a Cashfree order for an unpaid ONLINE lab booking and remembers it on
 * the booking. Every retry gets a new order id (Cashfree ids are single-use);
 * a payment that still lands on an older one is settled by its booking id.
 */
export async function startLabCheckout(req: Request, user: JWTPayload, booking: { id: string; totalAmount: number }) {
  const orderId = labOrderId(booking.id);
  const origin = externalOrigin(req, new URL(req.url));
  const { paymentSessionId } = await createCashfreeOrder({
    orderId,
    amount: booking.totalAmount,
    customerId: user.id,
    customerName: user.name,
    customerPhone: user.mobile,
    returnUrl: `${origin}/patient/lab-tests?labOrder=${encodeURIComponent(orderId)}&booking=${booking.id}`,
    notifyUrl: `${origin}/api/payments/webhook`,
  });
  await prisma.labBooking.updateMany({ where: { id: booking.id, status: "PENDING_PAYMENT" }, data: { cashfreeOrderId: orderId } });
  return { paymentSessionId, orderId };
}
