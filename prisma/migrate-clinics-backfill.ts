// One-off: creates a first Clinic (+ ClinicSlot rows) for every doctor who
// has a lat/lng set but no Clinic rows yet, from their existing
// DoctorProfile.{clinicName,address,clinicPhotoUrl,lat,lng,availability}.
// Run once after db:push:
//   npx tsx prisma/migrate-clinics-backfill.ts
try {
  process.loadEnvFile();
} catch {
  // no .env file present — assume env vars are already set (e.g. in the container)
}

import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { parseAvailabilityString } from "../src/lib/availability";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://doconclick:doconclick_secret@localhost:5433/doconclick_db";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

async function main() {
  const doctors = await prisma.doctorProfile.findMany({
    where: { lat: { not: null }, lng: { not: null }, user: { clinics: { none: {} } } },
  });

  console.log(`Found ${doctors.length} doctor(s) to backfill.`);

  for (const profile of doctors) {
    const slots = parseAvailabilityString(profile.availability);
    await prisma.clinic.create({
      data: {
        doctorId: profile.userId,
        name: profile.clinicName || "Clinic",
        address: profile.address || "",
        photoUrl: profile.clinicPhotoUrl,
        lat: profile.lat!,
        lng: profile.lng!,
        slots: { create: slots },
      },
    });
    console.log(`  ✓ ${profile.userId} — ${slots.length} slot(s)`);
  }

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
