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

  const { clinicCommissionPercent, videoCommissionPercent, homeCommissionPercent } = await req.json();
  const data = {
    clinicCommissionPercent: Number(clinicCommissionPercent),
    videoCommissionPercent: Number(videoCommissionPercent),
    homeCommissionPercent: Number(homeCommissionPercent),
  };
  if (Object.values(data).some((v) => Number.isNaN(v) || v < 0 || v > 100)) {
    return NextResponse.json({ error: "Commission percentages must be between 0 and 100." }, { status: 400 });
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
