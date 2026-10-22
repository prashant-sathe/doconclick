// Zod request schemas for the profile / booking API routes. Every failure
// becomes a 400 carrying the first issue's message, so each rule below is
// written as the sentence the user should see.

import { NextResponse } from "next/server";
import { z } from "zod";
import { MOBILE_REGEX, IFSC_REGEX, normalizeMobile, nameError } from "@/lib/validation";
import { isOwnUploadUrl } from "@/lib/s3";
import { isValidAvailability } from "@/lib/availability";
import { GENDERS } from "@/lib/bookingProfile";
import { BLOOD_GROUPS } from "@/lib/medicalOptions";
import { RELATIONS } from "@/lib/relations";
import { NURSE_QUALIFICATIONS } from "@/lib/nurseConstants";
import { normalizeSearchRadiusKm } from "@/lib/geo";
import { ASSISTANT_MAX_MESSAGES, ASSISTANT_MAX_TOTAL_CHARS, ASSISTANT_MAX_MESSAGE_CHARS } from "@/lib/assistantInput";

/**
 * Validates `body` against `schema`. On failure returns `{ response }` — a
 * ready 400 with the first issue's message — for the route to return as-is.
 */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown):
  | { data: z.output<T>; response?: undefined }
  | { data?: undefined; response: NextResponse } {
  const result = schema.safeParse(body);
  if (result.success) return { data: result.data };
  const message = result.error.issues[0]?.message ?? "Invalid request.";
  return { response: NextResponse.json({ error: message }, { status: 400 }) };
}

/** Drops keys the client didn't send, so a PATCH only touches what it named. */
export function definedOnly<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

const BODY_ERROR = { error: "Invalid request body." };

// ── Preprocessors ──
// Forms send "" for an untouched field and numbers as strings; normalize
// both before the real check runs.

const blankToNull = (v: unknown) => {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  return v;
};
const toNumberOrNull = (v: unknown) => {
  const b = blankToNull(v);
  return typeof b === "string" ? Number(b) : b;
};
const toRoundedOrNull = (v: unknown) => {
  const n = toNumberOrNull(v);
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n) : n;
};

// ── Field builders ──

/** Optional free text: blank clears it (null), otherwise trimmed and capped. */
const optionalText = (label: string, max = 1000) =>
  z.preprocess(
    blankToNull,
    z.string({ error: `${label} must be text.` }).max(max, `${label} must be at most ${max} characters.`).nullable(),
  );

/** Required text: present and non-blank. */
const requiredText = (label: string, max = 1000) =>
  z.preprocess(
    blankToNull,
    z
      .string({ error: `${label} is required.` })
      .max(max, `${label} must be at most ${max} characters.`),
  );

const latitude = z.preprocess(
  toNumberOrNull,
  z
    .number({ error: "Invalid location: latitude must be a number." })
    .min(-90, "Invalid location: latitude must be between -90 and 90.")
    .max(90, "Invalid location: latitude must be between -90 and 90.")
    .nullable(),
);
const longitude = z.preprocess(
  toNumberOrNull,
  z
    .number({ error: "Invalid location: longitude must be a number." })
    .min(-180, "Invalid location: longitude must be between -180 and 180.")
    .max(180, "Invalid location: longitude must be between -180 and 180.")
    .nullable(),
);

/** lat and lng are only meaningful together — both set or both cleared. */
function bothOrNeitherLatLng(d: { lat?: number | null; lng?: number | null }, ctx: z.RefinementCtx) {
  if ((d.lat === undefined) !== (d.lng === undefined) || (d.lat === null) !== (d.lng === null)) {
    ctx.addIssue({ code: "custom", message: "Invalid location: send both latitude and longitude.", path: ["lat"] });
  }
}

/** Optional Indian mobile (accepts +91 / spaces); stored as the bare 10 digits. */
const optionalMobile = (label: string) =>
  z.preprocess(
    (v) => {
      const b = blankToNull(typeof v === "number" ? String(v) : v);
      return typeof b === "string" ? normalizeMobile(b) : b;
    },
    z
      .string({ error: `${label} must be a phone number.` })
      .regex(MOBILE_REGEX, `${label} must be a valid 10-digit Indian mobile number.`)
      .nullable(),
  );

const optionalAge = z.preprocess(
  toNumberOrNull,
  z
    .number({ error: "Age must be a number." })
    .int("Age must be a whole number.")
    .min(0, "Age must be between 0 and 120.")
    .max(120, "Age must be between 0 and 120.")
    .nullable(),
);

/** Rounded to whole units (the columns are Int), then range-checked. */
const optionalMeasure = (label: string, unit: string, min: number, max: number) =>
  z.preprocess(
    toRoundedOrNull,
    z
      .number({ error: `${label} must be a number.` })
      .min(min, `${label} must be between ${min} and ${max} ${unit}.`)
      .max(max, `${label} must be between ${min} and ${max} ${unit}.`)
      .nullable(),
  );
const optionalHeight = optionalMeasure("Height", "cm", 30, 250);
const optionalWeight = optionalMeasure("Weight", "kg", 1, 300);

const optionalEnum = (values: readonly string[], message: string) =>
  z.preprocess(blankToNull, z.enum(values as [string, ...string[]], { error: message }).nullable());

const optionalGender = optionalEnum(GENDERS, "Select a gender.");
const optionalBloodGroup = optionalEnum(BLOOD_GROUPS, "Select a valid blood group.");

// ── Auth ──

export const nameSchema = z
  .string({ error: "Please enter your full name." })
  .trim()
  .superRefine((name, ctx) => {
    const err = nameError(name);
    if (err) ctx.addIssue({ code: "custom", message: err });
  });

export const updateNameSchema = z.object({ name: nameSchema }, BODY_ERROR);

// ── Patient profile (PATCH — every field optional) ──

export const patientProfilePatchSchema = z
  .object(
    {
      location: optionalText("Location", 300),
      homeAddress: requiredText("Home address", 500),
      landmark: optionalText("Landmark", 200),
      pinCode: z.preprocess(
        (v) => (typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : v),
        z.string({ error: "A valid 6-digit PIN code is required." }).regex(/^\d{6}$/, "A valid 6-digit PIN code is required."),
      ),
      bloodGroup: optionalBloodGroup,
      height: optionalHeight,
      weight: optionalWeight,
      allergies: optionalText("Allergies"),
      chronicDiseases: optionalText("Chronic conditions"),
      medications: optionalText("Medications"),
      surgeries: optionalText("Surgeries"),
      emergencyContactName: optionalText("Emergency contact name", 80),
      emergencyContactPhone: optionalMobile("Emergency contact phone"),
      photoUrl: z.preprocess(
        blankToNull,
        z
          .string({ error: "Invalid photo." })
          .refine((url) => isOwnUploadUrl(url, "patient-photos"), "Upload your photo through the app.")
          .nullable(),
      ),
      lat: latitude,
      lng: longitude,
      searchRadiusKm: z.preprocess(
        toNumberOrNull,
        z.number({ error: "Search range must be a number of km." }).nullable().transform(normalizeSearchRadiusKm),
      ),
      // age/gender are required to book (see src/lib/bookingProfile.ts) — once
      // set they can be changed but not cleared, and 0 is the "not filled"
      // sentinel, so the account holder's own age starts at 1.
      age: z.preprocess(
        toNumberOrNull,
        z.number({ error: "Enter a valid date of birth." }).int("Enter a valid date of birth.")
          .min(1, "Enter a valid date of birth.").max(120, "Enter a valid date of birth."),
      ),
      gender: z.enum(GENDERS, { error: "Select a gender." }),
    },
    BODY_ERROR,
  )
  .partial()
  .superRefine(bothOrNeitherLatLng);

// ── Dependents (family members) ──

const dependentFields = {
  name: z.preprocess(
    blankToNull,
    z
      .string({ error: "Name is required." })
      .min(2, "Enter the family member's full name.")
      .max(80, "That name is too long."),
  ),
  age: optionalAge.optional(),
  gender: optionalGender.optional(),
  bloodGroup: optionalBloodGroup.optional(),
  height: optionalHeight.optional(),
  weight: optionalWeight.optional(),
  allergies: optionalText("Allergies").optional(),
  chronicDiseases: optionalText("Chronic conditions").optional(),
  medications: optionalText("Medications").optional(),
  surgeries: optionalText("Surgeries").optional(),
  emergencyContactName: optionalText("Emergency contact name", 80).optional(),
  emergencyContactPhone: optionalMobile("Emergency contact phone").optional(),
};

export const dependentUpdateSchema = z.object(dependentFields, BODY_ERROR);

export const dependentCreateSchema = z.object(
  {
    ...dependentFields,
    relation: z.enum(
      RELATIONS.filter((r) => r !== "Self") as [string, ...string[]],
      { error: "Invalid relation." },
    ),
  },
  BODY_ERROR,
);

/** Absent optional fields clear the column, matching the form's full-replace save. */
export function dependentData(d: z.output<typeof dependentUpdateSchema>) {
  return {
    name: d.name,
    age: d.age ?? null,
    gender: d.gender ?? null,
    bloodGroup: d.bloodGroup ?? null,
    height: d.height ?? null,
    weight: d.weight ?? null,
    allergies: d.allergies ?? null,
    chronicDiseases: d.chronicDiseases ?? null,
    medications: d.medications ?? null,
    surgeries: d.surgeries ?? null,
    emergencyContactName: d.emergencyContactName ?? null,
    emergencyContactPhone: d.emergencyContactPhone ?? null,
  };
}

// ── Nurse profile (PATCH — every field optional) ──

// Stored as "Bank | Account | IFSC: CODE" — the same string the doctor's
// bank page writes and the admin payout screens read.
const bankDetailsSchema = z.preprocess(
  blankToNull,
  z
    .string({ error: "Invalid bank details." })
    .max(300, "Bank details are too long.")
    .superRefine((raw, ctx) => {
      const [bankName = "", account = "", ifscPart = ""] = raw.split(" | ").map((s) => s.trim());
      const ifsc = ifscPart.replace(/^IFSC:\s*/i, "").toUpperCase();
      if (bankName.length < 2) ctx.addIssue({ code: "custom", message: "Enter your bank's name." });
      else if (!/^\d{9,18}$/.test(account.replace(/[\s-]/g, ""))) ctx.addIssue({ code: "custom", message: "Account number must be 9 to 18 digits." });
      else if (!IFSC_REGEX.test(ifsc)) ctx.addIssue({ code: "custom", message: "IFSC must be 11 characters: 4 letters, a 0, then 6 letters or digits (e.g. HDFC0001234)." });
    })
    .transform((raw) => {
      const [bankName, account, ifscPart] = raw.split(" | ").map((s) => s.trim());
      return `${bankName} | ${account.replace(/[\s-]/g, "")} | IFSC: ${ifscPart.replace(/^IFSC:\s*/i, "").toUpperCase()}`;
    })
    .nullable(),
);

export const COUNCIL_REG_NO_MIN = 4;

export const nurseProfilePatchSchema = z
  .object(
    {
      councilRegNo: z.preprocess(
        (v) => {
          const b = blankToNull(v);
          return typeof b === "string" ? b.toUpperCase() : b;
        },
        z
          .string({ error: "Council registration number must be text." })
          .min(COUNCIL_REG_NO_MIN, `Council registration number must be at least ${COUNCIL_REG_NO_MIN} characters.`)
          .max(30, "Council registration number must be at most 30 characters.")
          .nullable(),
      ),
      councilState: optionalText("Council state", 80),
      languages: requiredText("Languages", 200),
      bio: optionalText("Bio"),
      address: optionalText("Address", 500),
      availability: z.preprocess(
        blankToNull,
        z
          .string({ error: "Set your working days and hours." })
          .max(200, "Working hours are too long.")
          .refine(isValidAvailability, "Working hours must look like \"Mon, Tue, Wed 08:00–20:00\"."),
      ),
      bankDetails: bankDetailsSchema,
      qualification: optionalEnum(NURSE_QUALIFICATIONS, "Select a valid qualification."),
      gender: optionalGender,
      experience: z.preprocess(
        toNumberOrNull,
        z
          .number({ error: "Experience must be a number of years." })
          .int("Experience must be a whole number of years.")
          .min(0, "Experience must be between 0 and 60 years.")
          .max(60, "Experience must be between 0 and 60 years."),
      ),
      radius: z.preprocess(
        toRoundedOrNull,
        z
          .number({ error: "Travel radius must be a number of km." })
          .min(1, "Travel radius must be between 1 and 30 km.")
          .max(30, "Travel radius must be between 1 and 30 km."),
      ),
      lat: latitude,
      lng: longitude,
    },
    BODY_ERROR,
  )
  .partial()
  .superRefine(bothOrNeitherLatLng);

// ── Nurse services (PUT — full replacement) ──

export const NURSE_SERVICE_MAX_PRICE = 100000;

export const nurseServicesSchema = z.object(
  {
    services: z
      .array(
        z.object(
          {
            serviceId: z.string({ error: "Invalid service." }).min(1, "Invalid service."),
            // Rounded first, so ₹0.4 becomes ₹0 and is rejected rather than stored as ₹0.
            price: z.preprocess(
              toRoundedOrNull,
              z
                .number({ error: "Every selected service needs a price." })
                .min(1, "Every selected service needs a price of at least ₹1.")
                .max(NURSE_SERVICE_MAX_PRICE, "Service prices can be at most ₹1,00,000."),
            ),
          },
          { error: "Invalid service." },
        ),
        { error: "services must be a list." },
      )
      .max(100, "Too many services selected."),
  },
  BODY_ERROR,
);

// ── Appointment booking ──

/** Only the fields validated up front; the route still reads the rest from the body. */
export const appointmentBookingSchema = z.object(
  {
    symptoms: z.preprocess(
      blankToNull,
      z
        .string({ error: "Please describe your symptoms." })
        .min(3, "Please describe your symptoms in a few words.")
        .max(1000, "Symptoms must be at most 1000 characters."),
    ),
    patientLat: latitude.optional(),
    patientLng: longitude.optional(),
  },
  BODY_ERROR,
);

// ── Walk-in / phone-in booking (doctor or front desk, /doctor/walk-in) ──

export const walkInBookingSchema = z.object(
  {
    mobile: z.preprocess(
      (v) => (typeof v === "string" || typeof v === "number" ? normalizeMobile(String(v)) : v),
      z.string({ error: "Enter the patient's mobile number." }).regex(MOBILE_REGEX, "Enter a valid 10-digit mobile number."),
    ),
    // The account holder's details — used for a new patient, and to fill in
    // what an existing (quick-signup) account is still missing.
    name: optionalText("Name", 80),
    age: optionalAge,
    gender: optionalGender,
    // Who the visit is for: the account holder (neither set), one of their
    // saved family members, or a family member added now.
    dependentId: z.preprocess(blankToNull, z.string().nullable()).optional(),
    newDependent: z
      .object(
        {
          name: nameSchema,
          relation: z.enum(RELATIONS.filter((r) => r !== "Self") as [string, ...string[]], { error: "Select how they're related." }),
          age: optionalAge,
          gender: optionalGender,
        },
        BODY_ERROR,
      )
      .nullable()
      .optional(),
    consultType: z.enum(["CLINIC", "HOME", "VIDEO"], { error: "Select the type of visit." }),
    clinicId: z.preprocess(blankToNull, z.string().nullable()).optional(),
    // ISO time for a booking later; absent/null = the patient is here now.
    scheduledAt: z.preprocess(blankToNull, z.string().nullable()).optional(),
    symptoms: z.preprocess(
      blankToNull,
      z
        .string({ error: "Enter the reason for the visit." })
        .min(3, "Describe the reason for the visit in a few words.")
        .max(1000, "Reason for visit must be at most 1000 characters."),
    ),
    allergies: optionalText("Allergies", 500),
    // HOME only. A typed address is enough here — the doctor is booking their
    // own visit, so there's no travel radius to check against coordinates.
    visit: z
      .object(
        {
          address: requiredText("Visit address", 300),
          landmark: optionalText("Landmark", 120),
          pinCode: z.preprocess(blankToNull, z.string().regex(/^\d{6}$/, "PIN code must be 6 digits.").nullable()),
        },
        BODY_ERROR,
      )
      .nullable()
      .optional(),
    paymentMethod: z.enum(["CASH", "ONLINE"], { error: "Select how the patient will pay." }),
    consentGiven: z.literal(true, { error: "Confirm the patient agreed to share these details with the doctor." }),
    // Book even though this person already has a live booking with the doctor.
    force: z.boolean().optional(),
  },
  BODY_ERROR,
);

// ── Health Assistant ──

/**
 * The conversation so far as plain text turns only. Tool calls/outputs and
 * system/developer messages are never accepted from the client — the
 * assistant's tool results come from the server, not from history the
 * client could forge.
 */
export const assistantRequestSchema = z.object(
  {
    messages: z
      .array(
        z.strictObject(
          {
            role: z.enum(["user", "assistant"], { error: "Each message's role must be \"user\" or \"assistant\"." }),
            content: z
              .string({ error: "Each message's content must be text." })
              .trim()
              .min(1, "Messages can't be empty.")
              .max(ASSISTANT_MAX_MESSAGE_CHARS, `Each message must be at most ${ASSISTANT_MAX_MESSAGE_CHARS} characters.`),
          },
          { error: "Each message must be { role, content } only." },
        ),
        { error: "messages must be a list." },
      )
      .min(1, "Missing messages.")
      .max(ASSISTANT_MAX_MESSAGES, `The conversation is too long (at most ${ASSISTANT_MAX_MESSAGES} messages). Start a new chat.`)
      .refine(
        (msgs) => msgs.reduce((n, m) => n + m.content.length, 0) <= ASSISTANT_MAX_TOTAL_CHARS,
        `The conversation is too long (at most ${ASSISTANT_MAX_TOTAL_CHARS} characters). Start a new chat.`,
      )
      .refine((msgs) => msgs[msgs.length - 1]?.role === "user", "The last message must be from you."),
    location: z.unknown().optional(),
  },
  BODY_ERROR,
);
