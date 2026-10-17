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

// Long-hours care: the nurse stays for the whole shift.
const DEFAULT_SHIFT_SERVICES = [
  { name: "12-hour Day Shift", description: "Nurse stays with the patient for 12 hours in the day — care, medicines on time, hygiene, vitals.", durationMinutes: 720, suggestedPrice: 1500 },
  { name: "12-hour Night Shift", description: "Nurse stays overnight for 12 hours — night care, turning, medicines, and help if anything changes.", durationMinutes: 720, suggestedPrice: 1800 },
  { name: "24-hour Live-in Care", description: "Round-the-clock nursing care for 24 hours — for bedridden, post-operative or elderly patients.", durationMinutes: 1440, suggestedPrice: 3000 },
];

export async function ensureNurseServices() {
  const count = await prisma.nurseService.count();
  if (count === 0) {
    await prisma.nurseService.createMany({
      data: DEFAULT_NURSE_SERVICES.map((s, i) => ({ ...s, sortOrder: i })),
      skipDuplicates: true,
    });
  }
  // Shift services arrived after the first catalogue — add them once to an
  // existing catalogue, then never again (so an admin deleting one sticks).
  const settings = (await prisma.platformSettings.findFirst()) ?? (await prisma.platformSettings.create({ data: {} }));
  if (!settings.nurseShiftServicesSeeded) {
    const last = await prisma.nurseService.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    await prisma.nurseService.createMany({
      data: DEFAULT_SHIFT_SERVICES.map((s, i) => ({ ...s, kind: "SHIFT", requiresPrescription: false, sortOrder: (last?.sortOrder ?? 0) + 1 + i })),
      skipDuplicates: true,
    });
    await prisma.platformSettings.update({ where: { id: settings.id }, data: { nurseShiftServicesSeeded: true } });
  }
}
