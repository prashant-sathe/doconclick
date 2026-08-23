import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

interface MedicineInput {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
}

interface TestInput {
  name: string;
  instructions?: string;
}

// POST: Doctor replaces the medicine list for their own appointment
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

  const { medicines, tests } = await req.json();
  if (!Array.isArray(medicines)) {
    return NextResponse.json({ error: "medicines must be an array" }, { status: 400 });
  }
  if (tests !== undefined && !Array.isArray(tests)) {
    return NextResponse.json({ error: "tests must be an array" }, { status: 400 });
  }

  const validMedicines: MedicineInput[] = medicines.filter(
    (m): m is MedicineInput => m && typeof m.name === "string" && m.name.trim().length > 0
  );
  const validTests: TestInput[] = (tests ?? []).filter(
    (t: TestInput): t is TestInput => t && typeof t.name === "string" && t.name.trim().length > 0
  );

  await prisma.$transaction([
    prisma.prescriptionMedicine.deleteMany({ where: { appointmentId: id } }),
    ...validMedicines.map((m) =>
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
    prisma.prescriptionTest.deleteMany({ where: { appointmentId: id } }),
    ...validTests.map((t) =>
      prisma.prescriptionTest.create({
        data: {
          appointmentId: id,
          name: t.name,
          instructions: t.instructions || null,
        },
      })
    ),
  ]);

  const [resultMedicines, resultTests] = await Promise.all([
    prisma.prescriptionMedicine.findMany({ where: { appointmentId: id } }),
    prisma.prescriptionTest.findMany({ where: { appointmentId: id } }),
  ]);
  return NextResponse.json({ medicines: resultMedicines, tests: resultTests });
}
