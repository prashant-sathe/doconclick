"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Clock, KeyRound } from "lucide-react";
import { formattingLocale } from "@/lib/appLanguage";
import { startWindowProblem } from "./visitShared";

// At the door: the patient reads out the 4-digit code from their app. If
// they truly can't, the nurse may start anyway — with a reason, which the
// patient and the admin both see.
export default function StartVisitBox({ visitId, scheduledAt, onStarted }: { visitId: string; scheduledAt: string; onStarted: () => void }) {
  const t = useTranslations("nurse.startVisit");
  const tc = useTranslations("nurse.common");
  const td = useTranslations("nurse.dashboard");
  const locale = formattingLocale(useLocale());
  const [code, setCode] = useState("");
  const [skipping, setSkipping] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = async (payload: Record<string, string>) => {
    setBusy(true); setError("");
    // Not mutate(): a failure's `code` (OTP_LOCKED) matters here.
    let res: Response;
    try {
      res = await fetch(`/api/appointments/${visitId}/start-visit`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
    } catch {
      setBusy(false);
      setError(tc("networkError"));
      return;
    }
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? t("failed"));
      if (data.code === "OTP_LOCKED") setSkipping(true);
      return;
    }
    onStarted();
  };

  const outsideWindow = startWindowProblem(new Date(scheduledAt), td, locale);
  if (outsideWindow) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs text-slate-600 flex items-center gap-1.5"><Clock className="w-4 h-4 text-slate-400 shrink-0" />{outsideWindow}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3">
      {!skipping ? (
        <>
          <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><KeyRound className="w-4 h-4 text-rose-500" />{t("askCode")}</p>
          <div className="flex gap-2 mt-2">
            <input
              inputMode="numeric" maxLength={4} autoComplete="one-time-code" placeholder={t("codePlaceholder")}
              className="input-field text-center text-lg font-bold tracking-[0.4em] flex-1"
              value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 4)); setError(""); }}
            />
            <button disabled={busy || code.length !== 4} onClick={() => send({ code })} className="btn-primary px-4 text-sm disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("start")}
            </button>
          </div>
          <button type="button" onClick={() => { setSkipping(true); setError(""); }} className="text-xs font-semibold text-slate-500 mt-2 underline">
            {t("cantShare")}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-slate-800">{t("withoutTitle")}</p>
          <p className="text-[11px] text-slate-500">{t("withoutHint")}</p>
          <textarea rows={2} className="input-field mt-2 text-sm" placeholder={t("reasonPlaceholder")} value={reason} onChange={(e) => { setReason(e.target.value); setError(""); }} />
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={() => { setSkipping(false); setError(""); }} className="btn-secondary flex-1 justify-center py-2 text-xs">{tc("back")}</button>
            <button disabled={busy || reason.trim().length < 10} onClick={() => send({ skipReason: reason })} className="btn-primary flex-1 justify-center py-2 text-xs disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("startWithout")}
            </button>
          </div>
        </>
      )}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
