import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, isRecordNotFound } from "@/lib/routeGuards";
import { uploadToS3 } from "@/lib/s3";
import { verifyUpload } from "@/lib/fileSniff";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

// POST: Patient uploads/replaces their profile photo.
export async function POST(req: Request) {
  const { authUser, denied } = await requireRole("PATIENT");
  if (denied) return denied;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Only JPG or PNG images are allowed" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File must be under 5MB" }, { status: 400 });
  }

  const filename = `${authUser.id}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  // The bytes decide what this is, not the client-sent MIME type (src/lib/fileSniff.ts).
  const sniffed = verifyUpload(buffer, file.type, Object.keys(ALLOWED_TYPES));
  if ("error" in sniffed) return NextResponse.json({ error: sniffed.error }, { status: 400 });
  const url = await uploadToS3(`patient-photos/${filename}`, buffer, sniffed.type);

  try {
    const updated = await prisma.patientProfile.update({
      where: { userId: authUser.id },
      data: { photoUrl: url },
    });
    return NextResponse.json(updated);
  } catch (err) {
    if (isRecordNotFound(err)) {
      return NextResponse.json({ error: "Patient profile not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Could not update your photo. Please try again." }, { status: 500 });
  }
}

// DELETE: clears the patient's profile photo. Doesn't remove the file from
// S3, just detaches it — same as "Replace" already leaving the old file
// orphaned there.
export async function DELETE() {
  const { authUser, denied } = await requireRole("PATIENT");
  if (denied) return denied;

  try {
    const updated = await prisma.patientProfile.update({
      where: { userId: authUser.id },
      data: { photoUrl: null },
    });
    return NextResponse.json(updated);
  } catch (err) {
    if (isRecordNotFound(err)) {
      return NextResponse.json({ error: "Patient profile not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Could not update your photo. Please try again." }, { status: 500 });
  }
}
