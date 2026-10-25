"use client";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { patientLabel, type Visit } from "./visitShared";

// "Complete visit" dialog (visit notes). State lives in the page.
export default function CompleteVisitDialog({ target, notes, onNotes, busy, onBack, onConfirm }: {
  target: Visit; notes: string; onNotes: (v: string) => void; busy: boolean; onBack: () => void; onConfirm: () => void;
}) {
  const t = useTranslations("nurse.dashboard");
  const tc = useTranslations("nurse.common");
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
        <h3 className="font-bold text-slate-800 mb-1">{t("completeDialog.title")}</h3>
        <p className="text-sm text-slate-500 mb-3">{t("completeDialog.serviceFor", { service: target.serviceName ?? "", name: patientLabel(target) })}</p>
        <label className="input-label">{t("completeDialog.notes")}</label>
        <textarea rows={3} className="input-field" placeholder={t("completeDialog.notesPlaceholder")} value={notes} onChange={(e) => onNotes(e.target.value)} />
        <div className="flex gap-3 mt-4">
          <button onClick={onBack} className="btn-secondary flex-1">{tc("back")}</button>
          <button
            disabled={busy}
            onClick={onConfirm}
            className="btn-primary flex-1 justify-center"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("completeDialog.markComplete")}
          </button>
        </div>
      </div>
    </div>
  );
}
