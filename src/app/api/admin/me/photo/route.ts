import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { uploadToS3 } from "@/lib/s3";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

// POST: admin uploads/replaces their own profile photo.
export async function POST(req: Request) {
  const { authUser, denied } = await requireAdmin();
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
  const url = await uploadToS3(`admin-photos/${filename}`, buffer, file.type);

  const updated = await prisma.user.update({
    where: { id: authUser.id },
    data: { photoUrl: url },
    select: { photoUrl: true },
  });
  return NextResponse.json(updated);
}

// DELETE: clears the admin's profile photo.
export async function DELETE() {
  const { authUser, denied } = await requireAdmin();
  if (denied) return denied;

  const updated = await prisma.user.update({
    where: { id: authUser.id },
    data: { photoUrl: null },
    select: { photoUrl: true },
  });
  return NextResponse.json(updated);
}
