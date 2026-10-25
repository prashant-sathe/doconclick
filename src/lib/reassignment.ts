import type { Appointment, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { findReassignmentCandidates, type ReassignmentCandidate } from "@/lib/doctorMatching";
import { doctorSlotProblem, isTimedBooking, isSlotIndexViolation } from "@/lib/doctorSlots";
import { commissionPercentForConsultType } from "@/lib/platformFee";
import { cancelAndRefund } from "@/lib/appointmentCancel";
import { copyVisitSnapshot } from "@/lib/visitAddress";

// The nearest other doctor who can take over a doctor's appointment — same
// specialty and consult type, working at its time (clinic hours/leave or
// their available hours), and with nothing else booked then — with the fee
// they'd charge. Null when there's nobody.
async function findReplacement(appointment: Appointment) {
  const doctorProfile = await prisma.doctorProfile.findUnique({
    where: { userId: appointment.doctorId },
    select: { specialty: true },
  });
  if (!doctorProfile) return null;
  const timed = isTimedBooking(appointment);
  const candidates = await findReassignmentCandidates({
    excludeDoctorId: appointment.doctorId,
    specialty: doctorProfile.specialty,
    consultType: appointment.consultType,
    patientId: appointment.patientId,
    // A home visit goes where it was booked to, not the current profile address.
    visitLocation: appointment.visitLat != null && appointment.visitLng != null
      ? { lat: appointment.visitLat, lng: appointment.visitLng }
      : undefined,
    // A booking for a chosen time keeps that time; "book now" needs someone now.
    when: timed ? appointment.scheduledAt : new Date(),
  });
  // The replacement inherits the slot, so they must actually be free then —
  // try the next-nearest rather than giving up on the first clash.
  let match: ReassignmentCandidate | null = null;
  for (const c of candidates) {
    if (timed && await doctorSlotProblem({ doctorId: c.id, when: appointment.scheduledAt, against: "live", viewer: "doctor" })) continue;
    match = c;
    break;
  }
  if (!match) return null;
  const settings = await prisma.platformSettings.findFirst();
  const commission = commissionPercentForConsultType(settings, appointment.consultType);
  return { candidate: match, amount: match.fee, platformFee: (match.fee * commission) / 100 };
}

// Cancels a doctor's appointment and, where another doctor is free, books the
// patient with them in its place (a new PENDING_APPROVAL request, linked by
// reassignedFromId). Any payment already collected can't carry over — the
// new appointment starts unpaid — so it's credited to the patient's wallet.
// Used when a doctor cancels on a patient and when an admin suspends or
// removes a doctor, or reassigns one booking from /admin/bookings. Throws AppointmentAlreadyClosedError if it's no longer live.
export async function cancelAndReassign(
  appointment: Appointment,
  { data, note, adminId }: { data?: Prisma.AppointmentUpdateManyMutationInput; note: string; adminId?: string }
): Promise<{
  cancelled: Appointment;
  wasPaid: boolean;
  refund: number;
  reassigned: Appointment | null;
  candidate: ReassignmentCandidate | null;
}> {
  // A walk-in the provider's own desk booked never goes to another doctor
  // (the patient is at that clinic, and the replacement would get the
  // patient's history without their consent) — cancel and refund only.
  const replacement = appointment.bookedById ? null : await findReplacement(appointment);
  const run = (withReplacement: typeof replacement) =>
    prisma.$transaction(async (tx) => {
      const { cancelled, wasPaid, refund } = await cancelAndRefund(tx, appointment.id, {
        data,
        refundType: "REASSIGNMENT_CREDIT",
        note,
        adminId,
      });
      const reassigned = withReplacement
        ? await tx.appointment.create({
            data: {
              patientId: appointment.patientId,
              doctorId: withReplacement.candidate.id,
              symptoms: appointment.symptoms,
              patientName: appointment.patientName,
              relation: appointment.relation,
              allergies: appointment.allergies,
              dependentId: appointment.dependentId ?? undefined,
              consentGiven: appointment.consentGiven,
              consultType: appointment.consultType,
              amount: withReplacement.amount,
              platformFee: withReplacement.platformFee,
              status: "PENDING_APPROVAL",
              paymentMethod: appointment.paymentMethod,
              paymentStatus: "PENDING",
              clinicId: withReplacement.candidate.clinicId ?? undefined,
              scheduledAt: appointment.scheduledAt,
              ...copyVisitSnapshot(appointment),
              reassignedFromId: appointment.id,
            },
          })
        : null;
      return { cancelled, wasPaid, refund, reassigned, candidate: withReplacement?.candidate ?? null };
    });

  try {
    return await run(replacement);
  } catch (err) {
    // Someone took the replacement's slot in the meantime (e.g. another
    // reassignment in the same admin sweep) — still cancel and refund.
    if (replacement && isSlotIndexViolation(err)) return run(null);
    throw err;
  }
}
