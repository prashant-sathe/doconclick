import jwt from "jsonwebtoken";

// Pay-by-link for a booking the front desk made on a patient's behalf
// (/doctor/walk-in): the patient scans a QR or opens a WhatsApp link on their
// own phone and pays through Cashfree without signing in — a walk-in patient
// often has no password yet. The token only lets its holder see that one
// appointment's bill and pay it; it is never a session (verifyToken in
// src/lib/auth.ts rejects anything carrying a `purpose`).
//
// Stateless and reusing JWT_SECRET, like the password-reset proof. A day is
// long enough for a phone-in patient to pay from home; the desk can always
// generate a fresh link.
export const GUEST_PAYMENT_TTL_SECONDS = 24 * 60 * 60;
const PURPOSE = "guestpay";

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set");
  return s;
}

export function signGuestPaymentToken(appointmentId: string): { token: string; expiresAt: Date } {
  const token = jwt.sign({ appt: appointmentId, purpose: PURPOSE }, secret(), { expiresIn: GUEST_PAYMENT_TTL_SECONDS });
  return { token, expiresAt: new Date(Date.now() + GUEST_PAYMENT_TTL_SECONDS * 1000) };
}

/** The appointment id the token was issued for, or null if invalid/expired. */
export function verifyGuestPaymentToken(token: unknown): string | null {
  if (typeof token !== "string" || !token) return null;
  try {
    const decoded = jwt.verify(token, secret()) as { appt?: unknown; purpose?: unknown };
    return decoded.purpose === PURPOSE && typeof decoded.appt === "string" ? decoded.appt : null;
  } catch {
    return null;
  }
}

/** Where the patient pays: /pay/<id>?t=<token> — or, with `return`, where Cashfree sends them back. */
export function guestPaymentPath(appointmentId: string, token: string, page: "pay" | "return" = "pay"): string {
  return `/pay/${encodeURIComponent(appointmentId)}${page === "return" ? "/return" : ""}?t=${encodeURIComponent(token)}`;
}
