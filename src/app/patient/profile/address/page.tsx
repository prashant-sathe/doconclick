"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Loader2 } from "lucide-react";
import ProfileSubShell from "@/components/patient/ProfileSubShell";
import AddressAutocomplete from "@/components/patient/AddressAutocomplete";
import { usePatientProfile, patchPatientProfile } from "@/lib/usePatientProfile";
import { isNative, getCurrentPositionCompat } from "@/lib/platform";
import { useTranslations } from "next-intl";

export default function AddressSettingsPage() {
  const router = useRouter();
  const { profile, loading } = usePatientProfile();
  const t = useTranslations("patientAccount.address");
  const ts = useTranslations("patientAccount.shell");

  const [form, setForm] = useState({
    location: "", homeAddress: "", landmark: "", pinCode: "",
    lat: null as number | null, lng: null as number | null,
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [addressError, setAddressError] = useState("");
  const [pinError, setPinError] = useState("");
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!profile) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm({
      location: profile.location ?? "",
      homeAddress: profile.homeAddress ?? "",
      landmark: profile.landmark ?? "",
      pinCode: profile.pinCode ?? "",
      lat: profile.lat ?? null,
      lng: profile.lng ?? null,
    });
  }, [profile]);

  const set = (patch: Partial<typeof form>) => { setDirty(true); setSaved(false); setForm((f) => ({ ...f, ...patch })); };

  const getGPS = () => {
    if (!isNative() && !navigator.geolocation) return;
    setLocating(true);
    getCurrentPositionCompat()
      .then(async (pos) => {
        const { latitude, longitude } = pos.coords;
        let address = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        let pin: string | null = null;
        try {
          const d = await (await fetch(`/api/geocode/reverse?lat=${latitude}&lon=${longitude}`)).json();
          if (d.label) address = d.label;
          if (d.pinCode) pin = d.pinCode;
        } catch { /* keep coords */ }
        set({ location: address, homeAddress: address, pinCode: pin ?? form.pinCode, lat: latitude, lng: longitude });
      })
      .finally(() => setLocating(false));
  };

  const save = async () => {
    let bad = false;
    if (!form.homeAddress.trim()) { setAddressError(t("errHome")); bad = true; } else setAddressError("");
    if (!/^\d{6}$/.test(form.pinCode.trim())) { setPinError(t("errPin")); bad = true; } else setPinError("");
    if (bad) return;
    setSaving(true);
    setError("");
    try {
      await patchPatientProfile({
        location: form.location || null,
        homeAddress: form.homeAddress,
        landmark: form.landmark || null,
        pinCode: form.pinCode,
        lat: form.lat,
        lng: form.lng,
      });
      setSaved(true);
      setDirty(false);
      setTimeout(() => router.push("/patient/profile"), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : ts("couldNotSave"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProfileSubShell
      title={t("title")}
      description={t("description")}
      icon={<MapPin className="w-5 h-5" />}
      tint="bg-blue-50 text-blue-500"
      loading={loading}
      saving={saving}
      saved={saved}
      dirty={dirty}
      error={error}
      onSave={save}
    >
      <div>
        <label className="input-label">{t("current")}</label>
        <div className="flex gap-2">
          <div className="flex-1">
            <AddressAutocomplete
              placeholder={t("searchPlaceholder")}
              value={form.location}
              onChange={(v) => set({ location: v })}
              onSelect={(s) => set({ location: s.label, lat: s.lat, lng: s.lon })}
            />
          </div>
          <button type="button" onClick={getGPS} disabled={locating} className="btn-secondary flex-shrink-0 px-3 text-xs gap-1 self-start disabled:opacity-60">
            {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
            {locating ? t("locating") : "GPS"}
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-1">{t("gpsHint")}</p>
      </div>

      <div>
        <label className="input-label">{t("home")} <span className="text-red-500">*</span></label>
        <AddressAutocomplete
          multiline
          placeholder={t("homePlaceholder")}
          value={form.homeAddress}
          onChange={(v) => set({ homeAddress: v })}
          onSelect={(s) => set({ homeAddress: s.label, lat: s.lat, lng: s.lon })}
        />
        {addressError && <p className="text-xs text-red-500 mt-1">{addressError}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="input-label">{t("landmark")}</label>
          <input className="input-field" placeholder={t("landmarkPlaceholder")} value={form.landmark} onChange={(e) => set({ landmark: e.target.value })} />
        </div>
        <div>
          <label className="input-label">{t("pin")} <span className="text-red-500">*</span></label>
          <input className="input-field" inputMode="numeric" placeholder="400001" maxLength={6} value={form.pinCode} onChange={(e) => set({ pinCode: e.target.value.replace(/\D/g, "").slice(0, 6) })} />
          {pinError && <p className="text-xs text-red-500 mt-1">{pinError}</p>}
        </div>
      </div>
    </ProfileSubShell>
  );
}
