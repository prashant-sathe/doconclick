import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { uploadToS3 } from "@/lib/s3";
import { loadAndAuthorize } from "../route";
import { requireActiveDoctor } from "@/lib/doctorGuard";

const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

// POST: Either party uploads a single file (e.g. a previous medical report)
// to attach to a chat message. Returns the stored URL for a follow-up
// POST to the messages endpoint — mirrors the doctor-dashboard prescription
// upload flow, just scoped to chat and single-file.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (authUser.role === "DOCTOR") {
    const suspendedResponse = await requireActiveDoctor(authUser);
    if (suspendedResponse) return suspendedResponse;
  }

  const { id } = await params;
  const { error } = await loadAndAuthorize(id, authUser.id);
  if (error) return error;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED_TYPES[file.type]) {
    return NextResponse.json({ error: "Only PDF, JPG, or PNG files are allowed" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File must be under 5MB" }, { status: 400 });
  }

  const ext = ALLOWED_TYPES[file.type];
  const filename = `${id}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const url = await uploadToS3(`chat-attachments/${filename}`, buffer, file.type);

  return NextResponse.json({ url, fileName: file.name, fileType: file.type });
}
