// Shared form validation — used by both the client forms and the API routes
// so the rules can't drift between them.

/** A valid Indian mobile number: 10 digits, first digit 6–9. */
export const MOBILE_REGEX = /^[6-9]\d{9}$/;

/**
 * Reduces a mobile input to its bare 10 national digits: strips spaces,
 * dashes, brackets and a leading +91 / 91 / 0 prefix. Does not validate —
 * pass the result to `isValidMobile`.
 */
export function normalizeMobile(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

export function isValidMobile(raw: string): boolean {
  return MOBILE_REGEX.test(normalizeMobile(raw));
}

/** Pragmatic email shape check: one @, a dotted domain, no whitespace. */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(raw: string): boolean {
  return EMAIL_REGEX.test(String(raw ?? "").trim());
}

export const PASSWORD_MIN_LENGTH = 6;

/** Returns an error message for an invalid name, or null when it's fine. */
export function nameError(raw: string): string | null {
  const name = String(raw ?? "").trim();
  if (name.length < 2) return "Please enter your full name.";
  if (name.length > 80) return "That name is too long.";
  return null;
}

/**
 * Validates the shared { name, mobile, email?, password } shape for the
 * registration routes. Returns { error } on the first problem, or
 * { data } with cleaned values ready to store.
 */
export function validateRegistration(body: {
  name?: unknown;
  mobile?: unknown;
  email?: unknown;
  password?: unknown;
}):
  | { error: string }
  | { data: { name: string; mobile: string; email: string | null; password: string } } {
  const name = String(body.name ?? "").trim();
  const nameErr = nameError(name);
  if (nameErr) return { error: nameErr };

  const mobile = normalizeMobile(String(body.mobile ?? ""));
  if (!MOBILE_REGEX.test(mobile)) {
    return { error: "Enter a valid 10-digit Indian mobile number." };
  }

  const rawEmail = typeof body.email === "string" ? body.email.trim() : "";
  if (rawEmail && !isValidEmail(rawEmail)) {
    return { error: "Enter a valid email address, or leave it blank." };
  }

  const password = String(body.password ?? "");
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` };
  }

  return { data: { name, mobile, email: rawEmail || null, password } };
}
