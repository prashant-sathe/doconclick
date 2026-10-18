import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { sessionPayload, type JWTPayload } from "@/lib/auth";
import type { OAuthRole, OAuthIntent } from "@/lib/googleOAuth";
import { ROLE_HOME, safeNext } from "@/lib/roleHome";

/**
 * Shared "a Google identity signed in — find or create the account and decide
 * where to send them" logic. Used by both the web OAuth callback
 * (code-exchange flow) and the native endpoint (ID-token flow), so the two
 * entry points can't drift apart.
 */
export async function resolveGoogleUser(params: {
  email: string;
  name?: string | null;
  role: OAuthRole;
  intent: OAuthIntent;
  next?: string;
}): Promise<{ payload: JWTPayload; destination: string } | { error: string }> {
  const { email, name, role, intent, next } = params;

  let user = await prisma.user.findUnique({ where: { email } });

  if (!user && intent === "reset") {
    // Forgot-password flow: never create an account here — if no existing
    // account uses this Google email, this reset method just isn't available.
    return { error: "google_no_account" };
  }

  if (!user) {
    user = await prisma.user.create({
      data: {
        name: name || email.split("@")[0],
        email,
        mobile: `pending_${randomUUID()}`,
        password: "",
        role,
        ...(role === "DOCTOR"
          ? { doctorProfile: { create: { status: "PENDING" } } }
          : role === "NURSE"
            ? { nurseProfile: { create: { status: "PENDING" } } }
            : { patientProfile: { create: { age: 0, gender: "" } } }),
      },
    });
  }

  const payload: JWTPayload = sessionPayload(user);

  const safe = safeNext(next);
  const destination =
    intent === "reset"
      ? "/reset-password"
      : user.mobile.startsWith("pending_")
        ? safe ? `/complete-profile?next=${encodeURIComponent(safe)}` : "/complete-profile"
        : safe || ROLE_HOME[user.role] || "/";

  return { payload, destination };
}
