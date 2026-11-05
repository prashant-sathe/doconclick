import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrCreateWallet } from "@/lib/wallet";
import { labTestPrice, resolveLabTest } from "@/lib/labTests";
import { creditFeePaymentToWallet } from "@/lib/paymentOrders";
import { PIN_CODE, collectionSlotProblem, labPin } from "@/lib/labShare";

// Lab test bookings: a patient books the catalogue tests from a completed
// doctor consultation's prescription and pays up front — from the wallet
// (debited at once) or online through Cashfree. Admins then move the request
// along by hand and upload the report.

// Short: Cashfree order ids are at most 45 characters (labt + 25-char id + _ + 13-digit ms = 43).
export const LAB_ORDER_PREFIX = "labt";
export const LAB_BOOKING_STATUSES = ["PENDING_PAYMENT", "REQUESTED", "CONFIRMED", "SAMPLE_COLLECTED", "COMPLETED", "CANCELLED"] as const;
export type LabBookingStatus = (typeof LAB_BOOKING_STATUSES)[number];
export const isLabBookingStatus = (v: unknown): v is LabBookingStatus =>
  typeof v === "string" && (LAB_BOOKING_STATUSES as readonly string[]).includes(v);
/** What an admin may set by hand (PENDING_PAYMENT only ends by paying or cancelling). */
export const ADMIN_SETTABLE_STATUSES: LabBookingStatus[] = ["REQUESTED", "CONFIRMED", "SAMPLE_COLLECTED", "COMPLETED", "CANCELLED"];
export const LAB_PAYMENT_METHODS = ["WALLET", "ONLINE"] as const;
export type LabPaymentMethod = (typeof LAB_PAYMENT_METHODS)[number];
/** Paid bookings still in progress — at most one of these per consultation. */
export const OPEN_LAB_STATUSES: LabBookingStatus[] = ["REQUESTED", "CONFIRMED", "SAMPLE_COLLECTED"];
export const ADMIN_NOTE_MAX = 500;
const ADDRESS_MAX = 500;
const NOTES_MAX = 300;

type Client = typeof prisma | Prisma.TransactionClient;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const same = (a: number, b: number) => Math.abs(a - b) < 0.005;

export class LabBookingError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

/**
 * The prescription's tests with what the patient would pay. A row is bookable
 * when it maps to an active catalogue test — the id saved with the
 * prescription, or (for an older prescription / a test added later) the name
 * rules in resolveLabTest().
 */
export async function prescriptionLabTests(client: Client, appointmentId: string) {
  const [rows, catalogue] = await Promise.all([
    client.prescriptionTest.findMany({ where: { appointmentId }, orderBy: { id: "asc" } }),
    client.labTest.findMany({ where: { isActive: true } }),
  ]);
  const byId = new Map(catalogue.map((t) => [t.id, t]));
  return rows.map((r) => {
    const test = (r.labTestId ? byId.get(r.labTestId) : undefined) ?? resolveLabTest(r.name, catalogue);
    return {
      id: r.id,
      name: r.name,
      instructions: r.instructions,
      labTest: test ? { id: test.id, name: test.name, price: labTestPrice(test) } : null,
    };
  });
}

/** The consultation a patient may book tests from — their own, completed, by a doctor. */
async function bookableAppointment(client: Client, patientId: string, appointmentId: string) {
  const appt = await client.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true, patientId: true, status: true, providerType: true, patientName: true,
      dependent: { select: { name: true, age: true, gender: true } },
      patient: { select: { name: true, patientProfile: { select: { age: true, gender: true } } } },
    },
  });
  if (!appt || appt.patientId !== patientId) throw new LabBookingError("Appointment not found", 404);
  if (appt.status !== "COMPLETED" || appt.providerType === "NURSE") {
    throw new LabBookingError("Lab tests can be booked once the doctor completes your consultation.", 409, "NOT_COMPLETED");
  }
  return appt;
}

/** Who the sample is from: the family member the visit was for, else the account holder. */
function subject(appt: Awaited<ReturnType<typeof bookableAppointment>>) {
  if (appt.dependent) return { name: appt.patientName || appt.dependent.name, age: appt.dependent.age ?? null, gender: appt.dependent.gender ?? null };
  return { name: appt.patientName || appt.patient.name || "Patient", age: appt.patient.patientProfile?.age ?? null, gender: appt.patient.patientProfile?.gender ?? null };
}

/** What the booking page shows: the bookable tests, the open booking (if any) and the wallet balance. */
export async function labBookingQuote(patientId: string, appointmentId: string) {
  const appt = await bookableAppointment(prisma, patientId, appointmentId);
  const [tests, openBooking, wallet, profile] = await Promise.all([
    prescriptionLabTests(prisma, appointmentId),
    prisma.labBooking.findFirst({ where: { appointmentId, status: { in: OPEN_LAB_STATUSES } }, select: { id: true, status: true } }),
    prisma.wallet.findUnique({ where: { userId: patientId }, select: { balance: true } }),
    prisma.patientProfile.findUnique({ where: { userId: patientId }, select: { homeAddress: true, landmark: true, pinCode: true, lat: true, lng: true } }),
  ]);
  const address = [profile?.homeAddress, profile?.landmark].map((s) => s?.trim()).filter(Boolean).join(", ");
  const who = subject(appt);
  return {
    appointmentId,
    patientName: who.name,
    patientAge: who.age,
    patientGender: who.gender,
    // Where the map opens — the patient still drops the pin themselves.
    mapCenter: labPin(profile?.lat, profile?.lng),
    defaultPinCode: profile?.pinCode && PIN_CODE.test(profile.pinCode.trim()) ? profile.pinCode.trim() : "",
    tests,
    openBooking,
    walletBalance: wallet?.balance ?? 0,
    defaultAddress: address,
  };
}

export type LabBookingInput = {
  appointmentId: string; labTestIds: string[]; address: string; pinCode: string; lat: number; lng: number;
  collectionDate: string; collectionSlot: string; notes: string | null; paymentMethod: LabPaymentMethod;
};

export function parseLabBookingInput(body: Record<string, unknown>, now: Date = new Date()): { data: LabBookingInput } | { error: string } {
  const appointmentId = typeof body.appointmentId === "string" ? body.appointmentId : "";
  if (!appointmentId) return { error: "Missing appointmentId" };
  if (!Array.isArray(body.labTestIds) || body.labTestIds.some((id) => typeof id !== "string")) return { error: "Pick at least one test." };
  const labTestIds = [...new Set(body.labTestIds as string[])];
  if (labTestIds.length === 0) return { error: "Pick at least one test." };
  if (labTestIds.length > 50) return { error: "Too many tests in one booking." };
  const address = typeof body.address === "string" ? body.address.trim() : "";
  if (address.length < 5) return { error: "Enter the address for sample collection." };
  if (address.length > ADDRESS_MAX) return { error: `Address is too long (max ${ADDRESS_MAX} characters).` };
  const pinCode = typeof body.pinCode === "string" ? body.pinCode.trim() : "";
  if (!PIN_CODE.test(pinCode)) return { error: "Enter a valid 6-digit PIN code." };
  const pin = labPin(body.lat, body.lng);
  if (!pin) return { error: "Pin your exact location on the map — the sample is collected at your home." };
  const slotProblem = collectionSlotProblem(body.collectionDate, body.collectionSlot, now);
  if (slotProblem) return { error: slotProblem };
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (notes.length > NOTES_MAX) return { error: `Note is too long (max ${NOTES_MAX} characters).` };
  const paymentMethod = body.paymentMethod;
  if (paymentMethod !== "WALLET" && paymentMethod !== "ONLINE") return { error: "Choose how you'll pay." };
  return {
    data: {
      appointmentId, labTestIds, address, pinCode, lat: pin.lat, lng: pin.lng, notes: notes || null, paymentMethod,
      collectionDate: body.collectionDate as string, collectionSlot: body.collectionSlot as string,
    },
  };
}

/**
 * Books the chosen prescription tests at today's catalogue prices.
 *  - WALLET: debited in the same transaction (a guarded decrement, so two taps
 *    can't overspend) → REQUESTED + PAID.
 *  - ONLINE: PENDING_PAYMENT until Cashfree confirms (settleLabPayment); the
 *    caller starts the checkout. An earlier unpaid booking for the same
 *    consultation is replaced (cancelled by SYSTEM).
 * One paid open booking per consultation — serialised by an advisory lock.
 */
export async function createLabBooking(patientId: string, input: LabBookingInput) {
  if (input.paymentMethod === "WALLET") await getOrCreateWallet(prisma, patientId);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`labbooking:${input.appointmentId}`}))`;
    const appt = await bookableAppointment(tx, patientId, input.appointmentId);
    const open = await tx.labBooking.findFirst({ where: { appointmentId: appt.id, status: { in: OPEN_LAB_STATUSES } }, select: { id: true } });
    if (open) throw new LabBookingError("You already have a lab booking for this consultation.", 409, "ALREADY_BOOKED");

    const tests = await prescriptionLabTests(tx, appt.id);
    const offered = new Set(tests.flatMap((t) => (t.labTest ? [t.labTest.id] : [])));
    const catalogue = await tx.labTest.findMany({ where: { id: { in: input.labTestIds }, isActive: true } });
    if (input.labTestIds.some((id) => !offered.has(id)) || catalogue.length !== input.labTestIds.length) {
      throw new LabBookingError("One of the tests is no longer available — refresh and try again.", 409, "TEST_UNAVAILABLE");
    }
    const items = catalogue.map((t) => ({ labTestId: t.id, name: t.name, b2bPrice: t.b2bPrice, commissionPercent: t.commissionPercent, price: labTestPrice(t) }));
    const totalAmount = round2(items.reduce((sum, i) => sum + i.price, 0));

    // A checkout the patient walked away from doesn't block a fresh booking.
    await tx.labBooking.updateMany({
      where: { appointmentId: appt.id, status: "PENDING_PAYMENT" },
      data: { status: "CANCELLED", cancelledBy: "SYSTEM" },
    });

    const who = subject(appt);
    const booking = await tx.labBooking.create({
      data: {
        patientId,
        appointmentId: appt.id,
        patientName: who.name,
        patientAge: who.age,
        patientGender: who.gender,
        address: input.address,
        pinCode: input.pinCode,
        lat: input.lat,
        lng: input.lng,
        collectionDate: input.collectionDate,
        collectionSlot: input.collectionSlot,
        notes: input.notes,
        totalAmount,
        paymentMethod: input.paymentMethod,
        status: input.paymentMethod === "ONLINE" ? "PENDING_PAYMENT" : "REQUESTED",
        items: { create: items },
      },
      include: { items: true },
    });

    if (input.paymentMethod === "WALLET") {
      const debited = await tx.wallet.updateMany({
        where: { userId: patientId, balance: { gte: totalAmount } },
        data: { balance: { decrement: totalAmount } },
      });
      if (debited.count === 0) throw new LabBookingError("Not enough wallet balance. Add money or pay online.", 409, "INSUFFICIENT_BALANCE");
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: patientId } });
      await tx.walletTransaction.create({
        data: { walletId: wallet.id, type: "LAB_TEST_PAYMENT", amount: totalAmount, balanceAfter: wallet.balance, status: "SUCCESS", labBookingId: booking.id },
      });
      return tx.labBooking.update({ where: { id: booking.id }, data: { paymentStatus: "PAID", paidAt: new Date() }, include: { items: true } });
    }
    return booking;
  });
}

/** A new Cashfree order id for a booking; the booking id is embedded so a late payment always finds it. */
export function labOrderId(bookingId: string) {
  return `${LAB_ORDER_PREFIX}${bookingId}_${Date.now()}`;
}
export function bookingIdFromOrder(orderId: string): string | null {
  const m = orderId.match(new RegExp(`^${LAB_ORDER_PREFIX}([a-z0-9]+)_\\d+$`));
  return m ? m[1] : null;
}

export type LabSettleResult =
  | { outcome: "paid"; patientId: string; bookingId: string; amount: number; patientName: string; count: number }
  | { outcome: "credited"; patientId: string; amount: number }
  | { outcome: "retry" | "unknown" };

/**
 * Applies a successful Cashfree payment for a lab order — the one path for
 * the webhook and the return page's verify, safe to race and to retry. The
 * booking is claimed once (PENDING_PAYMENT → REQUESTED + PAID). A payment that
 * can't be applied — the booking was cancelled or replaced, already paid by
 * another order, or the amount differs — goes to the patient's wallet in
 * full, once per payment.
 */
export async function settleLabPayment(payment: { orderId: string; amount: number; cfPaymentId: string }): Promise<LabSettleResult> {
  const bookingId = bookingIdFromOrder(payment.orderId);
  const booking = bookingId ? await prisma.labBooking.findUnique({ where: { id: bookingId }, include: { items: true } }) : null;
  if (!booking) return { outcome: "unknown" };
  if (booking.cfPaymentId === payment.cfPaymentId) return { outcome: "retry" };

  if (same(payment.amount, booking.totalAmount)) {
    const claimed = await prisma.labBooking.updateMany({
      where: { id: booking.id, status: "PENDING_PAYMENT", paymentStatus: "PENDING" },
      data: { status: "REQUESTED", paymentStatus: "PAID", paidAt: new Date(), cfPaymentId: payment.cfPaymentId, cashfreeOrderId: payment.orderId },
    });
    if (claimed.count === 1) {
      return { outcome: "paid", patientId: booking.patientId, bookingId: booking.id, amount: booking.totalAmount, patientName: booking.patientName, count: booking.items.length };
    }
    // A racing settle of this same payment won the claim.
    const now = await prisma.labBooking.findUnique({ where: { id: booking.id }, select: { cfPaymentId: true } });
    if (now?.cfPaymentId === payment.cfPaymentId) return { outcome: "retry" };
  } else {
    console.error("Lab payment amount mismatch", payment.orderId, "charged", payment.amount, "booking total", booking.totalAmount);
  }

  const credited = await creditFeePaymentToWallet({
    userId: booking.patientId,
    orderId: payment.orderId,
    amount: payment.amount,
    cfPaymentId: payment.cfPaymentId,
    note: `Lab booking payment that couldn't be applied (order ${payment.orderId})`,
  });
  return credited ? { outcome: "credited", patientId: booking.patientId, amount: credited.amount } : { outcome: "retry" };
}

/**
 * Cancels a booking; a paid one (wallet or online) is refunded to the
 * wallet. The patient may cancel while it's unpaid or REQUESTED; an admin any
 * time before COMPLETED. Both the status change and the refund are guarded
 * updates, so a double cancel never refunds twice. Null when nothing was cancelled.
 */
export async function cancelLabBooking(
  bookingId: string,
  by: { role: "PATIENT"; patientId: string } | { role: "ADMIN"; adminId: string; note?: string | null },
) {
  return prisma.$transaction(async (tx) => {
    const allowed: LabBookingStatus[] = by.role === "PATIENT" ? ["PENDING_PAYMENT", "REQUESTED"] : ["PENDING_PAYMENT", ...OPEN_LAB_STATUSES];
    const cancelled = await tx.labBooking.updateMany({
      where: { id: bookingId, status: { in: allowed }, ...(by.role === "PATIENT" ? { patientId: by.patientId } : {}) },
      data: { status: "CANCELLED", cancelledBy: by.role, ...(by.role === "ADMIN" && by.note !== undefined ? { adminNote: by.note } : {}) },
    });
    if (cancelled.count === 0) return null;
    const booking = await tx.labBooking.findUniqueOrThrow({ where: { id: bookingId } });
    let refunded = 0;
    const claimed = await tx.labBooking.updateMany({ where: { id: bookingId, paymentStatus: "PAID" }, data: { paymentStatus: "REFUNDED" } });
    if (claimed.count === 1) {
      const wallet = await getOrCreateWallet(tx, booking.patientId);
      const updated = await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: booking.totalAmount } } });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id, type: "LAB_TEST_REFUND", amount: booking.totalAmount, balanceAfter: updated.balance, status: "SUCCESS",
          refundOfLabBookingId: booking.id, adminId: by.role === "ADMIN" ? by.adminId : undefined,
        },
      });
      refunded = booking.totalAmount;
    }
    return { booking: { ...booking, paymentStatus: refunded ? "REFUNDED" : booking.paymentStatus }, refunded };
  });
}

// ── Reports ──

export const LAB_REPORT_TYPES: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
export const LAB_REPORT_MAX_BYTES = 10 * 1024 * 1024;
export const LAB_REPORT_MAX_FILES = 10;
export const LAB_REPORT_FOLDER = "lab-reports";

type BookingWithParts = Prisma.LabBookingGetPayload<{ include: { items: true; reports: true } }>;

/** Patient-facing view of a booking. B2B price, commission and gateway ids stay admin-only. */
export function patientLabBookingView(b: Prisma.LabBookingGetPayload<{ include: { items: true } }> & { reports?: BookingWithParts["reports"] }) {
  return {
    id: b.id,
    appointmentId: b.appointmentId,
    patientName: b.patientName,
    patientAge: b.patientAge,
    patientGender: b.patientGender,
    address: b.address,
    pinCode: b.pinCode,
    lat: b.lat,
    lng: b.lng,
    collectionDate: b.collectionDate,
    collectionSlot: b.collectionSlot,
    notes: b.notes,
    totalAmount: b.totalAmount,
    paymentMethod: b.paymentMethod,
    paymentStatus: b.paymentStatus,
    status: b.status,
    adminNote: b.adminNote,
    cancelledBy: b.cancelledBy,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    items: b.items.map((i) => ({ id: i.id, name: i.name, price: i.price })),
    reports: (b.reports ?? []).map((r) => ({ id: r.id, fileUrl: r.fileUrl, fileName: r.fileName, createdAt: r.createdAt })),
  };
}
