"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal, X, Languages, GraduationCap, IndianRupee, ArrowUpDown, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSpecialties } from "@/lib/useSpecialties";
import { useTranslations } from "next-intl";
import {
  type DoctorFilterState,
  type DoctorSortBy,
  DEFAULT_DOCTOR_FILTERS,
  isDefaultDoctorFilters,
  collectAvailableLanguages,
} from "@/lib/doctorFilters";

const EXPERIENCE_PRESETS = [0, 5, 10, 15];
const FEE_PRESETS = [null, 300, 500, 1000] as const;
// Labels: messages/<locale>/patient.json → doctorFilters.sort.<id>
const SORT_OPTIONS: DoctorSortBy[] = ["distance", "rating", "experience", "feeLowToHigh"];

function activeFilterCount(f: DoctorFilterState): number {
  let n = 0;
  if (f.language) n++;
  if (f.minExperience > 0) n++;
  if (f.maxFee != null) n++;
  if (f.sortBy !== "distance") n++;
  return n;
}

// Trigger button + a small sheet for language / experience / fee / sort —
// shared by the map dashboard and the plain book page so filtering a doctor
// list behaves identically on both. Pass specialty + onSpecialtyChange to
// also pick the specialist inside the sheet (the map dashboard does, so it
// needs no separate specialty chip row).
export default function DoctorFilters({
  value,
  onChange,
  doctors,
  className,
  iconOnly = false,
  specialty,
  onSpecialtyChange,
}: {
  value: DoctorFilterState;
  onChange: (next: DoctorFilterState) => void;
  doctors: { doctorProfile: { languages: string } | null }[];
  className?: string;
  /** Round 36px icon button (count as a badge) for the map search row. */
  iconOnly?: boolean;
  specialty?: string;
  onSpecialtyChange?: (specialty: string) => void;
}) {
  const t = useTranslations("patient.doctorFilters");
  const tSpec = useTranslations("patient.specialtyFilter");
  const { specialties } = useSpecialties();
  const [open, setOpen] = useState(false);
  const withSpecialty = onSpecialtyChange != null;
  const count = activeFilterCount(value) + (withSpecialty && specialty ? 1 : 0);
  const languages = collectAvailableLanguages(doctors);
  const isDefault = isDefaultDoctorFilters(value) && !(withSpecialty && specialty);

  return (
    <>
      {iconOnly ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("trigger")}
          title={t("trigger")}
          className={cn(
            "tap-44 relative w-9 h-9 rounded-full border flex items-center justify-center transition-colors flex-shrink-0",
            count > 0
              ? "bg-emerald-600 border-emerald-600 text-white"
              : "bg-white/90 border-slate-200/80 text-slate-600 hover:text-emerald-600",
            className
          )}
        >
          <SlidersHorizontal className="w-4 h-4" />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-white text-emerald-700 border border-emerald-600 text-[10px] font-bold flex items-center justify-center">
              {count}
            </span>
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "min-h-11 relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors flex-shrink-0",
            count > 0
              ? "bg-emerald-600 border-emerald-600 text-white"
              : "bg-white border-slate-200 text-slate-600 hover:border-slate-300",
            className
          )}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          {t("trigger")}
          {count > 0 && (
            <span className="w-4 h-4 rounded-full bg-white text-emerald-700 text-[10px] font-bold flex items-center justify-center">
              {count}
            </span>
          )}
        </button>
      )}

      {open && createPortal(
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm max-h-[85dvh] overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-slate-900">{t("title")}</h3>
              <button aria-label={t("close")} onClick={() => setOpen(false)} className="tap-44 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            {withSpecialty && (
              <div className="mb-5">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Stethoscope className="w-3.5 h-3.5" /> {t("specialist")}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onSpecialtyChange("")}
                    className={cn(
                      "min-h-11 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                      !specialty ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                    )}
                  >
                    {tSpec("all")}
                  </button>
                  {specialties.map(({ name, color }) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => onSpecialtyChange(name)}
                      className={cn(
                        "min-h-11 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                        specialty === name ? "text-white border-transparent" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                      )}
                      style={specialty === name ? { backgroundColor: color } : undefined}
                    >
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: specialty === name ? "white" : color }} />
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {languages.length > 0 && (
              <div className="mb-5">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Languages className="w-3.5 h-3.5" /> {t("speaks")}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onChange({ ...value, language: "" })}
                    className={cn(
                      "min-h-11 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                      value.language === "" ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                    )}
                  >
                    {t("any")}
                  </button>
                  {languages.map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => onChange({ ...value, language: lang })}
                      className={cn(
                        "min-h-11 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                        value.language === lang ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                      )}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5" /> {t("experience")}
              </p>
              <div className="flex flex-wrap gap-2">
                {EXPERIENCE_PRESETS.map((yrs) => (
                  <button
                    key={yrs}
                    type="button"
                    onClick={() => onChange({ ...value, minExperience: yrs })}
                    className={cn(
                      "min-h-11 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                      value.minExperience === yrs ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                    )}
                  >
                    {yrs === 0 ? t("any") : t("yearsPlus", { years: yrs })}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <IndianRupee className="w-3.5 h-3.5" /> {t("maxFee")}
              </p>
              <div className="flex flex-wrap gap-2">
                {FEE_PRESETS.map((fee) => (
                  <button
                    key={fee ?? "any"}
                    type="button"
                    onClick={() => onChange({ ...value, maxFee: fee })}
                    className={cn(
                      "min-h-11 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                      value.maxFee === fee ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                    )}
                  >
                    {fee == null ? t("any") : `≤ ₹${fee}`}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <ArrowUpDown className="w-3.5 h-3.5" /> {t("sortBy")}
              </p>
              <div className="flex flex-wrap gap-2">
                {SORT_OPTIONS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onChange({ ...value, sortBy: id })}
                    className={cn(
                      "min-h-11 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                      value.sortBy === id ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                    )}
                  >
                    {t(`sort.${id}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              {!isDefault && (
                <button
                  onClick={() => {
                    onChange(DEFAULT_DOCTOR_FILTERS);
                    onSpecialtyChange?.("");
                  }}
                  className="btn-secondary flex-1"
                >
                  {t("reset")}
                </button>
              )}
              <button onClick={() => setOpen(false)} className="btn-primary flex-1 justify-center">
                {t("showResults")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
