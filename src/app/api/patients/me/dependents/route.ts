import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { RELATIONS } from "@/lib/relations";

// GET: the current patient's saved family-member profiles
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const profile = await prisma.patientProfile.findUnique({ where: { userId: authUser.id } });
  if (!profile) return NextResponse.json([]);

  const dependents = await prisma.patientDependent.findMany({
    where: { patientProfileId: profile.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(dependents);
}

// POST: save a new family member's medical profile
export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { name, relation, age, gender, bloodGroup, height, weight, allergies, chronicDiseases, medications, surgeries, emergencyContactName, emergencyContactPhone } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!RELATIONS.includes(relation) || relation === "Self") {
    return NextResponse.json({ error: "Invalid relation" }, { status: 400 });
  }

  const profile = await prisma.patientProfile.findUnique({ where: { userId: authUser.id } });
  if (!profile) {
    return NextResponse.json({ error: "Complete your own profile first." }, { status: 400 });
  }

  const dependent = await prisma.patientDependent.create({
    data: {
      patientProfileId: profile.id,
      name: name.trim(),
      relation,
      age: age === "" || age == null ? null : Number(age),
      gender: gender || null,
      bloodGroup: bloodGroup || null,
      height: height === "" || height == null ? null : Number(height),
      weight: weight === "" || weight == null ? null : Number(weight),
      allergies: allergies?.trim() ? allergies.trim() : null,
      chronicDiseases: chronicDiseases?.trim() ? chronicDiseases.trim() : null,
      medications: medications?.trim() ? medications.trim() : null,
      surgeries: surgeries?.trim() ? surgeries.trim() : null,
      emergencyContactName: emergencyContactName?.trim() ? emergencyContactName.trim() : null,
      emergencyContactPhone: emergencyContactPhone?.trim() ? emergencyContactPhone.trim() : null,
    },
  });

  return NextResponse.json(dependent);
}
