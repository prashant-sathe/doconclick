import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  let settings = await prisma.platformSettings.findFirst();
  if (!settings) {
    settings = await prisma.platformSettings.create({ data: {} });
  }
  return NextResponse.json(settings);
}

export async function PATCH(req: Request) {
  const { commissionPercent } = await req.json();
  let settings = await prisma.platformSettings.findFirst();
  if (!settings) {
    settings = await prisma.platformSettings.create({
      data: { commissionPercent },
    });
  } else {
    settings = await prisma.platformSettings.update({
      where: { id: settings.id },
      data: { commissionPercent },
    });
  }
  return NextResponse.json(settings);
}
