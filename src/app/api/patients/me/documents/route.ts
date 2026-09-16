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
const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const CATEGORIES = ["Lab Report", "Prescription", "Scan/X-ray", "Vaccination", "Discharge Summary", "Other"];

// GET: this patient's health-records vault, newest first.
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const documents = await prisma.patientDocument.findMany({
    where: { patientId: authUser.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(documents);
}

// POST: upload one document into the vault (title + category + file).
export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const form = await req.formData();
  const title = form.get("title");
  const category = form.get("category");
  const file = form.get("file");

  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "Please give the document a title." }, { status: 400 });
  }
  const resolvedCategory = typeof category === "string" && CATEGORIES.includes(category) ? category : "Other";
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

  try {
    const folder = `${slugify(authUser.name)}-${authUser.id}`;
    const filename = `${Date.now()}-${slugify(title.trim())}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadToS3(`patient-documents/${folder}/${filename}`, buffer, file.type);

    const created = await prisma.patientDocument.create({
      data: {
        patientId: authUser.id,
        title: title.trim(),
        category: resolvedCategory,
        fileUrl: url,
        fileName: file.name || null,
      },
    });
    return NextResponse.json(created);
  } catch (err) {
    console.error("Failed to upload patient document:", err);
    return NextResponse.json({ error: "Couldn't upload this document. Please try again." }, { status: 500 });
  }
}
