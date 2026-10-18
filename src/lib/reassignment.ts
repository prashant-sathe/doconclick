import type { Appointment, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { findReassignmentDoctor, type ReassignmentCandidate } from "@/lib/doctorMatching";
import { doctorSlotProblem, isTimedBooking, isSlotIndexViolation } from "@/lib/doctorSlots";
import { commissionPercentForConsultType } from "@/lib/platformFee";
import { cancelAndRefund } from "@/lib/appointmentCancel";

// The nearest other doctor who can take over a doctor's appointment — same
// specialty and consult type, and actually free at its time — with the fee
// they'd charge. Null when there's nobody.
async function findReplacement(appointment: Appointment) {
  const doctorProfile = await prisma.doctorProfile.findUnique({
    where: { userId: appointment.doctorId },
    select: { specialty: true },
  });
  if (!doctorProfile) return null;
  const match = await findReassignmentDoctor({
    excludeDoctorId: appointment.doctorId,
    specialty: doctorProfile.specialty,
    consultType: appointment.consultType,
    patientId: appointment.patientId,
  });
  if (!match) return null;
  // The replacement inherits the slot, so they must actually be free then.
  if (isTimedBooking(appointment)
    && await doctorSlotProblem({ doctorId: match.id, when: appointment.scheduledAt, against: "live", viewer: "doctor" })) {
    return null;
  }
  const settings = await prisma.platformSettings.findFirst();
  const commission = commissionPercentForConsultType(settings, appointment.consultType);
  return { candidate: match, amount: match.fee, platformFee: (match.fee * commission) / 100 };
}

// Cancels a doctor's appointment and, where another doctor is free, books the
// patient with them in its place (a new PENDING_APPROVAL request, linked by
// reassignedFromId). Any payment already collected can't carry over — the
// new appointment starts unpaid — so it's credited to the patient's wallet.
// Used when a doctor cancels on a patient and when an admin suspends or
// removes a doctor. Throws AppointmentAlreadyClosedError if it's no longer live.
export async function cancelAndReassign(
  appointment: Appointment,
  { data, note }: { data?: Prisma.AppointmentUpdateManyMutationInput; note: string }
): Promise<{
  cancelled: Appointment;
  wasPaid: boolean;
  refund: number;
  reassigned: Appointment | null;
  candidate: ReassignmentCandidate | null;
}> {
  const replacement = await findReplacement(appointment);
  const run = (withReplacement: typeof replacement) =>
    prisma.$transaction(async (tx) => {
      const { cancelled, wasPaid, refund } = await cancelAndRefund(tx, appointment.id, {
        data,
        refundType: "REASSIGNMENT_CREDIT",
        note,
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
