"use client";
import { useEffect, useState } from "react";
import { CalendarClock, Loader2, CheckCircle2 } from "lucide-react";
import { BOOKING_HORIZON_DEFAULT_DAYS, BOOKING_HORIZON_MIN_DAYS, BOOKING_HORIZON_MAX_DAYS } from "@/lib/bookingHorizon";

// How far ahead patients can book or reschedule (doctor and nurse visits).
export default function BookingSettings() {
  const [days, setDays] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/settings").then((r) => r.json()).then((s) => setDays(String(s.bookingHorizonDays ?? BOOKING_HORIZON_DEFAULT_DAYS)));
  }, []);

  const save = async () => {
    if (days === null) return;
    setSaved(false); setError("");
    // Number("") is 0 — a blank field must be an error, not a 0-day window.
    const value = days.trim() === "" ? NaN : Number(days);
    if (!Number.isInteger(value) || value < BOOKING_HORIZON_MIN_DAYS || value > BOOKING_HORIZON_MAX_DAYS) {
      setError(`Enter a whole number of days between ${BOOKING_HORIZON_MIN_DAYS} and ${BOOKING_HORIZON_MAX_DAYS}.`); return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingHorizonDays: value }),
      });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Could not save."); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Network error — settings were not saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center">
          <CalendarClock className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-bold text-slate-800">Booking window</h2>
          <p className="text-xs text-slate-500">How far ahead patients can book or reschedule.</p>
        </div>
      </div>
      {days === null ? (
        <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
      ) : (
        <>
          <div className="max-w-[12rem]">
            <label className="input-label">Days ahead</label>
            <input
              type="number" min={BOOKING_HORIZON_MIN_DAYS} max={BOOKING_HORIZON_MAX_DAYS} className="input-field"
              value={days} onChange={(e) => setDays(e.target.value)}
            />
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Applies to doctor and nurse bookings and to reschedule requests. Existing appointments aren&apos;t affected.
          </p>
          <div className="flex items-center gap-3 mt-4">
            <button onClick={save} disabled={saving} className="btn-primary py-2.5 px-5 text-sm">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Save"}
            </button>
            {saved && <span className="text-sm text-emerald-600 font-semibold flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Saved</span>}
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </>
      )}
    </div>
  );
}
