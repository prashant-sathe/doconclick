import { prisma } from "@/lib/prisma";

// A scheduled clinic slot is a promise to be there at that exact minute, so
// it's taken by any live booking at that time — including a patient's pending
// request to move their accepted appointment there (requestedScheduledAt).
export async function clinicSlotTaken(params: {
  doctorId: string;
  clinicId: string;
  when: Date;
  excludeAppointmentId?: string;
}): Promise<boolean> {
  const { doctorId, clinicId, when, excludeAppointmentId } = params;
  const clash = await prisma.appointment.findFirst({
    where: {
      doctorId,
      clinicId,
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      OR: [
        { status: { in: ["PENDING_APPROVAL", "SCHEDULED"] }, scheduledAt: when },
        { status: "SCHEDULED", requestedScheduledAt: when },
      ],
    },
    select: { id: true },
  });
  return !!clash;
}
