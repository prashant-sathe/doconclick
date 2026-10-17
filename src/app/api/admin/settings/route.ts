import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

async function requireAdmin() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  return null;
}

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

  if (body.splashImageUrl !== undefined) {
    data.splashImageUrl = body.splashImageUrl ? String(body.splashImageUrl).trim() : null;
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
