import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { readJson } from "@/lib/routeGuards";
import { ensureSpecialtiesSeeded, parseSpecialtyName, parseSpecialtyColor, findSpecialtyByName } from "@/lib/specialties";

const DUPLICATE = "A specialty with this name already exists.";

// GET: All specialties (active + inactive) for the admin management table
export async function GET() {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  await ensureSpecialtiesSeeded();
  const specialties = await prisma.specialty.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(specialties);
}

// POST: Create a new specialty
export async function POST(req: Request) {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;

  const parsedName = parseSpecialtyName(body.name);
  if ("error" in parsedName) return NextResponse.json({ error: parsedName.error }, { status: 400 });
  // A blank colour means "use the default"; anything else has to be a real one.
  const blankColor = body.color === undefined || body.color === null || body.color === "";
  const parsedColor = blankColor ? { color: "#2563eb" } : parseSpecialtyColor(body.color);
  if ("error" in parsedColor) return NextResponse.json({ error: parsedColor.error }, { status: 400 });

  // Names are unique ignoring case ("dentist" is "Dentist").
  if (await findSpecialtyByName(parsedName.name)) {
    return NextResponse.json({ error: DUPLICATE }, { status: 409 });
  }

  try {
    const specialty = await prisma.specialty.create({ data: { name: parsedName.name, color: parsedColor.color } });
    return NextResponse.json(specialty);
  } catch (err: unknown) {
    // Lost a race with another admin creating the same name (the lower(name) index).
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: DUPLICATE }, { status: 409 });
    }
    throw err;
  }
}
