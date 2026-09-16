"use client";
import { useState } from "react";
import { SlidersHorizontal, X, Languages, GraduationCap, IndianRupee, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type DoctorFilterState,
  type DoctorSortBy,
  DEFAULT_DOCTOR_FILTERS,
  isDefaultDoctorFilters,
  collectAvailableLanguages,
} from "@/lib/doctorFilters";

const EXPERIENCE_PRESETS = [0, 5, 10, 15];
const FEE_PRESETS = [null, 300, 500, 1000] as const;
const SORT_OPTIONS: { id: DoctorSortBy; label: string }[] = [
  { id: "distance", label: "Nearest" },
  { id: "rating", label: "Top Rated" },
  { id: "experience", label: "Most Experienced" },
  { id: "feeLowToHigh", label: "Lowest Fee" },
];

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
// list behaves identically on both.
export default function DoctorFilters({
  value,
  onChange,
  doctors,
  className,
}: {
  value: DoctorFilterState;
  onChange: (next: DoctorFilterState) => void;
  doctors: { doctorProfile: { languages: string } | null }[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(value);
  const languages = collectAvailableLanguages(doctors);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors flex-shrink-0",
          count > 0
            ? "bg-blue-600 border-blue-600 text-white"
            : "bg-white border-slate-200 text-slate-600 hover:border-slate-300",
          className
        )}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        Filters
        {count > 0 && (
          <span className="w-4 h-4 rounded-full bg-white text-blue-600 text-[10px] font-bold flex items-center justify-center">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm max-h-[85vh] overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-slate-900">Filter &amp; Sort</h3>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            {languages.length > 0 && (
              <div className="mb-5">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Languages className="w-3.5 h-3.5" /> Speaks
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onChange({ ...value, language: "" })}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                      value.language === "" ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                    )}
                  >
                    Any
                  </button>
                  {languages.map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => onChange({ ...value, language: lang })}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                        value.language === lang ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
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
                <GraduationCap className="w-3.5 h-3.5" /> Experience
              </p>
              <div className="flex flex-wrap gap-2">
                {EXPERIENCE_PRESETS.map((yrs) => (
                  <button
                    key={yrs}
                    type="button"
                    onClick={() => onChange({ ...value, minExperience: yrs })}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                      value.minExperience === yrs ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                    )}
                  >
                    {yrs === 0 ? "Any" : `${yrs}+ yrs`}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <IndianRupee className="w-3.5 h-3.5" /> Max Clinic Fee
              </p>
              <div className="flex flex-wrap gap-2">
                {FEE_PRESETS.map((fee) => (
                  <button
                    key={fee ?? "any"}
                    type="button"
                    onClick={() => onChange({ ...value, maxFee: fee })}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                      value.maxFee === fee ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                    )}
                  >
                    {fee == null ? "Any" : `≤ ₹${fee}`}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <ArrowUpDown className="w-3.5 h-3.5" /> Sort By
              </p>
              <div className="flex flex-wrap gap-2">
                {SORT_OPTIONS.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onChange({ ...value, sortBy: id })}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                      value.sortBy === id ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              {!isDefaultDoctorFilters(value) && (
                <button onClick={() => onChange(DEFAULT_DOCTOR_FILTERS)} className="btn-secondary flex-1">
                  Reset
                </button>
              )}
              <button onClick={() => setOpen(false)} className="btn-primary flex-1 justify-center">
                Show Results
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
