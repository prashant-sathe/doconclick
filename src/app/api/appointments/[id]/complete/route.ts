import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { doctorAccessProblem } from "@/lib/doctorGuard";
import { sendPushToUser } from "@/lib/firebaseAdmin";
import { referralPushCopy } from "@/lib/nurseReferral";
import { LIVE_LOCATION_CLEARED } from "@/lib/appointmentView";
import { formatDoctorName } from "@/lib/utils";
import {
  completionProblem, COMPLETABLE_WHERE, normalizePrescription, replacePrescription,
  checkPrescriptionFiles, uploadPrescriptionFiles, discardPrescriptionFiles, parseReferral, NOTES_MAX, badRequest,
  type ReferralInput,
} from "@/lib/consultation";

class LostRaceError extends Error {}

// POST — close a doctor's consultation in one go: notes, medicines + tests,
// files and a nurse referral are saved and the status set to COMPLETED
// together, or nothing changes. Replaces the dashboard's four separate calls,
// where a refused final step (unpaid, not arrived) left a prescription saved
// on a still-open visit.
//
// Body: multipart/form-data with a `data` field (JSON) and any number of
// `file` parts — or plain JSON when there are no files:
//   { doctorNotes?, medicines?, tests?, nurseReferral?: { serviceId, visits, intervalDays, instructions } | null }
// medicines/tests, when sent, replace the current lists (kept as a version).
//
// Everything is validated first; files are uploaded before the transaction
// (S3 can't take part in it) and deleted again if it fails. The status change
// is a conditional update carrying every completion guard, so a payment
// refund, cancel or second tap landing at the same moment can't slip through.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (authUser.role === "STAFF") return NextResponse.json({ error: "Only the doctor can mark a visit complete." }, { status: 403 });
  if (authUser.role !== "DOCTOR") return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  // Completing is what a plan pays for (same as the PATCH route).
  const denied = await doctorAccessProblem(authUser.id, { requireSubscription: true });
  if (denied) return denied;

  const { id } = await params;
  const appt = await prisma.appointment.findUnique({ where: { id } });
  if (!appt || appt.doctorId !== authUser.id || appt.providerType !== "DOCTOR") {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  const problem = completionProblem(appt);
  if (problem) return NextResponse.json({ error: problem.error, code: problem.code }, { status: problem.status });

  // ── Read and validate everything before touching anything ──
  let data: Record<string, unknown>;
  let files: File[] = [];
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return badRequest("Invalid form data.");
    try {
      data = JSON.parse(String(form.get("data") ?? "{}"));
    } catch {
      return badRequest("Invalid request body.");
    }
    files = form.getAll("file").filter((f): f is File => f instanceof File);
  } else {
    data = await req.json().catch(() => null);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return badRequest("Invalid request body.");

  if (data.doctorNotes !== undefined && data.doctorNotes !== null && typeof data.doctorNotes !== "string") return badRequest("Notes must be text.");
  const notes = typeof data.doctorNotes === "string" ? data.doctorNotes.trim() : null;
  if (notes && notes.length > NOTES_MAX) return badRequest(`Keep the notes under ${NOTES_MAX} characters.`);

  const replaceItems = data.medicines !== undefined || data.tests !== undefined;
  const items = normalizePrescription(data.medicines, data.tests);
  if ("error" in items) return badRequest(items.error);

  let referral: ReferralInput | null = null;
  if (data.nurseReferral != null) {
    if (typeof data.nurseReferral !== "object") return badRequest("Invalid nurse referral.");
    const parsed = await parseReferral(data.nurseReferral as Record<string, unknown>);
    if ("error" in parsed) return badRequest(parsed.error, "INVALID_REFERRAL");
    referral = parsed;
  }

  const checked = await checkPrescriptionFiles(files);
  if ("error" in checked) return badRequest(checked.error, "INVALID_FILE");

  // ── Write ──
  let uploaded: { url: string; fileName: string }[] = [];
  try {
    uploaded = await uploadPrescriptionFiles(id, checked.files);
  } catch (err) {
    console.error("Prescription upload failed for", id, err);
    return NextResponse.json({ error: "Couldn't upload the attachments. Please try again." }, { status: 502 });
  }

  let completed;
  try {
    completed = await prisma.$transaction(async (tx) => {
      // The claim comes first: it holds the row, and only one request wins it.
      const { count } = await tx.appointment.updateMany({
        where: { id, doctorId: authUser.id, ...COMPLETABLE_WHERE, paymentMethod: appt.paymentMethod },
        data: {
          status: "COMPLETED",
          // Starts the prescription edit window (src/lib/prescriptionLock.ts).
          completedAt: new Date(),
          requestedScheduledAt: null,
          ...(notes !== null ? { doctorNotes: notes || null } : {}),
          ...LIVE_LOCATION_CLEARED,
          // Cash is collected at the visit, so completing it is when it was paid.
          ...(appt.paymentMethod === "CASH" ? { paymentStatus: "PAID", paidAt: appt.paidAt ?? new Date() } : {}),
        },
      });
      if (count === 0) throw new LostRaceError();
      if (replaceItems) await replacePrescription(tx, { appointmentId: id, editedById: authUser.id, ...items });
      if (uploaded.length) {
        await tx.prescriptionAttachment.createMany({ data: uploaded.map((u) => ({ appointmentId: id, url: u.url, fileName: u.fileName })) });
      }
      if (referral) {
        const { serviceId, visits, intervalDays, instructions } = referral;
        await tx.nurseReferral.upsert({
          where: { appointmentId: id },
          create: { appointmentId: id, serviceId, visits, intervalDays, instructions },
          update: { serviceId, visits, intervalDays, instructions },
        });
      }
      return tx.appointment.findUniqueOrThrow({
        where: { id },
        omit: { visitOtp: true },
        include: { medicines: true, tests: true, attachments: true, referralGiven: { select: { id: true, service: { select: { name: true } } } } },
      });
    }, { timeout: 30_000 });
  } catch (err) {
    await discardPrescriptionFiles(uploaded);
    if (err instanceof LostRaceError) {
      // Something changed since we looked — say what, from the row as it is now.
      const now = await prisma.appointment.findUnique({ where: { id } });
      const why = now ? completionProblem(now) : null;
      return NextResponse.json(
        { error: why?.error ?? "This consultation just changed. Please refresh and try again.", code: why?.code ?? "CHANGED" },
        { status: 409 }
      );
    }
    throw err;
  }

  const doctorName = formatDoctorName(authUser.name);
  void sendPushToUser(appt.patientId, { key: "apptCompleted", values: { doctor: doctorName }, url: "/patient/appointments" });
  // Nurse care recommended here is bookable from now on (src/lib/nurseReferral.ts).
  const referralName = completed.referralGiven?.service.name;
  if (referralName) void sendPushToUser(appt.patientId, referralPushCopy(authUser.name, referralName));

  return NextResponse.json(completed);
}
