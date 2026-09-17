import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { JWTPayload } from "@/lib/auth";
import { SUSPENDED_MESSAGE } from "@/lib/doctorGuard";

// Resolves the doctorId an appointment-queue route should scope its data to:
// the caller's own id for a DOCTOR, or their assigned doctor's id for an
// active STAFF account. Call this in place of the old
// `authUser.role !== "DOCTOR"` + `record.doctorId !== authUser.id` +
// `requireActiveDoctor(authUser)` trio in any route that both DOCTOR and
// STAFF should be able to use.
export async function resolveDoctorScope(
  authUser: JWTPayload
): Promise<{ doctorId: string; denied: null } | { doctorId: null; denied: NextResponse }> {
  if (authUser.role === "DOCTOR") {
    const profile = await prisma.doctorProfile.findUnique({
      where: { userId: authUser.id },
      select: { status: true },
    });
    if (profile?.status === "SUSPENDED") {
      return { doctorId: null, denied: NextResponse.json({ error: SUSPENDED_MESSAGE, suspended: true }, { status: 403 }) };
    }
    return { doctorId: authUser.id, denied: null };
  }

  if (authUser.role === "STAFF") {
    const staffProfile = await prisma.staffProfile.findUnique({
      where: { userId: authUser.id },
      select: { doctorId: true, active: true },
    });
    if (!staffProfile?.active) {
      return { doctorId: null, denied: NextResponse.json({ error: "Your access has been revoked. Contact your doctor." }, { status: 403 }) };
    }
    const doctorProfile = await prisma.doctorProfile.findUnique({
      where: { userId: staffProfile.doctorId },
      select: { status: true },
    });
    if (doctorProfile?.status === "SUSPENDED") {
      return { doctorId: null, denied: NextResponse.json({ error: SUSPENDED_MESSAGE, suspended: true }, { status: 403 }) };
    }
    return { doctorId: staffProfile.doctorId, denied: null };
  }

  return { doctorId: null, denied: NextResponse.json({ error: "Not authorized" }, { status: 403 }) };
}
