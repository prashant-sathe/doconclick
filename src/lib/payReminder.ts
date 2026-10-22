import { prisma } from "@/lib/prisma";
import { netPayable } from "@/lib/coupons";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { formatProviderName } from "@/lib/utils";

// Nudging a patient who hasn't paid for an accepted home visit — when the
// nurse/doctor is about to set off (src/app/api/appointments/[id]/travel), or
// on demand ("Remind to pay"). One push per visit per cooldown, recorded on
// Appointment.payReminderSentAt.

export const PAY_REMINDER_COOLDOWN_MS = 10 * 60_000;
export const UNPAID_VISIT_CODE = "UNPAID_VISIT";

type Appt = {
  id: string;
  patientId: string;
  providerType: string;
  serviceName: string | null;
  packageId: string | null;
  paymentMethod: string;
  paymentStatus: string;
  amount: number;
  discountAmount: number;
};

/** Paid online up front, and not paid yet (cash is collected at the visit). */
export const isUnpaidOnline = (a: { paymentMethod: string; paymentStatus: string }) =>
  a.paymentMethod === "ONLINE" && a.paymentStatus !== "PAID";

/** What the patient has to pay: this visit — or, for a package, every accepted unpaid visit (one checkout). */
export async function amountDue(appt: Appt): Promise<number> {
  if (!appt.packageId) return netPayable(appt);
  const visits = await prisma.appointment.findMany({
    where: { packageId: appt.packageId, status: "SCHEDULED", paymentMethod: "ONLINE", paymentStatus: { not: "PAID" } },
    select: { amount: true, discountAmount: true },
  });
  return Math.round(visits.reduce((sum, v) => sum + netPayable(v), 0) * 100) / 100;
}

/**
 * Pushes the patient a pay reminder unless one went out within the cooldown.
 * `sent` false = throttled; `at` is when the last one went.
 */
export async function sendPayReminder(appt: Appt, providerName: string, reason: "leaving" | "manual"): Promise<{ sent: boolean; at: Date | null; amount: number }> {
  const amount = await amountDue(appt);
  const now = new Date();
  // Conditional, so two taps (or two devices) can't both send.
  const { count } = await prisma.appointment.updateMany({
    where: { id: appt.id, OR: [{ payReminderSentAt: null }, { payReminderSentAt: { lt: new Date(now.getTime() - PAY_REMINDER_COOLDOWN_MS) } }] },
    data: { payReminderSentAt: now },
  });
  if (count === 0) {
    const row = await prisma.appointment.findUnique({ where: { id: appt.id }, select: { payReminderSentAt: true } });
    return { sent: false, at: row?.payReminderSentAt ?? null, amount };
  }
  const who = formatProviderName(providerName, appt.providerType);
  const what = appt.providerType === "NURSE" ? `${appt.serviceName ?? "home"} visit` : "home visit";
  void sendPushToUser(appt.patientId, {
    title: "Payment pending for your visit",
    body: reason === "leaving"
      ? `${who} is about to leave for your ${what}. Please pay ₹${amount} now so the visit can go ahead.`
      : `Please pay ₹${amount} for your ${what} with ${who} — it's confirmed, and payment is the last step.`,
    url: `/patient/payment?apptId=${appt.id}`,
  });
  return { sent: true, at: now, amount };
}
