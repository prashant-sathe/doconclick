import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureNurseServices } from "@/lib/nurseServices";

// GET: active nurse services (public — the patient booking page and the
// nurse's own service picker both read this).
export async function GET() {
  await ensureNurseServices();
  const services = await prisma.nurseService.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(services);
}
