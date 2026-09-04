"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Home, Video, MapPin, IndianRupee } from "lucide-react";
import DoctorProfileSubShell from "@/components/doctor/DoctorProfileSubShell";
import { useDoctorProfile, patchDoctorProfile } from "@/lib/useDoctorProfile";
import { cn } from "@/lib/utils";

export default function ConsultationSettingsPage() {
  const router = useRouter();
  const { profile, loading } = useDoctorProfile();

  const [form, setForm] = useState({
    consultFee: "", videoFee: "", homeVisitFee: "",
    offersClinic: true, offersHomeVisit: true, offersVideo: false,
    radius: 10,
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm({
      consultFee: profile.consultFee ? String(profile.consultFee) : "",
      videoFee: profile.videoFee ? String(profile.videoFee) : "",
      homeVisitFee: profile.homeVisitFee ? String(profile.homeVisitFee) : "",
      offersClinic: profile.offersClinic ?? true,
      offersHomeVisit: profile.offersHomeVisit ?? true,
      offersVideo: profile.offersVideo ?? false,
      radius: profile.radius ?? 10,
    });
  }, [profile]);

  const set = (patch: Partial<typeof form>) => { setDirty(true); setSaved(false); setForm((f) => ({ ...f, ...patch })); };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await patchDoctorProfile({
        consultFee: form.consultFee,
        videoFee: form.videoFee,
        homeVisitFee: form.homeVisitFee,
        offersClinic: form.offersClinic,
        offersHomeVisit: form.offersHomeVisit,
        offersVideo: form.offersVideo,
        radius: form.radius,
      });
      setSaved(true);
      setDirty(false);
      setTimeout(() => router.push("/doctor/profile"), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const toggleRow = (Icon: React.ElementType, label: string, k: "offersClinic" | "offersHomeVisit" | "offersVideo") => (
    // A real checkbox drives the switch (sr-only + peer) rather than a bare
    // <button>, so the whole row stays tappable via the label's native
    // click-forwards-to-input behavior — a <button> with its own onClick
    // only responds inside its own small hit box, not the row around it.
    <label className="flex items-center justify-between p-4 rounded-xl border border-slate-200 cursor-pointer">
      <span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Icon className="w-4 h-4 text-slate-400" /> {label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={form[k]}
        onChange={(e) => set({ [k]: e.target.checked } as Partial<typeof form>)}
        className="sr-only peer"
      />
      <span className="w-10 h-6 rounded-full bg-slate-200 peer-checked:bg-teal-500 relative flex-shrink-0 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-[18px]" />
    </label>
  );

  return (
    <DoctorProfileSubShell
      title="Consultation & Fees"
      description="What you offer, what you charge, and how far you travel for home visits."
      icon={<IndianRupee className="w-5 h-5" />}
      tint="bg-emerald-50 text-emerald-600"
      loading={loading}
      saving={saving}
      saved={saved}
      dirty={dirty}
      error={error}
      onSave={save}
    >
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="input-label">Clinic Consultation Fee (₹)</label>
          <input type="number" min={0} inputMode="numeric" className="input-field" placeholder="500" value={form.consultFee} onChange={(e) => set({ consultFee: e.target.value })} />
        </div>
        <div>
          <label className="input-label">Video Consultation Fee (₹)</label>
          <input type="number" min={0} inputMode="numeric" className="input-field" placeholder="400" value={form.videoFee} onChange={(e) => set({ videoFee: e.target.value })} />
        </div>
        <div>
          <label className="input-label">Home Visit Fee (₹)</label>
          <input type="number" min={0} inputMode="numeric" className="input-field" placeholder="800" value={form.homeVisitFee} onChange={(e) => set({ homeVisitFee: e.target.value })} />
        </div>
      </div>

      <div className="space-y-2">
        {toggleRow(Building2, "Offer Clinic Visits", "offersClinic")}
        {toggleRow(Home, "Offer Home Visits", "offersHomeVisit")}
        {toggleRow(Video, "Offer Video Consultations", "offersVideo")}
      </div>

      <div className={cn(!form.offersHomeVisit && "opacity-50")}>
        <label className="input-label mb-2 flex items-center justify-between">
          <span><MapPin className="inline w-3.5 h-3.5 mr-1" />Home Visit Radius</span>
          <span className="text-teal-600 font-bold">{form.radius} km</span>
        </label>
        <input type="range" min={5} max={20} step={1} value={form.radius}
          onChange={(e) => set({ radius: Number(e.target.value) })}
          disabled={!form.offersHomeVisit}
          className="w-full accent-teal-500 disabled:cursor-not-allowed" />
        <div className="flex justify-between text-[10px] text-slate-400 mt-1"><span>5 km</span><span>20 km</span></div>
        {!form.offersHomeVisit && (
          <p className="text-xs text-slate-400 mt-1.5">Turn on &quot;Offer Home Visits&quot; to set your service radius.</p>
        )}
      </div>
    </DoctorProfileSubShell>
  );
}
