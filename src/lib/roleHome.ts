// Redirect destination after login/verification, by role. Single source of
// truth — this used to be hand-copied into six files and drifted when STAFF
// was added (it only landed in one copy), silently sending staff logins to "/".
export const ROLE_HOME: Record<string, string> = {
  ADMIN: "/admin",
  DOCTOR: "/doctor/dashboard",
  PATIENT: "/patient/dashboard",
  STAFF: "/doctor/dashboard",
};
