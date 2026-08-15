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
