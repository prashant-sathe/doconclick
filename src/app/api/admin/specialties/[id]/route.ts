import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { readJson } from "@/lib/routeGuards";
import { parseSpecialtyName, parseSpecialtyColor, findSpecialtyByName, renameSpecialty } from "@/lib/specialties";

const DUPLICATE = "A specialty with this name already exists.";

// PATCH: Toggle active state and/or change name/color. Renaming carries the
// new name to every doctor who has the specialty (see renameSpecialty).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const existing = await prisma.specialty.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Specialty not found" }, { status: 404 });

  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;
  const { isActive, color, name } = body;

  let newName = existing.name;
  if (name !== undefined) {
    const parsed = parseSpecialtyName(name);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    newName = parsed.name;
  }
  let newColor: string | undefined;
  if (color !== undefined && color !== null && color !== "") {
    const parsed = parseSpecialtyColor(color);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    newColor = parsed.color;
  }
  if (isActive !== undefined && typeof isActive !== "boolean") {
    return NextResponse.json({ error: "isActive must be true or false." }, { status: 400 });
  }

  // Unique ignoring case — but renaming "dentist" to "Dentist" (only the case
  // changes) is the same specialty, so it's excluded from the check.
  if (newName !== existing.name && (await findSpecialtyByName(newName, id))) {
    return NextResponse.json({ error: DUPLICATE }, { status: 409 });
  }

  try {
    const { specialty, doctorsUpdated } = await renameSpecialty(id, existing.name, newName, {
      ...(newColor ? { color: newColor } : {}),
      ...(typeof isActive === "boolean" ? { isActive } : {}),
    });
    return NextResponse.json({ ...specialty, doctorsUpdated });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: DUPLICATE }, { status: 409 });
    }
    throw err;
  }
}

// DELETE: Remove a specialty — blocked if any doctor currently has it selected
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const specialty = await prisma.specialty.findUnique({ where: { id } });
  if (!specialty) {
    return NextResponse.json({ error: "Specialty not found" }, { status: 404 });
  }

  const inUseCount = await prisma.doctorProfile.count({ where: { specialty: { equals: specialty.name, mode: "insensitive" } } });
  if (inUseCount > 0) {
    return NextResponse.json(
      { error: `In use by ${inUseCount} doctor${inUseCount === 1 ? "" : "s"} — deactivate instead of deleting.` },
      { status: 409 }
    );
  }

  await prisma.specialty.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
