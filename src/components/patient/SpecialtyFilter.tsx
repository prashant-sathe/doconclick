"use client";
import { SPECIALTIES } from "@/lib/specialties";
import { cn } from "@/lib/utils";

export default function SpecialtyFilter({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (specialty: string) => void;
  className?: string;
}) {
  return (
    <div className="relative">
      <div className={cn("flex gap-2 overflow-x-auto no-scrollbar scroll-smooth", className)}>
        <button
          type="button"
          onClick={() => onChange("")}
          className={cn(
            "flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors",
            value === ""
              ? "bg-blue-600 border-blue-600 text-white"
              : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
          )}
        >
          All
        </button>
        {SPECIALTIES.map(({ name, color }) => (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            className={cn(
              "flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors",
              value === name
                ? "text-white border-transparent"
                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
            )}
            style={value === name ? { backgroundColor: color } : undefined}
          >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: value === name ? "white" : color }} />
            {name}
          </button>
        ))}
      </div>
      {/* Edge fades hint that the chip row scrolls horizontally */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-white to-transparent opacity-80" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white to-transparent" />
    </div>
  );
}
