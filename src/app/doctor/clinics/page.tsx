"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2, MapPin, Building2, Clock, Plus, Trash2, Save, CheckCircle2,
  Navigation, Image as ImageIcon, UploadCloud, ArrowRight,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { cn } from "@/lib/utils";
import DoctorHeader from "@/components/doctor/DoctorHeader";
import DoctorMobileNav from "@/components/doctor/DoctorMobileNav";
import AddressAutocomplete from "@/components/patient/AddressAutocomplete";
import LocationPickerMap from "@/components/LocationPickerMap";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Slot {
  dayOfWeek: string;
  fromTime: string;
  toTime: string;
}

interface SlotGroup {
  days: string[];
  fromTime: string;
  toTime: string;
}

interface ClinicForm {
  id: string | null; // null = not yet saved
  name: string;
  address: string;
  photoUrl: string | null;
  lat: number | null;
  lng: number | null;
  slotGroups: SlotGroup[];
  saving: boolean;
  saved: boolean;
  error: string;
}

interface ClinicApiShape {
  id: string;
  name: string;
  address: string;
  photoUrl: string | null;
  lat: number;
  lng: number;
  slots: Slot[];
}

function groupSlots(slots: Slot[]): SlotGroup[] {
  const groups: SlotGroup[] = [];
  for (const slot of slots) {
    const existing = groups.find((g) => g.fromTime === slot.fromTime && g.toTime === slot.toTime);
    if (existing) existing.days.push(slot.dayOfWeek);
    else groups.push({ days: [slot.dayOfWeek], fromTime: slot.fromTime, toTime: slot.toTime });
  }
  return groups;
}

function newClinic(): ClinicForm {
  return {
    id: null, name: "", address: "", photoUrl: null, lat: null, lng: null,
    slotGroups: [{ days: [], fromTime: "09:00", toTime: "18:00" }],
    saving: false, saved: false, error: "",
  };
}

function ClinicPhotoUpload({ url, onUploaded }: { url: string | null; onUploaded: (url: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const upload = async (file: File) => {
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/doctors/me/clinics/photo", { method: "POST", body: form });
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      onUploaded(data.url);
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Upload failed.");
    }
  };

  return (
    <div>
      <div className="relative w-full h-32 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 mb-2">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Clinic photo" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 gap-1">
            <ImageIcon className="w-6 h-6" />
            <span className="text-xs text-slate-400">No photo yet</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <label className="btn-secondary py-1.5 px-3 text-xs cursor-pointer flex-shrink-0">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
          {url ? "Replace Photo" : "Upload Photo"}
          <input type="file" accept=".jpg,.jpeg,.png" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        </label>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    </div>
  );
}

function ClinicCard({ clinic, onChange, onSave, onDelete }: {
  clinic: ClinicForm;
  onChange: (next: ClinicForm) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const set = <K extends keyof ClinicForm>(key: K, value: ClinicForm[K]) =>
    onChange({ ...clinic, [key]: value, saved: false });

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      onChange({
        ...clinic,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        address: clinic.address || `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`,
        saved: false,
      });
    });
  };

  const toggleDay = (groupIdx: number, day: string) => {
    const slotGroups = clinic.slotGroups.map((g, i) => {
      if (i !== groupIdx) return g;
      return { ...g, days: g.days.includes(day) ? g.days.filter((d) => d !== day) : [...g.days, day] };
    });
    set("slotGroups", slotGroups);
  };

  const updateGroup = (groupIdx: number, patch: Partial<SlotGroup>) => {
    set("slotGroups", clinic.slotGroups.map((g, i) => (i === groupIdx ? { ...g, ...patch } : g)));
  };

  const addGroup = () => set("slotGroups", [...clinic.slotGroups, { days: [], fromTime: "09:00", toTime: "18:00" }]);
  const removeGroup = (groupIdx: number) => set("slotGroups", clinic.slotGroups.filter((_, i) => i !== groupIdx));

  const hasAnySlot = clinic.slotGroups.some((g) => g.days.length > 0);
  const missingName = !clinic.name.trim();
  const missingAddress = !clinic.address.trim();
  const missingLocation = clinic.lat == null || clinic.lng == null;
  const missingSlot = !hasAnySlot;
  const canSave = !missingName && !missingAddress && !missingLocation && !missingSlot;

  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-teal-500" /> {clinic.name || "New Clinic"}
        </h3>
        <button type="button" onClick={onDelete} className="text-red-500 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div>
        <label className="input-label">Clinic Name <span className="text-red-500">*</span></label>
        <input className="input-field" placeholder="e.g. Sunrise Family Clinic" value={clinic.name}
          onChange={(e) => set("name", e.target.value)} />
      </div>

      <div>
        <label className="input-label">Photo <span className="text-slate-400 font-normal normal-case">(optional)</span></label>
        <ClinicPhotoUpload url={clinic.photoUrl} onUploaded={(url) => set("photoUrl", url)} />
      </div>

      <div>
        <label className="input-label">Address <span className="text-red-500">*</span></label>
        <div className="flex gap-2 mb-2">
          <div className="flex-1">
            <AddressAutocomplete
              placeholder="Search this clinic's address…"
              value={clinic.address}
              onChange={(v) => set("address", v)}
              onSelect={(s) => onChange({ ...clinic, address: s.label, lat: s.lat, lng: s.lon, saved: false })}
            />
          </div>
          <button type="button" onClick={useCurrentLocation} className="btn-secondary flex-shrink-0 px-3 text-xs gap-1 self-start">
            <Navigation className="w-3.5 h-3.5" /> Use Current
          </button>
        </div>
        {missingAddress && (
          <p className="text-xs text-red-600 font-semibold mb-2">Address is required — patients need to see where this clinic is before they can book.</p>
        )}
        <label className="input-label">Pin Location <span className="text-red-500">*</span></label>
        <LocationPickerMap lat={clinic.lat} lng={clinic.lng}
          onChange={(lat, lng) => onChange({ ...clinic, lat, lng, saved: false })} height={220} />
        {clinic.lat != null && clinic.lng != null ? (
          <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1 mt-1.5">
            <MapPin className="w-3.5 h-3.5" /> Location set ({clinic.lat.toFixed(4)}, {clinic.lng.toFixed(4)})
          </p>
        ) : (
          <p className="text-xs text-red-600 font-semibold mt-1.5">No location set yet — search an address or use your current location.</p>
        )}
      </div>

      <div>
        <label className="input-label flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Day-wise Availability <span className="text-red-500">*</span></label>
        {missingSlot && (
          <p className="text-xs text-red-600 font-semibold mt-1">Select at least one day and time — patients need to know when this clinic is open before they can book.</p>
        )}
        <div className="space-y-3 mt-2">
          {clinic.slotGroups.map((group, groupIdx) => (
            <div key={groupIdx} className="rounded-xl border border-slate-200 p-3 space-y-2.5">
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((d) => (
                  <button key={d} type="button" onClick={() => toggleDay(groupIdx, d)}
                    className={cn("px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all",
                      group.days.includes(d) ? "bg-teal-600 text-white border-teal-600" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                    )}>
                    {d}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="input-label">From</label>
                  <input type="time" className="input-field" value={group.fromTime}
                    onChange={(e) => updateGroup(groupIdx, { fromTime: e.target.value })} />
                </div>
                <div className="flex-1">
                  <label className="input-label">To</label>
                  <input type="time" className="input-field" value={group.toTime}
                    onChange={(e) => updateGroup(groupIdx, { toTime: e.target.value })} />
                </div>
                {clinic.slotGroups.length > 1 && (
                  <button type="button" onClick={() => removeGroup(groupIdx)}
                    className="text-red-400 hover:text-red-600 p-1.5 mt-4 rounded-lg hover:bg-red-50 flex-shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={addGroup} className="btn-secondary mt-2.5 py-1.5 px-3 text-xs gap-1">
          <Plus className="w-3.5 h-3.5" /> Add another time range
        </button>
      </div>

      {clinic.error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{clinic.error}</p>}

      <button type="button" disabled={!canSave || clinic.saving} onClick={onSave}
        className="btn-primary w-full justify-center py-2.5 text-sm">
        {clinic.saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : clinic.saved ? <><CheckCircle2 className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> Save Clinic</>}
      </button>
    </section>
  );
}

export default function DoctorClinicsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [clinics, setClinics] = useState<ClinicForm[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?next=/doctor/clinics");
    if (!authLoading && user && user.role !== "DOCTOR") router.push("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user || user.role !== "DOCTOR") return;
    fetch("/api/doctors/me/clinics")
      .then((r) => r.json())
      .then((data: ClinicApiShape[]) => {
        setClinics(data.map((c) => ({
          id: c.id, name: c.name, address: c.address, photoUrl: c.photoUrl, lat: c.lat, lng: c.lng,
          slotGroups: c.slots.length ? groupSlots(c.slots) : [{ days: [], fromTime: "09:00", toTime: "18:00" }],
          saving: false, saved: false, error: "",
        })));
        setLoading(false);
      });
  }, [user]);

  const updateAt = (idx: number, next: ClinicForm) =>
    setClinics((cur) => cur.map((c, i) => (i === idx ? next : c)));

  const addClinic = () => setClinics((cur) => [...cur, newClinic()]);

  const deleteClinic = async (idx: number) => {
    const clinic = clinics[idx];
    if (clinic.id) await fetch(`/api/doctors/me/clinics/${clinic.id}`, { method: "DELETE" });
    setClinics((cur) => cur.filter((_, i) => i !== idx));
  };

  const saveClinic = async (idx: number) => {
    const clinic = clinics[idx];
    updateAt(idx, { ...clinic, saving: true, error: "" });

    const slots: Slot[] = clinic.slotGroups.flatMap((g) =>
      g.days.map((dayOfWeek) => ({ dayOfWeek, fromTime: g.fromTime, toTime: g.toTime }))
    );
    const payload = {
      name: clinic.name.trim(), address: clinic.address.trim(),
      photoUrl: clinic.photoUrl, lat: clinic.lat, lng: clinic.lng, slots,
    };

    const res = clinic.id
      ? await fetch(`/api/doctors/me/clinics/${clinic.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        })
      : await fetch("/api/doctors/me/clinics", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });

    if (res.ok) {
      const saved: ClinicApiShape = await res.json();
      updateAt(idx, { ...clinic, id: saved.id, saving: false, saved: true, error: "" });
    } else {
      const err = await res.json().catch(() => ({}));
      updateAt(idx, { ...clinic, saving: false, saved: false, error: err.error ?? "Could not save this clinic." });
    }
  };

  if (authLoading || loading || !user) {
    return <div className="min-h-screen gradient-surface flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
    </div>;
  }

  return (
    <div className="min-h-screen gradient-surface pb-24 sm:pb-10">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <DoctorHeader />
      <DoctorMobileNav />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900">Manage Your Clinics</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Add every location you practice at, with day-wise hours for each. Patients will see a marker for each clinic on the map, and can see where you&apos;re available right now.
          </p>
        </div>

        <div className="space-y-6">
          {clinics.map((clinic, idx) => (
            <ClinicCard
              key={clinic.id ?? `new-${idx}`}
              clinic={clinic}
              onChange={(next) => updateAt(idx, next)}
              onSave={() => saveClinic(idx)}
              onDelete={() => deleteClinic(idx)}
            />
          ))}
        </div>

        <button type="button" onClick={addClinic} className="btn-secondary w-full justify-center py-3 mt-6 gap-1.5">
          <Plus className="w-4 h-4" /> Add Another Clinic
        </button>

        <div className="flex justify-end mt-6">
          <Link href="/doctor/dashboard" className="btn-secondary gap-1.5 text-sm">
            Continue to Dashboard <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
