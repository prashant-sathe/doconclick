import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { uploadToS3 } from "@/lib/s3";
import { verifyUpload } from "@/lib/fileSniff";
import { slugify } from "@/lib/utils";
import { requireActiveNurse } from "@/lib/providerGuard";
import { withErrorLocale } from "@/lib/apiErrors";
import { notifyAdminNurseReReview } from "@/lib/nurseReReview";

const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};
const IMAGE_ONLY_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

const DOC_FIELD: Record<string, "photoUrl" | "councilCertUrl" | "degreeCertUrl" | "kycDocUrl" | "policeVerifUrl"> = {
  photo: "photoUrl",
  councilCert: "councilCertUrl",
  degreeCert: "degreeCertUrl",
  kyc: "kycDocUrl",
  policeVerif: "policeVerifUrl",
};

async function authorize() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "NURSE") {
    return { authUser: null, denied: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  const denied = await requireActiveNurse(authUser);
  return denied ? { authUser: null, denied } : { authUser, denied: null };
}

// Verification documents are frozen once the admin has verified them —
// only the profile photo can still change.
async function lockedResponse(userId: string, type: string) {
  if (type === "photo") return null;
  const profile = await prisma.nurseProfile.findUnique({ where: { userId }, select: { isVerified: true } });
  if (profile?.isVerified) {
    return NextResponse.json(
      { error: "Your credentials are already verified — verification documents can no longer be changed." },
      { status: 403 }
    );
  }
  return null;
}

// Replacing or removing a verification document of an APPROVED nurse sends
// her back to PENDING for re-review (the photo is free to change).
async function saveDoc(userId: string, name: string, type: string, url: string | null) {
  const field = DOC_FIELD[type];
  const before = (await prisma.nurseProfile.findUnique({ where: { userId } })) as Record<string, unknown> | null;
  const reReview = type !== "photo" && before?.status === "APPROVED" && !!before[field];
  const updated = await prisma.nurseProfile.update({
    where: { userId },
    data: { [field]: url, ...(reReview ? { status: "PENDING" } : {}) },
  });
  if (reReview) notifyAdminNurseReReview(name);
  return updated;
}

// POST: nurse uploads a verification document or profile photo.
// Form fields: type (photo | councilCert | degreeCert | kyc | policeVerif), file
export const POST = withErrorLocale(async function POST(req: Request) {
  const { authUser, denied } = await authorize();
  if (!authUser) return denied;

  const form = await req.formData();
  const type = form.get("type");
  if (typeof type !== "string" || !(type in DOC_FIELD)) {
    return NextResponse.json({ error: "Invalid document type" }, { status: 400 });
  }
  const locked = await lockedResponse(authUser.id, type);
  if (locked) return locked;

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  const ext = (type === "photo" ? IMAGE_ONLY_TYPES : ALLOWED_TYPES)[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: type === "photo" ? "Only JPG or PNG images are allowed" : "Only PDF, JPG, or PNG files are allowed" },
      { status: 400 }
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File must be under 5MB" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // The bytes decide what this is, not the client-sent MIME type (src/lib/fileSniff.ts).
  const sniffed = verifyUpload(buffer, file.type, Object.keys(type === "photo" ? IMAGE_ONLY_TYPES : ALLOWED_TYPES));
  if ("error" in sniffed) return NextResponse.json({ error: sniffed.error }, { status: 400 });

  const folder = `${slugify(authUser.name)}-${authUser.id}`;
  let url: string;
  try {
    url = await uploadToS3(
      `nurse-docs/${folder}/${type}-${Date.now()}.${ext}`,
      buffer,
      sniffed.type
    );
  } catch (err) {
    console.error("Nurse document upload to S3 failed:", err);
    return NextResponse.json({ error: "Couldn't upload this file. Please try again." }, { status: 500 });
  }
  const updated = await saveDoc(authUser.id, authUser.name, type, url);
  return NextResponse.json(updated);
});

// DELETE: detach a document/photo slot. Body: { type }
export const DELETE = withErrorLocale(async function DELETE(req: Request) {
  const { authUser, denied } = await authorize();
  if (!authUser) return denied;

  const { type } = await req.json().catch(() => ({}));
  if (typeof type !== "string" || !(type in DOC_FIELD)) {
    return NextResponse.json({ error: "Invalid document type" }, { status: 400 });
  }
  const locked = await lockedResponse(authUser.id, type);
  if (locked) return locked;

  const updated = await saveDoc(authUser.id, authUser.name, type, null);
  return NextResponse.json(updated);
});
