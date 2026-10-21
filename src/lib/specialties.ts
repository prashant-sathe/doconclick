import { prisma } from "@/lib/prisma";

export interface Specialty {
  name: string;
  color: string;
}

// Seed values used to bootstrap the Specialty table on first read
// (see src/app/api/specialties/route.ts). Admins manage the live list
// from /admin/specialties from then on.
export const DEFAULT_SPECIALTIES: Specialty[] = [
  { name: "General Physician", color: "#2563eb" },
  { name: "Pediatrician", color: "#16a34a" },
  { name: "Orthopedic Surgeon", color: "#ea580c" },
  { name: "Dermatologist", color: "#9333ea" },
  { name: "Gynecologist", color: "#db2777" },
  { name: "Physiotherapist", color: "#0d9488" },
  { name: "Dentist", color: "#7c3aed" },
  { name: "Cardiologist", color: "#dc2626" },
  { name: "Neurologist", color: "#0891b2" },
  { name: "ENT Specialist", color: "#ca8a04" },
];

// Called from both the public and admin specialty GET routes so the table
// gets its defaults on first read no matter which one is hit first.
export async function ensureSpecialtiesSeeded() {
  const count = await prisma.specialty.count();
  if (count === 0) {
    await prisma.specialty.createMany({ data: DEFAULT_SPECIALTIES, skipDuplicates: true });
  }
}

// ── Names and colours ──
// DoctorProfile.specialty stores the specialty's *name* (not an id), and the
// listing, search, matching and assistant code all compare it as a string. So
// the Specialty table is the one place a name can change, and doing so
// cascades to the doctors (renameSpecialty). Names are unique ignoring case —
// "Dentist" and "dentist" would otherwise be two specialties no filter could
// tell apart — enforced by a lower(name) unique index (prisma/sql/partial-indexes.sql).

export const SPECIALTY_NAME_MAX = 60;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** A trimmed, single-spaced name — or an error message. */
export function parseSpecialtyName(raw: unknown): { name: string } | { error: string } {
  if (typeof raw !== "string") return { error: "Name is required" };
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) return { error: "Name is required" };
  if (name.length > SPECIALTY_NAME_MAX) return { error: `Name must be at most ${SPECIALTY_NAME_MAX} characters.` };
  return { name };
}

/** A #rrggbb colour (stored lowercase) — or an error message. */
export function parseSpecialtyColor(raw: unknown): { color: string } | { error: string } {
  if (typeof raw !== "string" || !HEX_COLOR.test(raw.trim())) {
    return { error: "Color must be a hex value like #2563eb." };
  }
  return { color: raw.trim().toLowerCase() };
}

/** The specialty with this name, ignoring case; `exceptId` skips the one being edited. */
export function findSpecialtyByName(name: string, exceptId?: string) {
  return prisma.specialty.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
  });
}

/**
 * The stored spelling of a specialty name, ignoring case ("dentist" →
 * "Dentist"), or the input unchanged when there's no such specialty.
 */
export async function canonicalSpecialtyName(name: string): Promise<string> {
  return (await findSpecialtyByName(name))?.name ?? name;
}

/**
 * Renames a specialty and carries the new name to everything that stores the
 * old one, in one transaction: every doctor with it, and any pending
 * re-verification request asking to change to/from it (otherwise approving
 * it later would put the old name back). Returns how many doctors moved.
 */
export async function renameSpecialty(id: string, oldName: string, newName: string, rest: { color?: string; isActive?: boolean }) {
  return prisma.$transaction(async (tx) => {
    const specialty = await tx.specialty.update({ where: { id }, data: { name: newName, ...rest } });
    if (oldName === newName) return { specialty, doctorsUpdated: 0 };

    const { count } = await tx.doctorProfile.updateMany({
      where: { specialty: { equals: oldName, mode: "insensitive" } },
      data: { specialty: newName },
    });

    const pending = await tx.doctorChangeRequest.findMany({ where: { status: "PENDING" }, select: { id: true, changes: true } });
    for (const req of pending) {
      const changes = req.changes as Record<string, { from: string | null; to: string | null }> | null;
      const s = changes?.specialty;
      if (!s) continue;
      const same = (v: string | null) => v != null && v.toLowerCase() === oldName.toLowerCase();
      if (!same(s.from) && !same(s.to)) continue;
      await tx.doctorChangeRequest.update({
        where: { id: req.id },
        data: { changes: { ...changes, specialty: { from: same(s.from) ? newName : s.from, to: same(s.to) ? newName : s.to } } },
      });
    }
    return { specialty, doctorsUpdated: count };
  });
}
