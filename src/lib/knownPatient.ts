// Whether a patient is already "this doctor's patient" for the front desk:
// they booked the doctor themselves (and it was accepted or held), or a visit
// with the doctor actually took place. Only then may the desk see the saved
// address, allergies and family members behind a mobile number. A walk-in the
// desk booked itself counts only once it's COMPLETED — otherwise booking and
// cancelling a stranger's number would unlock their profile.

import { prisma } from "@/lib/prisma";

export const knownPatientWhere = (doctorId: string, patientId: string) => ({
  doctorId,
  patientId,
  OR: [
    { bookedById: null, status: { in: ["SCHEDULED", "COMPLETED"] } },
    { status: "COMPLETED" },
  ],
});

export async function isKnownPatient(doctorId: string, patientId: string): Promise<boolean> {
  return (await prisma.appointment.count({ where: knownPatientWhere(doctorId, patientId) })) > 0;
}
