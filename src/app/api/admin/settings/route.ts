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

  const body = await req.json();
  // Partial update: the finance page sends the commission fields, the settings
  // page sends the splash fields — only touch what was actually provided.
  const data: Record<string, unknown> = {};

  for (const key of ["clinicCommissionPercent", "videoCommissionPercent", "homeCommissionPercent"] as const) {
    if (body[key] === undefined) continue;
    const value = Number(body[key]);
    if (Number.isNaN(value) || value < 0 || value > 100) {
      return NextResponse.json({ error: "Commission percentages must be between 0 and 100." }, { status: 400 });
    }
    data[key] = value;
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
