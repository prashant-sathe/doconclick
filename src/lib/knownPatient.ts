// Whether a patient is already "this doctor's patient" for the front desk:
// they booked the doctor themselves and it was accepted or held. Only then
// may the desk see the saved address, allergies and family members behind a
// mobile number. A walk-in the desk booked itself (bookedById set) never
// counts, whatever its status — booking a stranger's number and cancelling it
// (#71), or marking it complete straight away (#83), has no patient consent
// behind it and must not unlock their profile.

import { prisma } from "@/lib/prisma";

export const knownPatientWhere = (doctorId: string, patientId: string) => ({
  doctorId,
  patientId,
  bookedById: null,
  status: { in: ["SCHEDULED", "COMPLETED"] },
});

export async function isKnownPatient(doctorId: string, patientId: string): Promise<boolean> {
  return (await prisma.appointment.count({ where: knownPatientWhere(doctorId, patientId) })) > 0;
}
