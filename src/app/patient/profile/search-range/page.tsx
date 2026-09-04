"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Compass } from "lucide-react";
import ProfileSubShell from "@/components/patient/ProfileSubShell";
import { usePatientProfile, patchPatientProfile } from "@/lib/usePatientProfile";
import { SEARCH_RADIUS_MIN_KM, SEARCH_RADIUS_MAX_KM } from "@/lib/geo";
import { cn } from "@/lib/utils";

const DEFAULT_RADIUS_KM = 25;

export default function SearchRangeSettingsPage() {
  const router = useRouter();
  const { profile, loading } = usePatientProfile();

  const [radius, setRadius] = useState<number | null>(null);
  const [hasLat, setHasLat] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRadius(profile.searchRadiusKm ?? null);
    setHasLat(profile.lat != null);
  }, [profile]);

  const change = (v: number | null) => { setDirty(true); setSaved(false); setRadius(v); };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await patchPatientProfile({ searchRadiusKm: radius });
      setSaved(true);
      setDirty(false);
      setTimeout(() => router.push("/patient/profile"), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProfileSubShell
      title="Doctor Search Range"
      description="The map shows only clinics within this distance. Search, the Assistant and your saved list still keep doctors who offer video, wherever they are."
      icon={<Compass className="w-5 h-5" />}
      tint="bg-blue-50 text-blue-500"
      loading={loading}
      saving={saving}
      saved={saved}
      dirty={dirty}
      error={error}
      onSave={save}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => change(null)}
          className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
            radius == null ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300")}
        >
          Any distance
        </button>
        <button
          type="button"
          onClick={() => change(radius ?? DEFAULT_RADIUS_KM)}
          className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
            radius != null ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300")}
        >
          Within a set distance
        </button>
      </div>

      {radius != null && (
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <label className="input-label mb-0">Show doctors up to</label>
            <span className="text-sm font-extrabold text-blue-600">{radius} km</span>
          </div>
          <input
            type="range"
            min={SEARCH_RADIUS_MIN_KM}
            max={SEARCH_RADIUS_MAX_KM}
            step={1}
            value={radius}
            onChange={(e) => change(Number(e.target.value))}
            className="w-full accent-blue-600"
          />
          <div className="flex justify-between text-[11px] text-slate-400 mt-1">
            <span>{SEARCH_RADIUS_MIN_KM} km</span>
            <span>{SEARCH_RADIUS_MAX_KM} km</span>
          </div>
          {!hasLat && (
            <p className="text-xs text-amber-600 mt-2 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              Set your location first so we can measure distance to doctors.
            </p>
          )}
        </div>
      )}
    </ProfileSubShell>
  );
}
