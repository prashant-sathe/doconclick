import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

// Doctor names are stored as free text and some already include a "Dr."
// prefix (in varying forms — "Dr.", "Dr", with/without trailing period)
// while others don't. Strip whatever prefix exists, then apply one
// consistent "Dr. " so it's never shown doubled or in a mismatched form.
export function formatDoctorName(name: string) {
  return `Dr. ${name.replace(/^dr\.?\s*/i, "").trim()}`;
}

// Turns a display name into a URL/path-safe slug for use in storage keys.
// Non-Latin names (e.g. Devanagari) collapse to "" — callers should combine
// this with a unique id so the resulting path is still unique.
export function slugify(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
