import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { JWTPayload } from "@/lib/auth";

export const SUSPENDED_MESSAGE =
  "Your account has been suspended by the admin. Contact support for assistance.";

// Call right after the existing `authUser.role !== "DOCTOR"` check in any
// route a doctor uses to do something (accept/cancel appointments, chat,
// prescriptions, travel updates, video calls, profile/clinic edits). Returns
// a ready-to-return 403 response if the doctor is suspended, otherwise null.
export async function requireActiveDoctor(authUser: JWTPayload): Promise<NextResponse | null> {
  const profile = await prisma.doctorProfile.findUnique({
    where: { userId: authUser.id },
    select: { status: true },
  });
  if (profile?.status === "SUSPENDED") {
    return NextResponse.json({ error: SUSPENDED_MESSAGE, suspended: true }, { status: 403 });
  }
  return null;
}
