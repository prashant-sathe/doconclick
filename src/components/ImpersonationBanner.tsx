"use client";
import { useEffect, useRef, useState } from "react";
import { LogOut, Loader2 } from "lucide-react";

export function ImpersonationBanner({
  adminName,
  onExit,
}: {
  adminName: string;
  onExit: () => Promise<void>;
}) {
  const [exiting, setExiting] = useState(false);
  const [error, setError] = useState("");
  const barRef = useRef<HTMLDivElement>(null);

  // Publish the banner's real (possibly wrapped, mobile-width) height as a CSS
  // variable so fixed/sticky elements elsewhere (admin sidebar, doctor/patient
  // headers) can offset themselves instead of being covered by it.
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const setHeight = () => {
      document.documentElement.style.setProperty("--imp-banner-h", `${el.offsetHeight}px`);
    };
    setHeight();
    const observer = new ResizeObserver(setHeight);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.setProperty("--imp-banner-h", "0px");
    };
  }, []);

  const handleExit = async () => {
    setError("");
    setExiting(true);
    try {
      await onExit();
    } catch {
      setError("Could not exit impersonation. Try again.");
      setExiting(false);
    }
  };

  return (
    <div
      ref={barRef}
      className="fixed top-0 inset-x-0 z-[95] bg-amber-500 text-amber-950 px-4 py-2 flex flex-wrap items-center justify-center gap-3 text-sm font-semibold shadow-md"
    >
      <span>
        Viewing as this account — logged in as admin <strong>{adminName}</strong>
      </span>
      {error && <span className="text-red-900 font-normal">{error}</span>}
      <button
        type="button"
        onClick={handleExit}
        disabled={exiting}
        className="flex items-center gap-1.5 bg-amber-950/10 hover:bg-amber-950/20 rounded-lg px-3 py-1 transition-colors disabled:opacity-60"
      >
        {exiting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
        Exit impersonation
      </button>
    </div>
  );
}
