import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { uploadToS3, deleteFromS3 } from "@/lib/s3";
import { verifyUpload } from "@/lib/fileSniff";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { slugify } from "@/lib/utils";
import { LAB_REPORT_FOLDER, LAB_REPORT_MAX_BYTES, LAB_REPORT_MAX_FILES, LAB_REPORT_TYPES } from "@/lib/labBookings";

// POST (multipart, one or more `file`): the admin uploads the lab report.
// Each file is checked by its bytes, stored in S3, attached to the booking
// and filed in the patient's records vault ("Lab Report"). The booking is
// marked COMPLETED and the patient is told the report is ready.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authUser, denied } = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const booking = await prisma.labBooking.findUnique({ where: { id }, include: { items: true, _count: { select: { reports: true } } } });
  if (!booking) return NextResponse.json({ error: "Lab booking not found" }, { status: 404 });
  if (booking.status === "CANCELLED") return NextResponse.json({ error: "This booking was cancelled and can't be changed." }, { status: 409 });
  if (booking.status === "PENDING_PAYMENT") return NextResponse.json({ error: "This booking is waiting for the patient's payment." }, { status: 409 });

  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("file") ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return NextResponse.json({ error: "Choose the report file to upload." }, { status: 400 });
  if (booking._count.reports + files.length > LAB_REPORT_MAX_FILES) {
    return NextResponse.json({ error: `A booking can have at most ${LAB_REPORT_MAX_FILES} report files.` }, { status: 400 });
  }

  // Check every file before uploading any, so one bad file doesn't leave the rest half-saved.
  const checked: { name: string; buffer: Buffer; type: string; ext: string }[] = [];
  for (const f of files) {
    if (f.size > LAB_REPORT_MAX_BYTES) return NextResponse.json({ error: `"${f.name}" is over 10 MB.` }, { status: 400 });
    const buffer = Buffer.from(await f.arrayBuffer());
    const sniffed = verifyUpload(buffer, f.type, Object.keys(LAB_REPORT_TYPES));
    if ("error" in sniffed) return NextResponse.json({ error: `${f.name}: ${sniffed.error}` }, { status: 400 });
    checked.push({ name: f.name || `report.${sniffed.ext}`, buffer, type: sniffed.type, ext: sniffed.ext });
  }

  const uploaded: string[] = [];
  try {
    for (const [i, f] of checked.entries()) {
      uploaded.push(await uploadToS3(`${LAB_REPORT_FOLDER}/${booking.patientId}/${booking.id}/${Date.now()}-${i}-${slugify(f.name.replace(/\.[^.]+$/, "")) || "report"}.${f.ext}`, f.buffer, f.type));
    }
  } catch (err) {
    console.error("Lab report upload failed", booking.id, err);
    await Promise.all(uploaded.map((u) => deleteFromS3(u, LAB_REPORT_FOLDER)));
    return NextResponse.json({ error: "Couldn't upload the report. Please try again." }, { status: 502 });
  }

  const testNames = booking.items.map((i) => i.name).join(", ");
  const title = `Lab report — ${testNames}`.slice(0, 150);
  try {
    await prisma.$transaction(async (tx) => {
      for (const [i, url] of uploaded.entries()) {
        const doc = await tx.patientDocument.create({
          data: { patientId: booking.patientId, title: checked.length > 1 ? `${title} (${i + 1})`.slice(0, 160) : title, category: "Lab Report", fileUrl: url, fileName: checked[i].name },
        });
        await tx.labReport.create({ data: { bookingId: booking.id, fileUrl: url, fileName: checked[i].name, documentId: doc.id, uploadedById: authUser.id } });
      }
      // Guarded: a booking cancelled meanwhile isn't revived.
      const done = await tx.labBooking.updateMany({ where: { id: booking.id, status: { notIn: ["CANCELLED", "PENDING_PAYMENT"] } }, data: { status: "COMPLETED" } });
      if (done.count === 0) throw new Error("CANCELLED_MEANWHILE");
    });
  } catch (err) {
    await Promise.all(uploaded.map((u) => deleteFromS3(u, LAB_REPORT_FOLDER)));
    if (err instanceof Error && err.message === "CANCELLED_MEANWHILE") {
      return NextResponse.json({ error: "This booking was cancelled and can't be changed." }, { status: 409 });
    }
    throw err;
  }

  void sendPushToUser(booking.patientId, { key: "labReportReady", url: "/patient/lab-tests" });
  const full = await prisma.labBooking.findUnique({
    where: { id },
    include: {
      items: true,
      reports: { orderBy: { createdAt: "asc" } },
      patient: { select: { id: true, name: true, mobile: true } },
      appointment: { select: { id: true, scheduledAt: true, doctor: { select: { name: true } } } },
    },
  });
  return NextResponse.json(full);
}
