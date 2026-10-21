"use client";
import { useState } from "react";
import { CalendarClock, CheckCircle2, Loader2 } from "lucide-react";

// Provider-side answer to a patient's request to move an accepted
// appointment. The booking stays at its current time until "Accept new time";
// "Keep original" just drops the request. Shared by the doctor and nurse
// dashboards.
export default function RescheduleRequestBox({ appointmentId, requestedAt, onDone }: {
  appointmentId: string;
  requestedAt: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<"ACCEPT" | "DECLINE" | null>(null);
  const [error, setError] = useState("");

  const answer = async (reschedule: "ACCEPT" | "DECLINE") => {
    setBusy(reschedule);
    setError("");
    try {
      const res = await fetch(`/api/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reschedule }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? "Could not answer this request.");
        return;
      }
      onDone();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
      <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
        <CalendarClock className="w-3.5 h-3.5 flex-shrink-0" />
        Patient asked to move this to {new Date(requestedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}
      </p>
      <div className="flex gap-2 mt-2">
        <button onClick={() => answer("DECLINE")} disabled={!!busy} className="btn-secondary flex-1 justify-center py-1.5 text-xs">
          {busy === "DECLINE" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Keep original"}
        </button>
        <button onClick={() => answer("ACCEPT")} disabled={!!busy} className="btn-primary flex-1 justify-center py-1.5 text-xs">
          {busy === "ACCEPT" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><CheckCircle2 className="w-3.5 h-3.5" /> Accept new time</>}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
    </div>
  );
}
