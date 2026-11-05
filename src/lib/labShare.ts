// Lab booking sample-collection slots and the WhatsApp hand-off text the admin
// sends to the lab / collection person. Client-safe (no Prisma).
import { addDaysYmd, istDayKey, istMinutesOfDay, isValidYmd } from "@/lib/istDate";

/** Two-hour home-collection windows (IST), keyed "HH-HH" on a 24-hour clock. */
export const LAB_COLLECTION_SLOTS = ["07-09", "09-11", "11-13", "13-15", "15-17", "17-19"] as const;
export type LabCollectionSlot = (typeof LAB_COLLECTION_SLOTS)[number];
export const isLabCollectionSlot = (v: unknown): v is LabCollectionSlot =>
  typeof v === "string" && (LAB_COLLECTION_SLOTS as readonly string[]).includes(v);
/** How many days ahead a collection can be booked (today = day 0). */
export const LAB_COLLECTION_DAYS = 7;

const hour12 = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;
/** "07-09" → "7 AM – 9 AM". */
export function slotLabel(slot: string): string {
  const [a, b] = slot.split("-").map(Number);
  return Number.isFinite(a) && Number.isFinite(b) ? `${hour12(a)} – ${hour12(b)}` : slot;
}

/** The IST days a patient can pick, today first. */
export function collectionDays(now: Date = new Date()): string[] {
  const today = istDayKey(now);
  return Array.from({ length: LAB_COLLECTION_DAYS }, (_, i) => addDaysYmd(today, i));
}

/** Slots still open on `day` — today's start at least an hour from now. */
export function openSlots(day: string, now: Date = new Date()): LabCollectionSlot[] {
  if (day !== istDayKey(now)) return [...LAB_COLLECTION_SLOTS];
  const minutes = istMinutesOfDay(now);
  return LAB_COLLECTION_SLOTS.filter((s) => Number(s.slice(0, 2)) * 60 >= minutes + 60);
}

/** Why a picked day + slot can't be booked, or null. */
export function collectionSlotProblem(day: unknown, slot: unknown, now: Date = new Date()): string | null {
  if (typeof day !== "string" || !isValidYmd(day) || !collectionDays(now).includes(day)) return "Pick a sample collection day.";
  if (!isLabCollectionSlot(slot)) return "Pick a sample collection time slot.";
  if (!openSlots(day, now).includes(slot)) return "That time slot has already passed — pick a later one.";
  return null;
}

/** "Fri, 6 Nov 2026" for an IST day key. */
export function collectionDayLabel(day: string, locale = "en-IN"): string {
  const parts = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
    .formatToParts(new Date(`${day}T12:00:00+05:30`));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")}, ${part("day")} ${part("month")} ${part("year")}`;
}

export const PIN_CODE = /^[1-9]\d{5}$/;

/** A real map pin inside India (with a margin), or null. */
export function labPin(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const a = typeof lat === "number" ? lat : NaN;
  const o = typeof lng === "number" ? lng : NaN;
  if (!Number.isFinite(a) || !Number.isFinite(o) || a < 6 || a > 37.5 || o < 68 || o > 97.5) return null;
  return { lat: Math.round(a * 1e6) / 1e6, lng: Math.round(o * 1e6) / 1e6 };
}

/** Google Maps link that drops a pin on the exact spot (opens the Maps app on phones). */
export const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;

/** The address with its PIN code (appended unless the address already ends with it). */
export function addressWithPin(address: string, pinCode: string | null | undefined): string {
  const a = address.trim().replace(/[,\s]+$/, "");
  if (!pinCode) return a;
  return new RegExp(`\\b${pinCode}$`).test(a) ? a : `${a} - ${pinCode}`;
}

/** The booking details, in the format the lab / collection team works from. */
export function labShareText(b: {
  patientName: string;
  patientAge: number | null;
  patientGender: string | null;
  mobile: string;
  tests: string[];
  address: string;
  pinCode: string | null;
  lat?: number | null;
  lng?: number | null;
  collectionDate: string | null;
  collectionSlot: string | null;
  notes?: string | null;
}): string {
  const mobile = /^\d{10}$/.test(b.mobile) ? `+91 ${b.mobile.slice(0, 5)} ${b.mobile.slice(5)}` : b.mobile;
  const slot = b.collectionDate && b.collectionSlot
    ? `${collectionDayLabel(b.collectionDate)}, ${slotLabel(b.collectionSlot)}`
    : "To be confirmed";
  return [
    `Full Name: ${b.patientName}`,
    `Age: ${b.patientAge ?? "—"}`,
    `Gender: ${b.patientGender || "—"}`,
    `Phone number: ${mobile}`,
    "",
    "Tests:",
    ...b.tests.map((t, i) => `${i + 1}. ${t}`),
    "",
    `Address with Pincode: ${addressWithPin(b.address, b.pinCode)}`,
    ...(b.lat != null && b.lng != null
      ? [`Coordinates: ${b.lat.toFixed(6)}, ${b.lng.toFixed(6)}`, `Map: ${mapsUrl(b.lat, b.lng)}`]
      : []),
    "",
    `Time slot: ${slot}`,
    ...(b.notes ? ["", `Note: ${b.notes}`] : []),
  ].join("\n");
}

/** A WhatsApp link that opens the contact picker with `text` filled in. */
export const whatsAppShareUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
