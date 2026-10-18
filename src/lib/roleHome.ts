// Redirect destination after login/verification, by role. Single source of
// truth — this used to be hand-copied into six files and drifted when STAFF
// was added (it only landed in one copy), silently sending staff logins to "/".
export const ROLE_HOME: Record<string, string> = {
  ADMIN: "/admin",
  DOCTOR: "/doctor/dashboard",
  PATIENT: "/patient/dashboard",
  STAFF: "/doctor/dashboard",
  NURSE: "/nurse/dashboard",
};

// A post-auth `?next=` value, if it's a same-site path. Anything else
// ("https://evil.com", "//evil.com", "/\evil.com") is dropped so the login
// and signup redirects can't be turned into an open redirect.
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}
