"use client";
import { useEffect, useState } from "react";
import { Timer } from "lucide-react";

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Live-ticking (or frozen, once `endedAt` is set) elapsed time for a
// consultation — starts counting from the moment the doctor verifies the
// patient's OTP, and stops once the appointment is marked complete.
export default function ConsultationTimer({ startedAt, endedAt }: { startedAt: string; endedAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endedAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [endedAt]);

  const end = endedAt ? new Date(endedAt).getTime() : now;
  const elapsed = end - new Date(startedAt).getTime();
  const isLive = !endedAt;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${isLive ? "text-emerald-600" : "text-slate-500"}`}>
      <Timer className="w-3.5 h-3.5" />
      {isLive ? `Consultation in progress · ${formatElapsed(elapsed)}` : `Consultation duration: ${formatElapsed(elapsed)}`}
    </span>
  );
}
