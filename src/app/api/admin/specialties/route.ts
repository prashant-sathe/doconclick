import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { ensureSpecialtiesSeeded } from "@/lib/specialties";

async function requireAdmin() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  return null;
}

// GET: All specialties (active + inactive) for the admin management table
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  await ensureSpecialtiesSeeded();
  const specialties = await prisma.specialty.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(specialties);
}

// POST: Create a new specialty
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { name, color } = await req.json();
  const trimmed = String(name ?? "").trim();
  if (!trimmed) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  try {
    const specialty = await prisma.specialty.create({
      data: { name: trimmed, color: color || "#2563eb" },
    });
    return NextResponse.json(specialty);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "A specialty with this name already exists." }, { status: 409 });
    }
    throw err;
  }
}
