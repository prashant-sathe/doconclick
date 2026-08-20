import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// GET: the current patient's bookmarked doctors
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const saved = await prisma.savedDoctor.findMany({
    where: { patientId: authUser.id },
    orderBy: { createdAt: "desc" },
    include: {
      doctor: {
        select: {
          id: true,
          name: true,
          doctorProfile: {
            select: {
              specialty: true,
              photoUrl: true,
              clinicName: true,
              qualification: true,
              experience: true,
              consultFee: true,
              avgRating: true,
              totalReviews: true,
              status: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json(saved.map((s) => ({ id: s.id, createdAt: s.createdAt, doctor: s.doctor })));
}

// POST: bookmark a doctor for later booking
export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { doctorId } = await req.json();
  if (!doctorId || typeof doctorId !== "string") {
    return NextResponse.json({ error: "doctorId is required" }, { status: 400 });
  }

  const doctor = await prisma.user.findUnique({ where: { id: doctorId } });
  if (!doctor || doctor.role !== "DOCTOR") {
    return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  }

  try {
    const saved = await prisma.savedDoctor.create({
      data: { patientId: authUser.id, doctorId },
    });
    return NextResponse.json(saved);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ ok: true, alreadySaved: true });
    }
    throw err;
  }
}
