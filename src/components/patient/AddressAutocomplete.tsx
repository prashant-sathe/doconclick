"use client";
import { useEffect, useRef, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";

interface Suggestion {
  id: number;
  label: string;
  lat: number;
  lon: number;
}

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  className = "",
  multiline = false,
  rows = 2,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect?: (s: { label: string; lat: number; lon: number }) => void;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
  rows?: number;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [focused, setFocused] = useState(false);
  const skipNextFetch = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Only search on user-driven typing, not when a value arrives from a
    // parent's data fetch (e.g. loading a saved profile) while unfocused.
    if (!focused || value.trim().length < 3) return;
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(value)}`);
        const data: Suggestion[] = await res.json();
        setSuggestions(data);
        setOpen(data.length > 0);
        setActiveIndex(-1);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, focused]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const select = (s: Suggestion) => {
    skipNextFetch.current = true;
    onChange(s.label);
    onSelect?.(s);
    setOpen(false);
    setSuggestions([]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      select(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const sharedProps = {
    className: `input-field ${className}`,
    placeholder,
    value,
    onFocus: () => { setFocused(true); if (suggestions.length > 0) setOpen(true); },
    onBlur: () => setFocused(false),
    onKeyDown,
    autoComplete: "off" as const,
  };

  return (
    <div className="relative" ref={containerRef}>
      {multiline ? (
        <textarea
          {...sharedProps}
          rows={rows}
          className={`input-field resize-none ${className}`}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          {...sharedProps}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {loading && (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 absolute right-3 top-3.5" />
      )}
      {open && suggestions.length > 0 && value.trim().length >= 3 && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-xl border border-slate-200 shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(s)}
              className={`w-full text-left px-3.5 py-2.5 text-sm flex items-start gap-2 hover:bg-slate-50 transition-colors ${i === activeIndex ? "bg-blue-50" : ""}`}
            >
              <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
              <span className="text-slate-700 leading-snug">{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
