// One-off: uploads every file under public/uploads/{patient-photos,doctor-docs,prescriptions}
// to S3 and rewrites the matching DB URL fields. Run once after AWS_* env vars are set:
//   npx tsx prisma/migrate-uploads-to-s3.ts
try {
  process.loadEnvFile();
} catch {
  // no .env file present — assume env vars are already set (e.g. in the container)
}

import { readdir, readFile } from "fs/promises";
import path from "path";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { uploadToS3 } from "../src/lib/s3";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://doconclick:doconclick_secret@localhost:5433/doconclick_db";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

const EXT_TO_CONTENT_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  pdf: "application/pdf",
};

async function migrateFolder(folder: string): Promise<Map<string, string>> {
  const localDir = path.join(process.cwd(), "public", "uploads", folder);
  const urlByFilename = new Map<string, string>();

  let filenames: string[];
  try {
    filenames = await readdir(localDir);
  } catch {
    return urlByFilename; // folder doesn't exist — nothing to migrate
  }

  for (const filename of filenames) {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const contentType = EXT_TO_CONTENT_TYPE[ext];
    if (!contentType) {
      console.warn(`  skipping ${filename}: unrecognized extension`);
      continue;
    }
    const buffer = await readFile(path.join(localDir, filename));
    const url = await uploadToS3(`${folder}/${filename}`, buffer, contentType);
    urlByFilename.set(`/uploads/${folder}/${filename}`, url);
    console.log(`  uploaded ${filename}`);
  }
  return urlByFilename;
}

async function main() {
  console.log("Migrating patient-photos...");
  const patientPhotoUrls = await migrateFolder("patient-photos");

  console.log("Migrating doctor-docs...");
  const doctorDocUrls = await migrateFolder("doctor-docs");

  console.log("Migrating prescriptions...");
  const prescriptionUrls = await migrateFolder("prescriptions");

  console.log("Updating PatientProfile.photoUrl...");
  for (const [oldUrl, newUrl] of patientPhotoUrls) {
    const { count } = await prisma.patientProfile.updateMany({
      where: { photoUrl: oldUrl },
      data: { photoUrl: newUrl },
    });
    if (count === 0) console.warn(`  no PatientProfile row matched ${oldUrl}`);
  }

  console.log("Updating DoctorProfile document/photo URLs...");
  const doctorFields = ["photoUrl", "medRegCertUrl", "degreeCertUrl", "kycDocUrl", "clinicPhotoUrl"] as const;
  for (const [oldUrl, newUrl] of doctorDocUrls) {
    let matched = false;
    for (const field of doctorFields) {
      const { count } = await prisma.doctorProfile.updateMany({
        where: { [field]: oldUrl },
        data: { [field]: newUrl },
      });
      if (count > 0) matched = true;
    }
    if (!matched) console.warn(`  no DoctorProfile row matched ${oldUrl}`);
  }

  console.log("Updating PrescriptionAttachment.url...");
  for (const [oldUrl, newUrl] of prescriptionUrls) {
    const { count } = await prisma.prescriptionAttachment.updateMany({
      where: { url: oldUrl },
      data: { url: newUrl },
    });
    if (count === 0) console.warn(`  no PrescriptionAttachment row matched ${oldUrl}`);
  }

  console.log("Done. Local files under public/uploads/ were left untouched — delete them manually once verified.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
