export interface Specialty {
  name: string;
  color: string;
}

export const SPECIALTIES: Specialty[] = [
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

const SPECIALTY_COLOR: Record<string, string> = Object.fromEntries(
  SPECIALTIES.map((s) => [s.name, s.color])
);

export function specialtyColor(specialty: string): string {
  return SPECIALTY_COLOR[specialty] ?? "#2563eb";
}
