"use client";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

// Segment-level error boundary — catches render/data errors on any page while
// keeping the root layout. The root layout itself falls back to global-error.tsx.
export default function Error({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const retry = unstable_retry ?? reset ?? (() => window.location.reload());

  return (
    <div className="min-h-screen gradient-surface flex flex-col items-center justify-center text-center px-6 py-16">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mb-5">
        <AlertTriangle className="w-8 h-8 text-amber-500" />
      </div>
      <h1 className="text-xl font-bold text-slate-900">Something went wrong</h1>
      <p className="text-sm text-slate-500 mt-2 max-w-xs">
        This screen ran into a problem. Try again, or head back and retry in a moment.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 mt-6">
        <button onClick={() => retry()} className="btn-primary px-6 py-3 justify-center">
          Try again
        </button>
        <button
          onClick={() => { window.location.href = "/"; }}
          className="btn-secondary px-6 py-3 justify-center"
        >
          Go to start
        </button>
      </div>
    </div>
  );
}
