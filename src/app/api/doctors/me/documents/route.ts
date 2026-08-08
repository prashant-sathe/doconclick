import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

const DOC_FIELD: Record<string, "photoUrl" | "medRegCertUrl" | "degreeCertUrl" | "kycDocUrl"> = {
  photo: "photoUrl",
  medRegCert: "medRegCertUrl",
  degreeCert: "degreeCertUrl",
  kyc: "kycDocUrl",
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

  if (type !== "photo") {
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

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Only PDF, JPG, or PNG files are allowed" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File must be under 5MB" }, { status: 400 });
  }

  const dir = path.join(process.cwd(), "public", "uploads", "doctor-docs");
  await mkdir(dir, { recursive: true });
  const filename = `${authUser.id}-${type}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);

  const url = `/uploads/doctor-docs/${filename}`;
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
