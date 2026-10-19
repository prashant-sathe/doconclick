import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { JWTPayload } from "@/lib/auth";
import { hasActiveDoctorSubscription } from "@/lib/subscription";

export const SUSPENDED_MESSAGE =
  "Your account has been suspended by the admin. Contact support for assistance.";

export const SUBSCRIPTION_EXPIRED_CODE = "SUBSCRIPTION_EXPIRED";

export type DoctorGuardOptions = {
  /**
   * Also require an active free trial or paid plan (hasActiveDoctorSubscription).
   * For the work a plan pays for — accepting/completing visits, travel,
   * leaves, staff, analytics, settlements. Leave it off for what an expired
   * doctor still needs: loading their profile to renew, cancelling or
   * declining (so patients are refunded/reassigned), chat.
   */
  requireSubscription?: boolean;
};

/**
 * The 403 for doctor `doctorId` — suspended, or (when asked) out of plan —
 * or null. `viewer: "staff"` words the plan message for a receptionist
 * acting on that doctor's behalf.
 */
export async function doctorAccessProblem(
  doctorId: string,
  { requireSubscription = false }: DoctorGuardOptions = {},
  viewer: "doctor" | "staff" = "doctor",
): Promise<NextResponse | null> {
  const profile = await prisma.doctorProfile.findUnique({
    where: { userId: doctorId },
    select: { status: true, trialEndsAt: true, subscriptionPaidUntil: true },
  });
  if (profile?.status === "SUSPENDED") {
    return NextResponse.json({ error: SUSPENDED_MESSAGE, suspended: true }, { status: 403 });
  }
  if (requireSubscription && (!profile || !hasActiveDoctorSubscription(profile))) {
    return NextResponse.json(
      {
        error: viewer === "staff"
          ? "Your doctor's DocOnClick plan has expired, so appointments can't be accepted or completed. Ask them to renew it."
          : "Your DocOnClick plan has expired. Renew it to keep accepting and completing appointments.",
        code: SUBSCRIPTION_EXPIRED_CODE,
      },
      { status: 403 }
    );
  }
  return null;
}

// Call right after the existing `authUser.role !== "DOCTOR"` check in any
// route a doctor uses to do something (accept/cancel appointments, chat,
// prescriptions, travel updates, video calls, profile/clinic edits). Returns
// a ready-to-return 403 response if the doctor is suspended (or, with
// `requireSubscription`, out of plan), otherwise null.
export async function requireActiveDoctor(authUser: JWTPayload, options: DoctorGuardOptions = {}): Promise<NextResponse | null> {
  return doctorAccessProblem(authUser.id, options);
}
