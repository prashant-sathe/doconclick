"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { todayIsoDateIst } from "@/lib/clinicAvailability";

interface TimeSlot {
  time: string; // "HH:MM"
  label: string; // "2:00 PM"
}

// Date picker + fetched slot grid for booking a CLINIC visit at a specific
// time — used instead of the free datetime-local input whenever the doctor's
// hours are structured (has ClinicSlot ranges configured for this clinic).
// Emits the same "YYYY-MM-DDTHH:MM" datetime-local shape the free picker
// produced, so callers (submitBooking etc.) don't need to know which picker
// is active.
export default function TimeSlotPicker({
  doctorId,
  clinicId,
  value,
  onChange,
}: {
  doctorId: string;
  clinicId: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [date, setDate] = useState(() => (value ? value.slice(0, 10) : ""));
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const selectedTime = value && value.slice(0, 10) === date ? value.slice(11, 16) : "";

  useEffect(() => {
    // Nothing renders the slot grid while `date` is empty (see below), so
    // stale `slots` from a previous date don't need clearing here.
    if (!date) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(false);
    fetch(`/api/doctors/${doctorId}/slots?clinicId=${clinicId}&date=${date}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (!cancelled) setSlots(d.slots ?? []); })
      .catch(() => { if (!cancelled) { setSlots([]); setError(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [doctorId, clinicId, date]);

  return (
    <div>
      <input
        type="date"
        className="input-field mb-3"
        min={todayIsoDateIst()}
        value={date}
        onChange={(e) => { setDate(e.target.value); onChange(""); }}
      />
      {date && (
        loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
          </div>
        ) : error ? (
          <p className="text-xs text-red-500 text-center py-3">Couldn&apos;t load slots. Try picking the date again.</p>
        ) : slots.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-3">No open slots on this date — try another day.</p>
        ) : (
          <div className="border border-slate-100 rounded-xl p-2">
            <div className="grid grid-cols-3 gap-2 max-h-52 overflow-y-auto pr-0.5">
              {slots.map((s) => (
                <button
                  key={s.time}
                  type="button"
                  onClick={() => onChange(`${date}T${s.time}`)}
                  className={cn(
                    "py-2 rounded-xl border text-xs font-semibold transition-all flex-shrink-0",
                    selectedTime === s.time
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 text-slate-500 hover:border-slate-300"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}
