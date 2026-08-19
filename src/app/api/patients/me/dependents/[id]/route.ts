import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// PATCH: update a saved family-member profile
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const dependent = await prisma.patientDependent.findUnique({
    where: { id },
    include: { patientProfile: { select: { userId: true } } },
  });
  if (!dependent || dependent.patientProfile.userId !== authUser.id) {
    return NextResponse.json({ error: "Family member not found" }, { status: 404 });
  }

  const body = await req.json();
  const { name, age, gender, bloodGroup, height, weight, allergies, chronicDiseases, medications, surgeries, emergencyContactName, emergencyContactPhone } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const updated = await prisma.patientDependent.update({
    where: { id },
    data: {
      name: name.trim(),
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

  return NextResponse.json(updated);
}

// DELETE: remove a saved family-member profile. Any past appointments keep
// their own patientName/relation snapshot and just lose the dependentId
// link (schema default SetNull), so history isn't affected.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const dependent = await prisma.patientDependent.findUnique({
    where: { id },
    include: { patientProfile: { select: { userId: true } } },
  });
  if (!dependent || dependent.patientProfile.userId !== authUser.id) {
    return NextResponse.json({ error: "Family member not found" }, { status: 404 });
  }

  await prisma.patientDependent.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
