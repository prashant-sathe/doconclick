import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserAny } from "@/lib/auth";

interface MedicineInput {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
}

// POST: Doctor replaces the medicine list for their own appointment
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUserAny(req);
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment || appointment.doctorId !== authUser.id) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (appointment.consultType === "HOME" && appointment.travelStatus !== "ARRIVED") {
    return NextResponse.json(
      { error: "Mark your journey as arrived before adding a prescription for this home visit." },
      { status: 400 }
    );
  }
  if (!appointment.otpVerifiedAt) {
    return NextResponse.json(
      { error: "Verify the patient's OTP before adding a prescription." },
      { status: 400 }
    );
  }

  const { medicines } = await req.json();
  if (!Array.isArray(medicines)) {
    return NextResponse.json({ error: "medicines must be an array" }, { status: 400 });
  }

  const valid: MedicineInput[] = medicines.filter(
    (m): m is MedicineInput => m && typeof m.name === "string" && m.name.trim().length > 0
  );

  await prisma.$transaction([
    prisma.prescriptionMedicine.deleteMany({ where: { appointmentId: id } }),
    ...valid.map((m) =>
      prisma.prescriptionMedicine.create({
        data: {
          appointmentId: id,
          name: m.name,
          dosage: m.dosage || "",
          frequency: m.frequency || "",
          duration: m.duration || "",
          instructions: m.instructions || null,
        },
      })
    ),
  ]);

  const result = await prisma.prescriptionMedicine.findMany({ where: { appointmentId: id } });
  return NextResponse.json(result);
}
