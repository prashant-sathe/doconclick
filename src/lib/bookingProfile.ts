// What a patient must have filled in before they can book. Signup only asks
// for mobile + password (Google signup gives a name but no age/gender), so
// these are collected at the first booking instead. Shared by the
// appointments API (enforcement) and the booking pages (inline sheet).
//
// "Not filled" uses the same convention Google signup already writes:
// age 0 and gender "".

import { nameError } from "@/lib/validation";

export const GENDERS = ["Male", "Female", "Other"] as const;

export type MissingProfileField = "name" | "age" | "gender";

export function isValidAge(age: unknown): boolean {
  const n = Number(age);
  return Number.isInteger(n) && n >= 1 && n <= 120;
}

export function isValidGender(gender: unknown): boolean {
  return (GENDERS as readonly string[]).includes(String(gender ?? ""));
}

/**
 * Fields still missing for a booking. Booking for a family member only
 * needs the account holder's name — the dependent's own profile carries
 * the age/gender the doctor sees.
 */
export function missingProfileFields(
  name: string | null | undefined,
  profile: { age?: number | null; gender?: string | null } | null | undefined,
  { forDependent = false }: { forDependent?: boolean } = {},
): MissingProfileField[] {
  const missing: MissingProfileField[] = [];
  if (nameError(name ?? "")) missing.push("name");
  if (forDependent) return missing;
  if (!isValidAge(profile?.age)) missing.push("age");
  if (!isValidGender(profile?.gender)) missing.push("gender");
  return missing;
}

/** Age in whole years from a yyyy-mm-dd date of birth. */
export function ageFromDob(dob: string): number {
  const d = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}
