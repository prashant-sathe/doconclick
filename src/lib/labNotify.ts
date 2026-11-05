import { sendPushToAdmins, sendPushToUser } from "@/lib/firebaseAdmin";
import type { LabSettleResult } from "@/lib/labBookings";

// Pushes after an online lab payment settles (webhook or verify).
export function notifyLabSettled(result: LabSettleResult) {
  if (result.outcome === "paid") {
    void sendPushToUser(result.patientId, { key: "labBookingPaidOnline", values: { amount: result.amount }, url: "/patient/lab-tests" });
    void sendPushToAdmins({
      key: "labBookingNew",
      values: { patient: result.patientName, count: result.count, amount: result.amount },
      url: "/admin/lab-bookings",
    });
  } else if (result.outcome === "credited") {
    void sendPushToUser(result.patientId, { key: "labPaymentCreditedToWallet", values: { amount: result.amount }, url: "/patient/wallet" });
  }
}
