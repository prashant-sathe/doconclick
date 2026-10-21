import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { uploadToS3 } from "@/lib/s3";
import { verifyUpload } from "@/lib/fileSniff";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

// POST: Admin uploads the mobile-app splash image to S3 and gets back its URL.
// Kept separate from the settings PATCH (same reason as announcement banners)
// so the file lands in S3 before the settings row is updated with the URL.
export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Only JPG, PNG or WebP images are allowed" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File must be under 5MB" }, { status: 400 });
  }

  const filename = `${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  // The bytes decide what this is, not the client-sent MIME type (src/lib/fileSniff.ts).
  const sniffed = verifyUpload(buffer, file.type, Object.keys(ALLOWED_TYPES));
  if ("error" in sniffed) return NextResponse.json({ error: sniffed.error }, { status: 400 });
  const url = await uploadToS3(`app-splash/${filename}`, buffer, sniffed.type);

  return NextResponse.json({ url });
}
