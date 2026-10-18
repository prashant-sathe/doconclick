// What a doctor can change on their own once verified, and how bank details
// are validated. Used by PATCH /api/doctors/me and the admin change-request
// review.

// Verification vouched for these — after it, a change is a request for an
// admin to re-verify, not an edit.
export const LOCKED_FIELDS = ["medRegNo", "qualification", "specialty"] as const;
export type LockedField = (typeof LOCKED_FIELDS)[number];

export const LOCKED_FIELD_LABELS: Record<LockedField, string> = {
  medRegNo: "Registration number",
  qualification: "Qualification",
  specialty: "Specialty",
};

// Locked once an admin has vouched for the profile: verified, or approved
// (suspension doesn't reopen it). A pending or rejected application can still
// be fixed freely before it's (re)reviewed.
export function isProfileLocked(profile: { isVerified: boolean; status: string }) {
  return profile.isVerified || profile.status === "APPROVED" || profile.status === "SUSPENDED";
}

export type FieldChanges = Partial<Record<LockedField, { from: string | null; to: string | null }>>;

// ── Bank details ──
// Stored as one string ("Bank | Account | IFSC: CODE") — the format the
// admin finance screens and payout flow already read.

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export function validateBank(raw: unknown):
  | { bankDetails: string | null; last4: string | null }
  | { error: string } {
  if (raw === null) return { bankDetails: null, last4: null }; // removing them
  if (!raw || typeof raw !== "object") return { error: "Invalid bank details." };
  const b = raw as Record<string, unknown>;
  const bankName = typeof b.bankName === "string" ? b.bankName.trim() : "";
  const account = typeof b.accountNumber === "string" ? b.accountNumber.replace(/[\s-]/g, "") : "";
  const confirm = typeof b.accountNumberConfirm === "string" ? b.accountNumberConfirm.replace(/[\s-]/g, "") : "";
  const ifsc = typeof b.ifsc === "string" ? b.ifsc.trim().toUpperCase() : "";

  if (bankName.length < 2 || bankName.length > 80) return { error: "Enter your bank's name." };
  if (!/^\d{9,18}$/.test(account)) return { error: "Account number must be 9 to 18 digits." };
  if (account !== confirm) return { error: "The account numbers don't match." };
  if (!IFSC_RE.test(ifsc)) return { error: "IFSC must be 11 characters: 4 letters, a 0, then 6 letters or digits (e.g. HDFC0001234)." };
  return { bankDetails: `${bankName} | ${account} | IFSC: ${ifsc}`, last4: account.slice(-4) };
}

// "XXXX1234" for notifications — never the full number.
export const maskAccount = (last4: string) => `XXXX${last4}`;
