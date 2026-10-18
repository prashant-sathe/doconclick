// Zod request schemas (src/lib/schemas.ts) and the fail-closed availability
// check. Pure checks — no dev server or DB needed.
//
//   npm run test:schemas
import {
  patientProfilePatchSchema, dependentCreateSchema, dependentUpdateSchema, nurseProfilePatchSchema,
  nurseServicesSchema, updateNameSchema, appointmentBookingSchema,
} from "../src/lib/schemas";
import { isDoctorAvailableNow, isValidAvailability } from "../src/lib/availability";
import type { z } from "zod";

// isOwnUploadUrl reads these at call time; fixed values keep the test off the
// shell's AWS_* vars.
process.env.S3_BUCKET_NAME = "test-bucket";
process.env.AWS_REGION = "ap-south-1";
const OWN = "https://test-bucket.s3.ap-south-1.amazonaws.com";

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

/** Expects `body` to be rejected with a message containing `msg`. */
function rejects(label: string, schema: z.ZodType, body: unknown, msg: string) {
  const r = schema.safeParse(body);
  const got = r.success ? "(accepted)" : r.error.issues[0]?.message ?? "";
  check(label, !r.success && got.includes(msg), got);
}
/** Expects `body` to parse, optionally to a specific output subset. */
function accepts(label: string, schema: z.ZodType, body: unknown, expect?: Record<string, unknown>) {
  const r = schema.safeParse(body);
  if (!r.success) return check(label, false, r.error.issues[0]?.message ?? "rejected");
  const out = r.data as Record<string, unknown>;
  const bad = Object.entries(expect ?? {}).filter(([k, v]) => JSON.stringify(out[k]) !== JSON.stringify(v));
  check(label, bad.length === 0, bad.length ? `got ${JSON.stringify(out)}` : "ok");
}

// ── Patient profile ──
const P = patientProfilePatchSchema;
accepts("patient: lat/lng in range", P, { lat: "18.52", lng: 73.85 }, { lat: 18.52, lng: 73.85 });
rejects("patient: lat > 90", P, { lat: 91, lng: 73 }, "latitude must be between -90 and 90");
rejects("patient: lng < -180", P, { lat: 18, lng: -181 }, "longitude must be between -180 and 180");
rejects("patient: lat without lng", P, { lat: 18 }, "send both latitude and longitude");
rejects("patient: non-numeric lat", P, { lat: "abc", lng: 73 }, "latitude must be a number");
accepts("patient: own S3 photo", P, { photoUrl: `${OWN}/patient-photos/a.jpg` });
rejects("patient: foreign photo host", P, { photoUrl: "https://evil.example/patient-photos/a.jpg" }, "Upload your photo");
rejects("patient: javascript: photo", P, { photoUrl: "javascript:alert(1)" }, "Upload your photo");
rejects("patient: other S3 folder", P, { photoUrl: `${OWN}/doctor-docs/a.jpg` }, "Upload your photo");
accepts("patient: clear photo", P, { photoUrl: "" }, { photoUrl: null });
accepts("patient: +91 phone normalized", P, { emergencyContactPhone: "+91 98765 43210" }, { emergencyContactPhone: "9876543210" });
rejects("patient: bad phone", P, { emergencyContactPhone: "12345" }, "valid 10-digit Indian mobile");
rejects("patient: age 121", P, { age: 121 }, "valid date of birth");
rejects("patient: age 0 (unset sentinel)", P, { age: 0 }, "valid date of birth");
accepts("patient: age 120", P, { age: 120 }, { age: 120 });
rejects("patient: blank home address", P, { homeAddress: "  " }, "Home address is required");
rejects("patient: bad PIN", P, { pinCode: "4110" }, "6-digit PIN");
rejects("patient: bad gender", P, { gender: "X" }, "Select a gender");
rejects("patient: non-object body", P, null, "Invalid request body");
accepts("patient: empty patch", P, {});

// ── Dependents ──
const D = dependentCreateSchema;
accepts("dependent: minimal", D, { name: "Asha", relation: "Mother" }, { name: "Asha", relation: "Mother" });
rejects("dependent: no name", D, { relation: "Mother" }, "Name is required");
rejects("dependent: relation Self", D, { name: "Asha", relation: "Self" }, "Invalid relation");
rejects("dependent: age -1", D, { name: "Asha", relation: "Son", age: -1 }, "between 0 and 120");
rejects("dependent: age 121", D, { name: "Asha", relation: "Son", age: "121" }, "between 0 and 120");
accepts("dependent: age 0 (infant)", D, { name: "Asha", relation: "Son", age: 0 }, { age: 0 });
rejects("dependent: bad phone", dependentUpdateSchema, { name: "Asha", emergencyContactPhone: "5555555555" }, "valid 10-digit");

// ── Nurse profile ──
const N = nurseProfilePatchSchema;
accepts("nurse: form availability", N, { availability: "Mon, Tue, Wed 08:00–20:00" });
rejects("nurse: unparseable availability", N, { availability: "whenever" }, "Working hours must look like");
rejects("nurse: zero-length window", N, { availability: "Mon 09:00–09:00" }, "Working hours must look like");
rejects("nurse: blank availability", N, { availability: "" }, "Set your working days and hours");
accepts("nurse: bank details normalized", N, { bankDetails: "HDFC Bank | 1234 5678 9012 | IFSC: hdfc0001234" }, { bankDetails: "HDFC Bank | 123456789012 | IFSC: HDFC0001234" });
rejects("nurse: bad IFSC", N, { bankDetails: "HDFC Bank | 123456789012 | IFSC: HDFC1234" }, "IFSC must be 11 characters");
rejects("nurse: bad account", N, { bankDetails: "HDFC Bank | 12ab | IFSC: HDFC0001234" }, "Account number");
accepts("nurse: clear bank", N, { bankDetails: "" }, { bankDetails: null });
rejects("nurse: short council no", N, { councilRegNo: "ab" }, "at least 4 characters");
accepts("nurse: council no uppercased", N, { councilRegNo: "mnc-123" }, { councilRegNo: "MNC-123" });
rejects("nurse: lat out of range", N, { lat: -95, lng: 73 }, "latitude must be between");
rejects("nurse: radius 0", N, { radius: 0 }, "between 1 and 30");
rejects("nurse: experience 61", N, { experience: 61 }, "between 0 and 60");
rejects("nurse: bad qualification", N, { qualification: "MBBS" }, "valid qualification");

// ── Nurse services ──
const S = nurseServicesSchema;
accepts("services: price rounded", S, { services: [{ serviceId: "a", price: "499.6" }] });
check("services: 499.6 → 500", S.parse({ services: [{ serviceId: "a", price: 499.6 }] }).services[0].price === 500, "rounded");
rejects("services: 0.4 rounds to 0", S, { services: [{ serviceId: "a", price: 0.4 }] }, "at least ₹1");
rejects("services: negative", S, { services: [{ serviceId: "a", price: -5 }] }, "at least ₹1");
rejects("services: missing price", S, { services: [{ serviceId: "a" }] }, "needs a price");
rejects("services: too high", S, { services: [{ serviceId: "a", price: 100001 }] }, "at most ₹1,00,000");
rejects("services: not a list", S, { services: "a" }, "must be a list");

// ── Auth name ──
accepts("name: trimmed", updateNameSchema, { name: "  Ravi Kumar " }, { name: "Ravi Kumar" });
rejects("name: too short", updateNameSchema, { name: "R" }, "full name");
rejects("name: missing", updateNameSchema, {}, "full name");
rejects("name: too long", updateNameSchema, { name: "x".repeat(81) }, "too long");

// ── Appointment booking ──
const A = appointmentBookingSchema;
accepts("booking: symptoms + location", A, { symptoms: "fever", patientLat: 18.5, patientLng: 73.8 });
rejects("booking: no symptoms", A, { symptoms: "  " }, "describe your symptoms");
rejects("booking: symptoms too long", A, { symptoms: "x".repeat(1001) }, "at most 1000");
rejects("booking: lat out of range", A, { symptoms: "fever", patientLat: 200, patientLng: 73 }, "latitude must be between");

// ── Availability: fail closed ──
const monNoonIst = new Date(Date.UTC(2026, 9, 19, 12, 0) - 5.5 * 3600_000); // Mon 12:00 IST
check("availability: unparseable → closed", !isDoctorAvailableNow("whenever", monNoonIst), "false");
check("availability: empty → closed", !isDoctorAvailableNow("", monNoonIst), "false");
check("availability: within hours → open", isDoctorAvailableNow("Mon-Sat, 8AM-8PM", monNoonIst), "true");
check("availability: schema defaults valid", isValidAvailability("Mon-Sat, 8AM-8PM") && isValidAvailability("Mon-Fri, 9AM-5PM"), "true");

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
