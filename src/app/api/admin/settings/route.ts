import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { isOwnUploadUrl } from "@/lib/s3";
import { DOCTOR_REGISTRATION_FEE_MAX, DEFAULT_DOCTOR_REGISTRATION_ORIGINAL_FEE } from "@/lib/doctorFeePricing";
import { CASH_DUE_LIMIT_MAX } from "@/lib/duesPayments";
import { REFERRAL_REWARD_MAX, REFERRAL_CAP_MIN, REFERRAL_CAP_MAX } from "@/lib/referralLimits";
import { BOOKING_HORIZON_MIN_DAYS, BOOKING_HORIZON_MAX_DAYS, CHAT_FOLLOW_UP_MIN_DAYS, CHAT_FOLLOW_UP_MAX_DAYS } from "@/lib/bookingHorizon";

async function requireAdmin() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  return null;
}

// 2-digit state code, PAN, entity number, "Z", checksum character.
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

// Only a real JSON number counts. Number() would quietly turn "" / null (and
// NaN, which JSON.stringify sends as null) into 0 — i.e. a blank field would
// zero out a live commission or fee.
function finiteNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  let settings = await prisma.platformSettings.findFirst();
  if (!settings) {
    settings = await prisma.platformSettings.create({ data: {} });
  }
  return NextResponse.json(settings);
}

export async function PATCH(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  // Partial update: the finance page sends the commission fields, the settings
  // page sends the splash fields — only touch what was actually provided.
  const data: Record<string, unknown> = {};

  for (const key of ["clinicCommissionPercent", "videoCommissionPercent", "homeCommissionPercent"] as const) {
    if (body[key] === undefined) continue;
    const value = finiteNumber(body[key]);
    if (value === null || value < 0 || value > 100) {
      return NextResponse.json({ error: "Commission percentages must be between 0 and 100." }, { status: 400 });
    }
    data[key] = value;
  }

  if (body.nurseCommissionPercent !== undefined) {
    const value = finiteNumber(body.nurseCommissionPercent);
    if (value === null || value < 0 || value > 100) {
      return NextResponse.json({ error: "Commission percentages must be between 0 and 100." }, { status: 400 });
    }
    data.nurseCommissionPercent = value;
  }
  // ₹0 = free (no payment step / no subscription gate for nurses).
  for (const key of ["nurseRegistrationFee", "nurseSubscriptionFee"] as const) {
    if (body[key] === undefined) continue;
    const value = finiteNumber(body[key]);
    if (value === null || value < 0 || value > 100000) {
      return NextResponse.json({ error: "Nurse fees must be between ₹0 and ₹1,00,000." }, { status: 400 });
    }
    data[key] = Math.round(value);
  }

  // Doctors' one-time registration fee: an original price (> ₹0) and an
  // optional discounted price that is charged instead (null = no discount;
  // an explicit ₹0 = free, activated without paying). Orders already open
  // keep the amount they were created for.
  if (body.doctorRegistrationOriginalFee !== undefined) {
    const value = finiteNumber(body.doctorRegistrationOriginalFee);
    if (value === null || Math.round(value) < 1 || value > DOCTOR_REGISTRATION_FEE_MAX) {
      return NextResponse.json({ error: "The original registration fee must be between ₹1 and ₹1,00,000." }, { status: 400 });
    }
    data.doctorRegistrationOriginalFee = Math.round(value);
  }
  if (body.doctorRegistrationFee !== undefined) {
    // null clears the discount; anything else must be a real number (a blank
    // field is never silently "₹0 = free").
    if (body.doctorRegistrationFee === null) {
      data.doctorRegistrationFee = null;
    } else {
      const value = finiteNumber(body.doctorRegistrationFee);
      if (value === null || value < 0 || value > DOCTOR_REGISTRATION_FEE_MAX) {
        return NextResponse.json({ error: "The discounted registration fee must be between ₹0 and ₹1,00,000." }, { status: 400 });
      }
      data.doctorRegistrationFee = Math.round(value);
    }
  }
  if (data.doctorRegistrationOriginalFee !== undefined || typeof data.doctorRegistrationFee === "number") {
    const current = await prisma.platformSettings.findFirst({ select: { doctorRegistrationOriginalFee: true, doctorRegistrationFee: true } });
    const original = (data.doctorRegistrationOriginalFee as number | undefined) ?? current?.doctorRegistrationOriginalFee ?? DEFAULT_DOCTOR_REGISTRATION_ORIGINAL_FEE;
    const discounted = data.doctorRegistrationFee !== undefined ? (data.doctorRegistrationFee as number | null) : current?.doctorRegistrationFee ?? null;
    if (discounted !== null && discounted >= original) {
      return NextResponse.json(
        { error: "The discounted registration fee must be less than the original fee — or leave it empty for no discount." },
        { status: 400 }
      );
    }
  }

  // Most a doctor may owe on cash visits before cash bookings pause; ₹0 = no limit.
  if (body.cashDueLimit !== undefined) {
    const value = finiteNumber(body.cashDueLimit);
    if (value === null || value < 0 || value > CASH_DUE_LIMIT_MAX) {
      return NextResponse.json({ error: "The cash-due limit must be between ₹0 and ₹10,00,000." }, { status: 400 });
    }
    data.cashDueLimit = Math.round(value);
  }

  // Invite & earn rewards (src/lib/referrals.ts); ₹0 switches that side off.
  for (const key of ["referralRewardPatient", "referralRewardProvider"] as const) {
    if (body[key] === undefined) continue;
    const value = finiteNumber(body[key]);
    if (value === null || value < 0 || value > REFERRAL_REWARD_MAX) {
      return NextResponse.json({ error: `Referral rewards must be between ₹0 and ₹${REFERRAL_REWARD_MAX.toLocaleString("en-IN")}.` }, { status: 400 });
    }
    data[key] = Math.round(value);
  }
  if (body.referralMonthlyCap !== undefined) {
    const value = finiteNumber(body.referralMonthlyCap);
    if (value === null || !Number.isInteger(value) || value < REFERRAL_CAP_MIN || value > REFERRAL_CAP_MAX) {
      return NextResponse.json(
        { error: `The monthly referral cap must be a whole number between ${REFERRAL_CAP_MIN} and ${REFERRAL_CAP_MAX}.` },
        { status: 400 }
      );
    }
    data.referralMonthlyCap = value;
  }

  if (body.bookingHorizonDays !== undefined) {
    const value = finiteNumber(body.bookingHorizonDays);
    if (value === null || !Number.isInteger(value) || value < BOOKING_HORIZON_MIN_DAYS || value > BOOKING_HORIZON_MAX_DAYS) {
      return NextResponse.json(
        { error: `Booking window must be a whole number of days between ${BOOKING_HORIZON_MIN_DAYS} and ${BOOKING_HORIZON_MAX_DAYS}.` },
        { status: 400 }
      );
    }
    data.bookingHorizonDays = value;
  }

  if (body.chatFollowUpDays !== undefined) {
    const value = finiteNumber(body.chatFollowUpDays);
    if (value === null || !Number.isInteger(value) || value < CHAT_FOLLOW_UP_MIN_DAYS || value > CHAT_FOLLOW_UP_MAX_DAYS) {
      return NextResponse.json(
        { error: `Follow-up chat window must be a whole number of days between ${CHAT_FOLLOW_UP_MIN_DAYS} and ${CHAT_FOLLOW_UP_MAX_DAYS}.` },
        { status: 400 }
      );
    }
    data.chatFollowUpDays = value;
  }

  // Supplier block on patient receipts (src/lib/receipts.ts). Blank clears a
  // field (name → "DocOnClick", tax note → the default GST line).
  for (const [key, max] of [["receiptLegalName", 120], ["receiptAddress", 300], ["receiptTaxNote", 400]] as const) {
    if (body[key] === undefined) continue;
    if (body[key] !== null && typeof body[key] !== "string") {
      return NextResponse.json({ error: "Receipt details must be text." }, { status: 400 });
    }
    const value = (body[key] ?? "").trim();
    if (value.length > max) {
      return NextResponse.json({ error: `Receipt details are too long (max ${max} characters).` }, { status: 400 });
    }
    data[key] = value || null;
  }
  if (body.receiptGstin !== undefined) {
    if (body.receiptGstin !== null && typeof body.receiptGstin !== "string") {
      return NextResponse.json({ error: "Enter a valid 15-character GSTIN, e.g. 27ABCDE1234F1Z5." }, { status: 400 });
    }
    const gstin = (body.receiptGstin ?? "").trim().toUpperCase();
    if (gstin && !GSTIN_RE.test(gstin)) {
      return NextResponse.json({ error: "Enter a valid 15-character GSTIN, e.g. 27ABCDE1234F1Z5." }, { status: 400 });
    }
    data.receiptGstin = gstin || null;
  }

  // Only an image uploaded through Settings (our bucket, app-splash/) — every
  // app shows this on launch, so it mustn't point anywhere else.
  if (body.splashImageUrl !== undefined) {
    if (body.splashImageUrl === null || body.splashImageUrl === "") {
      data.splashImageUrl = null;
    } else if (typeof body.splashImageUrl !== "string" || !isOwnUploadUrl(body.splashImageUrl.trim(), "app-splash")) {
      return NextResponse.json({ error: "Upload the splash image here in Settings — links to other sites aren't allowed." }, { status: 400 });
    } else {
      data.splashImageUrl = body.splashImageUrl.trim();
    }
  }
  if (body.splashFit !== undefined) {
    if (body.splashFit !== "cover" && body.splashFit !== "contain") {
      return NextResponse.json({ error: "splashFit must be 'cover' or 'contain'." }, { status: 400 });
    }
    data.splashFit = body.splashFit;
  }
  if (body.splashBgColor !== undefined) {
    const color = String(body.splashBgColor).trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      return NextResponse.json({ error: "splashBgColor must be a hex colour like #F8FAFC." }, { status: 400 });
    }
    data.splashBgColor = color;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  let settings = await prisma.platformSettings.findFirst();
  if (!settings) {
    settings = await prisma.platformSettings.create({ data });
  } else {
    settings = await prisma.platformSettings.update({
      where: { id: settings.id },
      data,
    });
  }
  return NextResponse.json(settings);
}
