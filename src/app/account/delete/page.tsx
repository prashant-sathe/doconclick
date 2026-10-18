import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";

export const metadata = {
  title: "Delete Your Account | DocOnClick",
  robots: { index: false },
};

const SECURITY_PAGE: Record<string, string> = {
  PATIENT: "/patient/profile/security",
  DOCTOR: "/doctor/profile/security",
  NURSE: "/nurse/security",
};

// Stable "delete your account" link for /data-deletion and app-store
// listings: sends a signed-in user to their own Password & Security screen,
// where the Delete my account control lives, and anyone else to sign in first.
export default async function AccountDeletePage() {
  const user = await getAuthUser();
  if (!user) redirect("/login?next=/account/delete");
  redirect(SECURITY_PAGE[user.role] ?? "/data-deletion");
}
