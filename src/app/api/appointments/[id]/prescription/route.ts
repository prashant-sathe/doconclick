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

// POST: Doctor uploads a prescription file for their own appointment
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment || appointment.doctorId !== authUser.id) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const form = await req.formData();
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

  const dir = path.join(process.cwd(), "public", "uploads", "prescriptions");
  await mkdir(dir, { recursive: true });
  const filename = `${id}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);

  const prescriptionUrl = `/uploads/prescriptions/${filename}`;
  const updated = await prisma.appointment.update({
    where: { id },
    data: {
      prescriptionUrl,
      status: appointment.status === "SCHEDULED" ? "COMPLETED" : appointment.status,
      ...(appointment.paymentMethod === "CASH" ? { paymentStatus: "PAID" } : {}),
    },
  });

  return NextResponse.json(updated);
}
