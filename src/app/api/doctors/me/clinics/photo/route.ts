import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { uploadToS3 } from "@/lib/s3";
import { verifyUpload } from "@/lib/fileSniff";
import { requireActiveDoctor } from "@/lib/doctorGuard";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

// POST: Uploads a clinic photo and returns its URL. Doesn't write to any DB
// row itself — the client attaches the returned URL to the clinic's
// create/update payload, since a clinic may not exist yet (new clinic being
// added) or already have its own dedicated PATCH endpoint.
export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const suspendedResponse = await requireActiveDoctor(authUser);
  if (suspendedResponse) return suspendedResponse;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Only JPG or PNG files are allowed" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File must be under 5MB" }, { status: 400 });
  }

  const filename = `${authUser.id}-clinic-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  // The bytes decide what this is, not the client-sent MIME type (src/lib/fileSniff.ts).
  const sniffed = verifyUpload(buffer, file.type, Object.keys(ALLOWED_TYPES));
  if ("error" in sniffed) return NextResponse.json({ error: sniffed.error }, { status: 400 });
  const url = await uploadToS3(`doctor-docs/${filename}`, buffer, sniffed.type);
  return NextResponse.json({ url });
}
