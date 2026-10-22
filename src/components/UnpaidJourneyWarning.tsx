"use client";
import { useState } from "react";
import { AlertTriangle, BellRing, Car, Loader2 } from "lucide-react";
import { mutate } from "@/lib/apiClient";
import { useToast } from "@/components/Toast";

export type UnpaidStart = { id: string; patientName: string; amount: number; reminderSent: boolean; reminderSentAt: string | null };

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });

// Shown when a nurse/doctor tries to set off for a home visit the patient
// hasn't paid for (the travel API answers 409 UNPAID_VISIT and has already
// pushed the patient a pay reminder). Going anyway is the provider's call —
// but they can't complete the visit until it's paid, so say so plainly.
export default function UnpaidJourneyWarning({ info, busy, onGoAnyway, onClose }: {
  info: UnpaidStart;
  busy: boolean;
  onGoAnyway: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [reminding, setReminding] = useState(false);
  const [lastAt, setLastAt] = useState(info.reminderSentAt);

  const remind = async () => {
    setReminding(true);
    const r = await mutate<{ reminderSentAt: string }>(`/api/appointments/${info.id}/pay-reminder`, { method: "POST" });
    setReminding(false);
    if (!r.ok) { toast.warning(r.error); return; }
    setLastAt(r.data.reminderSentAt);
    toast.success(`${info.patientName} was reminded to pay.`);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4" role="alertdialog" aria-labelledby="unpaid-title">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full border-t-4 border-red-500">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
          <h3 id="unpaid-title" className="font-extrabold text-slate-900">Not paid yet — ₹{info.amount}</h3>
        </div>
        <div className="text-sm text-slate-600 space-y-2 mb-4">
          <p><strong>{info.patientName}</strong> hasn&apos;t paid for this visit. You won&apos;t be able to mark it complete until they do.</p>
          <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 flex items-start gap-1.5">
            <BellRing className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            {info.reminderSent
              ? "We've just sent them a reminder to pay in the app."
              : lastAt ? `They were reminded at ${time(lastAt)}.` : "They've been reminded to pay."}
          </p>
          <p className="text-xs text-slate-500">Best to wait until it&apos;s paid, or call them first.</p>
        </div>
        <div className="space-y-2">
          <button onClick={onClose} disabled={busy} className="btn-primary w-full justify-center py-2.5 text-sm">Wait for payment</button>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={remind} disabled={reminding || busy} className="btn-secondary justify-center py-2 text-xs">
              {reminding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BellRing className="w-3.5 h-3.5" />} Remind again
            </button>
            <button onClick={onGoAnyway} disabled={busy} className="justify-center py-2 text-xs rounded-xl border border-red-200 text-red-700 font-semibold inline-flex items-center gap-1.5 hover:bg-red-50 disabled:opacity-60">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Car className="w-3.5 h-3.5" />} Go anyway
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
