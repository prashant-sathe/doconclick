import { prisma } from "@/lib/prisma";

// Starter catalogue — written once, the first time the table is read while
// empty. After that the admin owns the list (/admin/nurse-services).
const DEFAULT_NURSE_SERVICES = [
  { name: "Injection (IM / IV)", description: "Doctor-prescribed injection given at home.", durationMinutes: 20, suggestedPrice: 300, requiresPrescription: true },
  { name: "IV Drip / Infusion", description: "Set up and monitor an IV drip at home.", durationMinutes: 90, suggestedPrice: 800, requiresPrescription: true },
  { name: "Wound Dressing", description: "Cleaning and dressing of wounds, ulcers or surgical sites.", durationMinutes: 30, suggestedPrice: 400, requiresPrescription: false },
  { name: "Catheter Insertion / Removal", description: "Urinary catheter care, insertion or removal.", durationMinutes: 30, suggestedPrice: 700, requiresPrescription: true },
  { name: "Suture / Staple Removal", description: "Removal of stitches or staples after surgery.", durationMinutes: 20, suggestedPrice: 400, requiresPrescription: false },
  { name: "BP & Sugar Check", description: "Blood pressure, blood sugar and vitals check.", durationMinutes: 15, suggestedPrice: 200, requiresPrescription: false },
  { name: "Nebulization", description: "Nebulizer treatment at home.", durationMinutes: 20, suggestedPrice: 300, requiresPrescription: true },
  { name: "Post-Operative Care", description: "Care and monitoring after a surgery or hospital discharge.", durationMinutes: 60, suggestedPrice: 900, requiresPrescription: false },
  { name: "Elderly Care Visit", description: "Hygiene, mobility, medication and vitals for an elderly patient.", durationMinutes: 60, suggestedPrice: 700, requiresPrescription: false },
  { name: "Mother & Baby Care", description: "Post-delivery care for mother and newborn.", durationMinutes: 60, suggestedPrice: 800, requiresPrescription: false },
];

export async function ensureNurseServices() {
  const count = await prisma.nurseService.count();
  if (count > 0) return;
  await prisma.nurseService.createMany({
    data: DEFAULT_NURSE_SERVICES.map((s, i) => ({ ...s, sortOrder: i })),
    skipDuplicates: true,
  });
}
