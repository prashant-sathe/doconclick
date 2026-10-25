"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, AlertTriangle, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { mutate } from "@/lib/apiClient";
import { SUGAR_TYPES, fToC, cToF, type VitalsInput } from "@/lib/vitals";
import { formattingLocale } from "@/lib/appLanguage";
import type { Visit, VitalRow } from "./visitShared";

// Vitals at the visit. Temperature is entered in °F (what home thermometers
// in India show) and stored in °C. A critical reading shows what to do right
// away; the server has already pushed it to the patient (and the referring
// doctor, if any).
export default function RecordVitalsBox({ visit, onSaved }: { visit: Visit; onSaved: () => void }) {
  const t = useTranslations("nurse.vitals");
  const tc = useTranslations("nurse.common");
  const locale = formattingLocale(useLocale());
  const summary = (v: VitalsInput) => {
    const parts: string[] = [];
    if (v.systolic != null && v.diastolic != null) parts.push(t("summary.bp", { systolic: v.systolic, diastolic: v.diastolic }));
    if (v.pulse != null) parts.push(t("summary.pulse", { value: v.pulse }));
    if (v.spo2 != null) parts.push(t("summary.spo2", { value: v.spo2 }));
    if (v.temperatureC != null) parts.push(t("summary.temp", { value: cToF(v.temperatureC) }));
    if (v.sugarMgDl != null) parts.push(t("summary.sugar", { value: v.sugarMgDl }));
    return parts.join(" · ");
  };
  const [open, setOpen] = useState(visit.vitals.length === 0);
  const [f, setF] = useState({ systolic: "", diastolic: "", pulse: "", spo2: "", tempF: "", sugar: "", sugarType: "RANDOM", notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ level: string; alerts: { level: string; message: string }[]; doctorAlerted: boolean } | null>(null);
  const [previous, setPrevious] = useState<VitalRow | null | undefined>(undefined);

  useEffect(() => {
    const qs = new URLSearchParams({ patientId: visit.patientId, limit: "5", ...(visit.dependentId ? { dependentId: visit.dependentId } : {}) });
    fetch(`/api/vitals?${qs}`).then((r) => (r.ok ? r.json() : [])).then((rows: (VitalRow & { appointmentId: string | null })[]) => {
      setPrevious(rows.find((r) => r.appointmentId !== visit.id) ?? null);
    }).catch(() => setPrevious(null));
  }, [visit.patientId, visit.dependentId, visit.id]);

  const set = (k: keyof typeof f, val: string) => { setF((x) => ({ ...x, [k]: val })); setError(""); };
  const save = async () => {
    setBusy(true); setError("");
    const res = await mutate<{ level: string; alerts?: { level: string; message: string }[]; doctorAlerted?: boolean }>(`/api/appointments/${visit.id}/vitals`, {
      body: {
        systolic: f.systolic, diastolic: f.diastolic, pulse: f.pulse, spo2: f.spo2,
        temperatureC: f.tempF ? fToC(Number(f.tempF)) : "",
        sugarMgDl: f.sugar, sugarType: f.sugarType, notes: f.notes,
      },
      fallback: t("saveFailed"),
    });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    const data = res.data;
    setResult({ level: data.level, alerts: data.alerts ?? [], doctorAlerted: !!data.doctorAlerted });
    setF({ systolic: "", diastolic: "", pulse: "", spo2: "", tempF: "", sugar: "", sugarType: "RANDOM", notes: "" });
    setOpen(false);
    onSaved();
  };
  const field = (k: keyof typeof f, label: string, ph: string, w = "") => (
    <label className={cn("block", w)}>
      <span className="text-[11px] text-slate-500">{label}</span>
      <input inputMode="decimal" className="input-field py-1.5 text-sm" placeholder={ph} value={f[k]} onChange={(e) => set(k, e.target.value.replace(/[^\d.]/g, ""))} />
    </label>
  );

  return (
    <div className="rounded-xl border border-slate-200 p-3 mb-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><Activity className="w-4 h-4 text-rose-500" />{t("title")}</p>
        {!open && <button type="button" onClick={() => { setOpen(true); setResult(null); }} className="text-xs font-semibold text-blue-600">{t("record")}</button>}
      </div>
      {previous && (
        <p className="text-[11px] text-slate-500 mt-1">{t("previous", { date: new Date(previous.recordedAt).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }), summary: summary(previous) })}</p>
      )}
      {visit.vitals.map((r) => (
        <p key={r.id} className={cn("text-xs mt-1", r.alertLevel === "CRITICAL" ? "text-red-700 font-semibold" : r.alertLevel === "WARNING" ? "text-amber-800" : "text-slate-600")}>
          {r.alertLevel !== "NORMAL" && <AlertTriangle className="w-3 h-3 inline mr-1" />}
          {new Date(r.recordedAt).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}: {summary(r)}
        </p>
      ))}
      {result?.level === "CRITICAL" && (
        <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
          <p className="font-bold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{t("criticalTitle")}</p>
          {result.alerts.filter((a) => a.level === "CRITICAL").map((a, i) => <p key={i}>• {a.message}</p>)}
          <p className="mt-1">{t.rich("criticalAdvice", { b: (c) => <strong>{c}</strong> })}</p>
          <p className="mt-1 font-semibold">{result.doctorAlerted ? t("doctorAlerted") : t("familyAlerted")}</p>
        </div>
      )}
      {result?.level === "WARNING" && (
        <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold">{t("warningTitle")}</p>
          {result.alerts.map((a, i) => <p key={i}>• {a.message}</p>)}
          <p className="mt-0.5">{t("warningNote")}</p>
        </div>
      )}
      {open && (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {field("systolic", t("field.systolic"), "120")}
            {field("diastolic", t("field.diastolic"), "80")}
            {field("pulse", t("field.pulse"), "76")}
            {field("spo2", t("field.spo2"), "98")}
            {field("tempF", t("field.temp"), "98.6")}
            {field("sugar", t("field.sugar"), "110")}
          </div>
          {f.sugar && (
            <div className="flex gap-1.5">
              {SUGAR_TYPES.map((st) => (
                <button key={st.id} type="button" onClick={() => set("sugarType", st.id)}
                  className={cn("flex-1 py-1.5 rounded-lg border text-[11px] font-semibold", f.sugarType === st.id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600")}>
                  {t(`sugarType.${st.id}`)}
                </button>
              ))}
            </div>
          )}
          {f.tempF && Number(f.tempF) > 0 && Number(f.tempF) < 50 && (
            <p className="text-[11px] text-amber-700">{t("looksCelsius", { c: f.tempF, f: cToF(Number(f.tempF)) })}</p>
          )}
          <input className="input-field py-1.5 text-sm" placeholder={t("notesPlaceholder")} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            {visit.vitals.length > 0 && <button type="button" onClick={() => setOpen(false)} className="btn-secondary flex-1 justify-center py-2 text-xs">{tc("cancel")}</button>}
            <button type="button" disabled={busy} onClick={save} className="btn-primary flex-1 justify-center py-2 text-xs">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("save")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
