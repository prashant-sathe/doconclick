import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { uploadToS3 } from "@/lib/s3";
import { slugify } from "@/lib/utils";

const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};
// Signature is embedded as an <img> in the prescription PDF, so a PDF upload
// wouldn't render — restrict it to image formats only.
const IMAGE_ONLY_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

const DOC_FIELD: Record<string, "photoUrl" | "medRegCertUrl" | "degreeCertUrl" | "kycDocUrl" | "clinicPhotoUrl" | "signatureUrl"> = {
  photo: "photoUrl",
  medRegCert: "medRegCertUrl",
  degreeCert: "degreeCertUrl",
  kyc: "kycDocUrl",
  clinicPhoto: "clinicPhotoUrl",
  signature: "signatureUrl",
};

// POST: Doctor uploads a verification document or profile photo.
// `type` (form field) selects which slot: photo | medRegCert | degreeCert | kyc
export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const form = await req.formData();
  const type = form.get("type");
  if (typeof type !== "string" || !(type in DOC_FIELD)) {
    return NextResponse.json({ error: "Invalid document type" }, { status: 400 });
  }

  if (type !== "photo" && type !== "clinicPhoto" && type !== "signature") {
    const profile = await prisma.doctorProfile.findUnique({ where: { userId: authUser.id } });
    if (profile?.isVerified) {
      return NextResponse.json(
        { error: "Your credentials are already verified — verification documents can no longer be changed." },
        { status: 403 }
      );
    }
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const allowedTypes = type === "signature" ? IMAGE_ONLY_TYPES : ALLOWED_TYPES;
  const ext = allowedTypes[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: type === "signature" ? "Only JPG or PNG images are allowed" : "Only PDF, JPG, or PNG files are allowed" },
      { status: 400 }
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File must be under 5MB" }, { status: 400 });
  }

  const folder = `${slugify(authUser.name)}-${authUser.id}`;
  const filename = `${type}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const url = await uploadToS3(`doctor-docs/${folder}/${filename}`, buffer, file.type);
  const field = DOC_FIELD[type];

  try {
    const updated = await prisma.doctorProfile.update({
      where: { userId: authUser.id },
      data: { [field]: url },
    });
    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });
  }
}

// DELETE: clears a document/photo slot. Same locked-once-verified guard as
// POST — this doesn't remove the file from S3, just detaches it, matching
// how "Replace" already leaves the old file orphaned there.
export async function DELETE(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const type = body.type;
  if (typeof type !== "string" || !(type in DOC_FIELD)) {
    return NextResponse.json({ error: "Invalid document type" }, { status: 400 });
  }

  if (type !== "photo" && type !== "clinicPhoto" && type !== "signature") {
    const profile = await prisma.doctorProfile.findUnique({ where: { userId: authUser.id } });
    if (profile?.isVerified) {
      return NextResponse.json(
        { error: "Your credentials are already verified — verification documents can no longer be changed." },
        { status: 403 }
      );
    }
  }

  const field = DOC_FIELD[type];

  try {
    const updated = await prisma.doctorProfile.update({
      where: { userId: authUser.id },
      data: { [field]: null },
    });
    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });
  }
}
