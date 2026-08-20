import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// DELETE: remove a bookmarked doctor
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ doctorId: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { doctorId } = await params;
  await prisma.savedDoctor.deleteMany({
    where: { patientId: authUser.id, doctorId },
  });

  return NextResponse.json({ ok: true });
}
