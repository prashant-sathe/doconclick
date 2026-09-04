"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import DoctorProfileSubShell from "@/components/doctor/DoctorProfileSubShell";
import { useDoctorProfile, patchDoctorProfile } from "@/lib/useDoctorProfile";
import { cn } from "@/lib/utils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function AvailabilitySettingsPage() {
  const router = useRouter();
  const { profile, loading } = useDoctorProfile();

  const [days, setDays] = useState<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const [fromTime, setFromTime] = useState("09:00");
  const [toTime, setToTime] = useState("18:00");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile?.availability) return;
    const m = String(profile.availability).match(/^(.+?)\s+(\d{1,2}:\d{2})(?:AM|PM)?[–-](\d{1,2}:\d{2})(?:AM|PM)?$/);
    if (m) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDays(m[1].split(",").map((d) => d.trim()));
      setFromTime(m[2]);
      setToTime(m[3]);
    }
  }, [profile]);

  const toggleDay = (d: string) => {
    setDirty(true); setSaved(false);
    setDays((cur) => cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    const availability = days.length ? `${days.join(", ")} ${fromTime}–${toTime}` : "Mon-Fri, 9AM-6PM";
    try {
      await patchDoctorProfile({ availability });
      setSaved(true);
      setDirty(false);
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
      <div className="flex flex-wrap gap-2">
        {DAYS.map((d) => (
          <button key={d} type="button" onClick={() => toggleDay(d)}
            className={cn("px-3 py-2 rounded-xl text-xs font-bold border transition-all",
              days.includes(d) ? "bg-teal-600 text-white border-teal-600" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300")}>
            {d}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="input-label">From</label>
          <input type="time" className="input-field" value={fromTime} onChange={(e) => { setDirty(true); setSaved(false); setFromTime(e.target.value); }} />
        </div>
        <div>
          <label className="input-label">To</label>
          <input type="time" className="input-field" value={toTime} onChange={(e) => { setDirty(true); setSaved(false); setToTime(e.target.value); }} />
        </div>
      </div>
    </DoctorProfileSubShell>
  );
}
