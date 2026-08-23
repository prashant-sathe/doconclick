// Hardcoded rather than a NEXT_PUBLIC_ env var: those get baked in at Docker
// *build* time, not container runtime, so env_file: .env.production can't
// change it anyway (see the GA_MEASUREMENT_ID note in app/layout.tsx).
export const SITE_URL = "https://doconclick.co.in";
export const SITE_NAME = "DocOnClick";
export const SITE_DESCRIPTION =
  "Book verified doctors near you for clinic visits, home visits, or video consultations — instantly, on DocOnClick.";
