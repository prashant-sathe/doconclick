"use client";

import { useState } from "react";
import { CalendarClock, Loader2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { formattingLocale } from "@/lib/appLanguage";
import { istDayKey } from "@/lib/istDate";
import { FOLLOW_UP_CHIPS, FOLLOW_UP_NOTE_MAX, followUpInstant, followUpLabel, followUpYmdIn } from "@/lib/followUp";

/** date: "" = no follow-up, else the IST day as YYYY-MM-DD. */
export type FollowUpValue = { date: string; note: string };
export const NO_FOLLOW_UP: FollowUpValue = { date: "", note: "" };

/** The JSON the complete / PATCH routes take: { date, note } or null. */
export const followUpBody = (v: FollowUpValue) => (v.date ? { date: v.date, note: v.note.trim() } : null);

// "Review in N days" — quick chips, any other date, and a short note for the
// patient. Used on the completion form and to change it afterwards.
export default function FollowUpPicker({ value, onChange }: { value: FollowUpValue; onChange: (v: FollowUpValue) => void }) {
  const t = useTranslations("doctor.followUp");
  const locale = formattingLocale(useLocale());
  const chipDates = FOLLOW_UP_CHIPS.map((days) => ({ days, date: followUpYmdIn(days) }));
  const onChip = chipDates.some((c) => c.date === value.date);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange(NO_FOLLOW_UP)}
          className={cn("min-h-9 px-3 rounded-lg border text-xs font-semibold", !value.date ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-200 bg-white text-slate-600")}
        >
          {t("none")}
        </button>
        {chipDates.map((c) => (
          <button
            key={c.days}
            type="button"
            onClick={() => onChange({ ...value, date: c.date })}
            className={cn("min-h-9 px-3 rounded-lg border text-xs font-semibold", value.date === c.date ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-200 bg-white text-slate-600")}
          >
            {t("inDays", { n: c.days })}
          </button>
        ))}
        <input
          type="date"
          aria-label={t("otherDate")}
          className={cn("input-field text-xs py-1.5 w-auto min-h-9", value.date && !onChip && "border-teal-500")}
          min={followUpYmdIn(1)}
          value={value.date}
          onChange={(e) => onChange({ ...value, date: e.target.value })}
        />
      </div>
      {value.date && (
        <>
          <p className="text-[11px] text-teal-700 font-semibold">{t("on", { date: followUpLabel(followUpInstant(value.date), locale) })}</p>
          <input
            className="input-field text-xs py-1.5"
            maxLength={FOLLOW_UP_NOTE_MAX}
            placeholder={t("notePlaceholder")}
            value={value.note}
            onChange={(e) => onChange({ ...value, note: e.target.value })}
          />
        </>
      )}
    </div>
  );
}

/** Change or remove the follow-up on a completed consultation (PATCH /api/appointments/[id]). */
export function FollowUpEditDialog({ appointmentId, current, onClose, onSaved }: {
  appointmentId: string;
  current: { followUpDate: string | null; followUpNote: string | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("doctor.followUp");
  const [value, setValue] = useState<FollowUpValue>(() => ({
    date: current.followUpDate ? istDayKey(current.followUpDate) : "",
    note: current.followUpNote ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followUp: followUpBody(value) }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? t("saveFailed"));
        return;
      }
      onSaved();
    } catch {
      setError(t("saveFailed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-5 max-w-sm w-full">
        <div className="flex items-center gap-2 mb-3">
          <CalendarClock className="w-5 h-5 text-teal-600" />
          <h3 className="font-bold text-slate-800 flex-1">{t("title")}</h3>
          <button type="button" onClick={onClose} aria-label={t("close")} className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <FollowUpPicker value={value} onChange={setValue} />
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        <div className="flex gap-3 mt-4">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">{t("cancel")}</button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 transition-colors disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
