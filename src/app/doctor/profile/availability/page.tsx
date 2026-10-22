"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Plus, Trash2, AlertTriangle } from "lucide-react";
import DoctorProfileSubShell from "@/components/doctor/DoctorProfileSubShell";
import { useDoctorProfile, patchDoctorProfile } from "@/lib/useDoctorProfile";
import {
  availabilityFromBlocks, availabilityToBlocks, availabilityProblem, formatAvailability,
  MAX_AVAILABILITY_BLOCKS, type AvailabilityBlock,
} from "@/lib/availability";
import { cn } from "@/lib/utils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// A new range starts empty — the doctor picks its days; nothing is assumed.
const emptyBlock = (): AvailabilityBlock => ({ days: [], from: "09:00", to: "13:00" });

// What's wrong with one range on its own (the cross-range overlap check is
// availabilityProblem's, same as the server's).
function blockProblem(b: AvailabilityBlock): string | null {
  if (b.days.length === 0) return "Pick at least one day.";
  if (!b.from || !b.to) return "Set a start and an end time.";
  if (b.from >= b.to) return "The end time must be after the start time.";
  return null;
}

export default function AvailabilitySettingsPage() {
  const router = useRouter();
  const { profile, loading } = useDoctorProfile();

  // Several ranges, each with its own days — e.g. Mon–Sat 9–1 and Mon–Fri 5–8.
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([emptyBlock()]);
  // The saved value couldn't be read — shown, never silently replaced by a default.
  const [unreadable, setUnreadable] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (hydrated || !profile) return;
    const raw = profile.availability ? String(profile.availability) : "";
    const parsed = availabilityToBlocks(raw);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
    if (parsed && parsed.length) setBlocks(parsed);
    else if (raw) setUnreadable(raw);
  }, [profile, hydrated]);

  const edit = (fn: (cur: AvailabilityBlock[]) => AvailabilityBlock[]) => {
    setDirty(true); setSaved(false); setError("");
    setBlocks(fn);
  };
  const update = (i: number, patch: Partial<AvailabilityBlock>) =>
    edit((cur) => cur.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const toggleDay = (i: number, d: string) =>
    edit((cur) => cur.map((b, j) => (j === i ? { ...b, days: b.days.includes(d) ? b.days.filter((x) => x !== d) : [...b.days, d] } : b)));

  const value = availabilityFromBlocks(blocks);
  const perBlock = blocks.map(blockProblem);
  const problem = perBlock.find(Boolean) ? null : availabilityProblem(value);

  const save = async () => {
    const first = perBlock.findIndex(Boolean);
    if (first !== -1) {
      setError(blocks.length > 1 ? `Range ${first + 1}: ${perBlock[first]}` : perBlock[first]!);
      return;
    }
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError("");
    try {
      await patchDoctorProfile({ availability: value });
      setSaved(true);
      setDirty(false);
      setUnreadable(null);
      setTimeout(() => router.push("/doctor/profile"), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DoctorProfileSubShell
      title="Available Timings"
      description="Applies to Home Visit and Video Consultation requests. Clinic hours are set per clinic on the Clinics page."
      icon={<Clock className="w-5 h-5" />}
      tint="bg-blue-50 text-blue-500"
      loading={loading}
      saving={saving}
      saved={saved}
      dirty={dirty}
      error={error}
      onSave={save}
    >
      {unreadable && (
        <p className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>Your saved hours (&ldquo;{unreadable}&rdquo;) couldn&apos;t be read. Set them again below and save.</span>
        </p>
      )}

      {blocks.map((b, i) => (
        <div key={i} className="rounded-2xl border border-slate-100 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              {blocks.length > 1 ? `Time range ${i + 1}` : "Days and hours"}
            </p>
            {blocks.length > 1 && (
              <button type="button" onClick={() => edit((cur) => cur.filter((_, j) => j !== i))} aria-label={`Remove time range ${i + 1}`}
                className="text-slate-400 hover:text-red-500 p-1">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d) => (
              <button key={d} type="button" onClick={() => toggleDay(i, d)} aria-pressed={b.days.includes(d)}
                className={cn("px-3 py-2 rounded-xl text-xs font-bold border transition-all",
                  b.days.includes(d) ? "bg-teal-600 text-white border-teal-600" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300")}>
                {d}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label" htmlFor={`from-${i}`}>From</label>
              <input id={`from-${i}`} type="time" className="input-field" value={b.from} onChange={(e) => update(i, { from: e.target.value })} />
            </div>
            <div>
              <label className="input-label" htmlFor={`to-${i}`}>To</label>
              <input id={`to-${i}`} type="time" className="input-field" value={b.to} onChange={(e) => update(i, { to: e.target.value })} />
            </div>
          </div>
          {dirty && perBlock[i] && <p className="text-xs text-red-600">{perBlock[i]}</p>}
        </div>
      ))}

      {blocks.length < MAX_AVAILABILITY_BLOCKS && (
        <button type="button" onClick={() => edit((cur) => [...cur, emptyBlock()])} className="btn-secondary w-full justify-center py-2.5 text-sm gap-1.5">
          <Plus className="w-4 h-4" /> Add another time range
        </button>
      )}

      {dirty && problem && <p className="text-xs text-red-600">{problem}</p>}
      {!perBlock.some(Boolean) && !problem && (
        <p className="text-xs text-slate-500">Patients will see: <span className="font-semibold text-slate-700">{formatAvailability(value)}</span></p>
      )}
    </DoctorProfileSubShell>
  );
}
