type Props = {
  role?: "PATIENT" | "DOCTOR";
  next?: string;
  label?: string;
};

export default function GoogleSignInButton({ role = "PATIENT", next, label = "Continue with Google" }: Props) {
  const params = new URLSearchParams({ role });
  if (next) params.set("next", next);

  return (
    <a
      href={`/api/auth/google/start?${params.toString()}`}
      className="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-colors"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.58-5.05-3.71H.99v2.33A9 9 0 0 0 9 18Z" />
        <path fill="#FBBC05" d="M3.95 10.71A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.71V4.96H.99A9 9 0 0 0 0 9c0 1.45.35 2.83.99 4.04l2.96-2.33Z" />
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .99 4.96l2.96 2.33C4.66 5.16 6.65 3.58 9 3.58Z" />
      </svg>
      {label}
    </a>
  );
}
