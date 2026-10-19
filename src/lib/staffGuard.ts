import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { JWTPayload } from "@/lib/auth";
import { doctorAccessProblem, type DoctorGuardOptions } from "@/lib/doctorGuard";

// Resolves the doctorId an appointment-queue route should scope its data to:
// the caller's own id for a DOCTOR, or their assigned doctor's id for an
// active STAFF account. Call this in place of the old
// `authUser.role !== "DOCTOR"` + `record.doctorId !== authUser.id` +
// `requireActiveDoctor(authUser)` trio in any route that both DOCTOR and
// STAFF should be able to use. `requireSubscription` checks the *scoped*
// doctor's plan — staff act on their doctor's behalf, so an expired doctor
// can't keep working through a receptionist account.
export async function resolveDoctorScope(
  authUser: JWTPayload,
  options: DoctorGuardOptions = {}
): Promise<{ doctorId: string; denied: null } | { doctorId: null; denied: NextResponse }> {
  if (authUser.role === "DOCTOR") {
    const denied = await doctorAccessProblem(authUser.id, options);
    if (denied) return { doctorId: null, denied };
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
    const denied = await doctorAccessProblem(staffProfile.doctorId, options, "staff");
    if (denied) return { doctorId: null, denied };
    return { doctorId: staffProfile.doctorId, denied: null };
  }

  return { doctorId: null, denied: NextResponse.json({ error: "Not authorized" }, { status: 403 }) };
}
