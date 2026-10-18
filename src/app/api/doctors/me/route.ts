import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, verifyPassword } from "@/lib/auth";
import { requireActiveDoctor } from "@/lib/doctorGuard";
import type { Prisma } from "@/generated/prisma/client";
import { createRateLimiter } from "@/lib/rateLimit";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import {
  LOCKED_FIELDS, LOCKED_FIELD_LABELS, isProfileLocked, validateBank, maskAccount,
  type FieldChanges, type LockedField,
} from "@/lib/doctorProfileLock";

// GET: The currently logged-in doctor's own profile
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const suspendedResponse = await requireActiveDoctor(authUser);
  if (suspendedResponse) return suspendedResponse;

  const doctor = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: {
      id: true,
      name: true,
      mobile: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      doctorProfile: true,
      clinics: { where: { deletedAt: null }, select: { id: true } },
      // The latest re-verification request (pending, or the last outcome).
      changeRequests: { orderBy: { createdAt: "desc" }, take: 1, where: { status: { not: "WITHDRAWN" } } },
    },
  });

  if (!doctor) {
    return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  }

  const { changeRequests, ...rest } = doctor;
  return NextResponse.json({ ...rest, changeRequest: changeRequests[0] ?? null });
}

// Free edits. medRegNo/qualification/specialty are handled separately (they
// lock after verification) and bank details go through `bank` with a password.
const EDITABLE_FIELDS = [
  "experience",
  "consultFee",
  "videoFee",
  "homeVisitFee",
  "availability",
  "radius",
  "offersHomeVisit",
  "offersClinic",
  "offersVideo",
  "languages",
  "bio",
  "address",
  "clinicName",
  "lat",
  "lng",
] as const;

// Caps password guesses on the bank-details change by someone holding a session.
const checkBankAttemptLimit = createRateLimiter(5, 15 * 60 * 1000);

const MAX_FEE = 50000;
const MAX_EXPERIENCE_YEARS = 70;
const FEE_LABELS = { consultFee: "Clinic fee", videoFee: "Video fee", homeVisitFee: "Home visit fee" } as const;

// A number from a form field: blank/null → `blank`; a finite number or
// numeric string → that number; anything else (NaN, "abc", true, {}) → null.
function parseNumber(value: unknown, blank: number | null): number | null {
  if (value === "" || value == null) return blank;
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\s*-?\d+(\.\d+)?\s*$/.test(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const normalizeText = (v: unknown) => (v === "" || v == null ? null : String(v).trim() || null);

// PATCH: Update the logged-in doctor's own profile.
// - medRegNo / qualification / specialty: edited freely until the profile is
//   approved or verified; after that a change becomes a re-verification
//   request (DoctorChangeRequest) for an admin, and the live profile keeps
//   the verified values until it's approved.
// - bank: { bankName, accountNumber, accountNumberConfirm, ifsc } (or null to
//   remove), validated, and only with `currentPassword`; the doctor is pushed
//   a notice so a change they didn't make is noticed.
export async function PATCH(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const suspendedResponse = await requireActiveDoctor(authUser);
  if (suspendedResponse) return suspendedResponse;

  const body = await req.json().catch(() => ({}));
  const profile = await prisma.doctorProfile.findUnique({
    where: { userId: authUser.id },
    select: { isVerified: true, status: true, medRegNo: true, qualification: true, specialty: true, bankDetails: true },
  });
  if (!profile) return NextResponse.json({ error: "Doctor not found" }, { status: 404 });

  const data: Record<string, string | number | boolean | Date | null> = {};

  for (const key of EDITABLE_FIELDS) {
    if (!(key in body)) continue;
    const value = body[key];
    if (key === "experience") {
      const years = parseNumber(value, 0);
      if (years === null || !Number.isInteger(years) || years < 0 || years > MAX_EXPERIENCE_YEARS) {
        return NextResponse.json({ error: `Experience must be a whole number of years (0–${MAX_EXPERIENCE_YEARS}).` }, { status: 400 });
      }
      data[key] = years;
    } else if (key === "consultFee" || key === "videoFee" || key === "homeVisitFee") {
      // Blank means "not offered" → ₹0. Anything else must be a real amount.
      const fee = parseNumber(value, 0);
      if (fee === null || fee < 0 || fee > MAX_FEE) {
        return NextResponse.json({ error: `${FEE_LABELS[key]} must be between ₹0 and ₹${MAX_FEE.toLocaleString("en-IN")}.` }, { status: 400 });
      }
      data[key] = Math.round(fee * 100) / 100;
    } else if (key === "radius") {
      data[key] = Math.min(20, Math.max(5, Number(value) || 5));
    } else if (key === "lat" || key === "lng") {
      const coord = parseNumber(value, null);
      if (coord === null && !(value === "" || value == null)) {
        return NextResponse.json({ error: "Invalid location." }, { status: 400 });
      }
      if (coord !== null && Math.abs(coord) > (key === "lat" ? 90 : 180)) {
        return NextResponse.json({ error: "Invalid location." }, { status: 400 });
      }
      data[key] = coord;
    } else if (key === "offersHomeVisit" || key === "offersClinic" || key === "offersVideo") {
      data[key] = Boolean(value);
    } else {
      data[key] = value === "" || value == null ? null : String(value);
    }
  }

  // ── Verified fields ──
  const locked = isProfileLocked(profile);
  const requested: FieldChanges = {};
  for (const field of LOCKED_FIELDS) {
    if (!(field in body)) continue;
    const value = normalizeText(body[field]);
    if (field === "specialty" && !value) {
      return NextResponse.json({ error: "Choose a specialty." }, { status: 400 });
    }
    if (!locked) {
      data[field] = value;
    } else if (value !== (profile[field] ?? null)) {
      if (!value) {
        return NextResponse.json({ error: `${LOCKED_FIELD_LABELS[field]} can't be removed after verification.` }, { status: 400 });
      }
      requested[field] = { from: profile[field] ?? null, to: value };
    }
  }
  if (requested.medRegNo?.to) {
    const taken = await prisma.doctorProfile.findFirst({
      where: { medRegNo: requested.medRegNo.to, userId: { not: authUser.id } },
      select: { id: true },
    });
    if (taken) return NextResponse.json({ error: "This registration number is already in use." }, { status: 409 });
  }

  // ── Bank details ──
  if ("bankDetails" in body) {
    return NextResponse.json({ error: "Update bank details from Profile → Bank Details." }, { status: 400 });
  }
  let bankLast4: string | null = null;
  let bankChanged = false;
  if ("bank" in body) {
    const bank = validateBank(body.bank);
    if ("error" in bank) return NextResponse.json({ error: bank.error }, { status: 400 });
    if (bank.bankDetails !== (profile.bankDetails ?? null)) {
      const user = await prisma.user.findUnique({ where: { id: authUser.id }, select: { password: true } });
      if (!user?.password) {
        return NextResponse.json(
          { error: "Set a password first (verify with Google), then change your bank details.", code: "REVERIFY_REQUIRED" },
          { status: 403 }
        );
      }
      const { currentPassword } = body;
      if (typeof currentPassword !== "string" || !currentPassword) {
        return NextResponse.json({ error: "Enter your password to change bank details.", code: "PASSWORD_REQUIRED" }, { status: 400 });
      }
      if (!checkBankAttemptLimit(authUser.id)) {
        return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
      }
      if (!(await verifyPassword(currentPassword, user.password))) {
        return NextResponse.json({ error: "Password is incorrect.", code: "WRONG_PASSWORD" }, { status: 400 });
      }
      data.bankDetails = bank.bankDetails;
      data.bankDetailsUpdatedAt = new Date();
      bankChanged = true;
      bankLast4 = bank.last4;
    }
  }

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const updated = Object.keys(data).length > 0
        ? await tx.doctorProfile.update({ where: { userId: authUser.id }, data })
        : await tx.doctorProfile.findUniqueOrThrow({ where: { userId: authUser.id } });
      const changeRequest = locked && LOCKED_FIELDS.some((f) => f in body)
        ? await mergeChangeRequest(tx, authUser.id, profile, requested, LOCKED_FIELDS.filter((f) => f in body))
        : await tx.doctorChangeRequest.findFirst({ where: { doctorId: authUser.id, status: "PENDING" } });
      return { updated, changeRequest };
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "This registration number is already in use." }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "Could not save your profile. Please try again." }, { status: 500 });
  }

  if (bankChanged) {
    void sendPushToUser(authUser.id, {
      title: "Bank details changed",
      body: bankLast4
        ? `Your payouts will now go to account ${maskAccount(bankLast4)}. If you didn't make this change, contact support right away.`
        : "Your bank details were removed. If you didn't make this change, contact support right away.",
      url: "/doctor/profile/bank",
    });
  }

  return NextResponse.json({ ...result.updated, changeRequest: result.changeRequest });
}

// Folds this edit into the doctor's one PENDING re-verification request:
// fields sent now replace what was asked before, a field set back to its
// live (verified) value drops out, and a request left with nothing in it is
// withdrawn.
async function mergeChangeRequest(
  tx: Prisma.TransactionClient,
  doctorId: string,
  live: Record<LockedField, string | null>,
  requested: FieldChanges,
  sentFields: LockedField[]
) {
  const pending = await tx.doctorChangeRequest.findFirst({ where: { doctorId, status: "PENDING" } });
  const changes: FieldChanges = { ...((pending?.changes as FieldChanges | null) ?? {}) };
  for (const field of sentFields) {
    if (requested[field]) changes[field] = requested[field];
    else delete changes[field];
  }
  // Re-anchor "from" on today's live value in case it moved since.
  for (const field of Object.keys(changes) as LockedField[]) {
    changes[field] = { from: live[field] ?? null, to: changes[field]!.to };
  }
  const empty = Object.keys(changes).length === 0;
  if (pending) {
    return empty
      ? (await tx.doctorChangeRequest.update({ where: { id: pending.id }, data: { status: "WITHDRAWN", resolvedAt: new Date() } }), null)
      : tx.doctorChangeRequest.update({ where: { id: pending.id }, data: { changes } });
  }
  return empty ? null : tx.doctorChangeRequest.create({ data: { doctorId, changes } });
}
