import type { AppLanguage } from "@/lib/appLanguage";
import enCommon from "../../messages/en-IN/common.json";
import enNav from "../../messages/en-IN/nav.json";
import enBooking from "../../messages/en-IN/booking.json";
import enPush from "../../messages/en-IN/push.json";
import enAuth from "../../messages/en-IN/auth.json";
import enShared from "../../messages/en-IN/shared.json";
import enPatient from "../../messages/en-IN/patient.json";
import enPatientAccount from "../../messages/en-IN/patientAccount.json";
import enDoctor from "../../messages/en-IN/doctor.json";
import enDoctorAccount from "../../messages/en-IN/doctorAccount.json";
import enNurse from "../../messages/en-IN/nurse.json";

// One JSON file per namespace per language: messages/<locale>/<namespace>.json.
// English is the source of truth (and the type every t() key is checked
// against); a key missing from hi/mr falls back to English, so an
// untranslated string shows in English — never as a raw key.
export const NAMESPACES = [
  "common", "nav", "booking", "push",
  "auth", "shared", "patient", "patientAccount", "doctor", "doctorAccount", "nurse",
] as const;
type Namespace = (typeof NAMESPACES)[number];

const en = {
  common: enCommon, nav: enNav, booking: enBooking, push: enPush,
  auth: enAuth, shared: enShared, patient: enPatient, patientAccount: enPatientAccount,
  doctor: enDoctor, doctorAccount: enDoctorAccount, nurse: enNurse,
};
export type Messages = typeof en;

function merge<T>(base: T, over: unknown): T {
  if (!over || typeof over !== "object" || Array.isArray(over)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    const b = out[k];
    if (b && typeof b === "object" && !Array.isArray(b)) out[k] = merge(b, v);
    else if (typeof v === "string" && v.trim()) out[k] = v;
  }
  return out as T;
}

async function load(locale: "hi-IN" | "mr-IN", ns: Namespace): Promise<unknown> {
  try {
    return (await import(`../../messages/${locale}/${ns}.json`)).default;
  } catch {
    return {};
  }
}

const cache = new Map<AppLanguage, Promise<Messages>>();

export function loadMessages(locale: AppLanguage): Promise<Messages> {
  if (locale === "en-IN") return Promise.resolve(en);
  let hit = process.env.NODE_ENV === "production" ? cache.get(locale) : undefined;
  if (!hit) {
    hit = Promise.all(NAMESPACES.map((ns) => load(locale, ns))).then((parts) =>
      merge(en, Object.fromEntries(NAMESPACES.map((ns, i) => [ns, parts[i]]))),
    );
    cache.set(locale, hit);
  }
  return hit;
}
