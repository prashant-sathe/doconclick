"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProfileSubShell from "@/components/patient/ProfileSubShell";
import { usePatientProfile, patchPatientProfile } from "@/lib/usePatientProfile";
import { isValidMobile, normalizeMobile } from "@/lib/validation";

export default function EmergencyContactSettingsPage() {
  const router = useRouter();
  const { profile, loading } = usePatientProfile();

  const [form, setForm] = useState({ name: "", phone: "" });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm({
      name: profile.emergencyContactName ?? "",
      phone: profile.emergencyContactPhone ?? "",
    });
  }, [profile]);

  const set = (patch: Partial<typeof form>) => { setDirty(true); setSaved(false); setForm((f) => ({ ...f, ...patch })); };

  const save = async () => {
    if (form.phone && !isValidMobile(form.phone)) { setError("Enter a valid 10-digit mobile number."); return; }
    setSaving(true);
    setError("");
    try {
      await patchPatientProfile({
        emergencyContactName: form.name.trim() || null,
        emergencyContactPhone: form.phone ? normalizeMobile(form.phone) : null,
      });
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
      title="Emergency Contact"
      description="Someone we can reach if you can't be contacted during a visit."
      loading={loading}
      saving={saving}
      saved={saved}
      dirty={dirty}
      error={error}
      onSave={save}
    >
      <div>
        <label className="input-label">Contact Name</label>
        <input className="input-field" placeholder="e.g. Priya Sharma" value={form.name} onChange={(e) => set({ name: e.target.value })} />
      </div>
      <div>
        <label className="input-label">Mobile Number</label>
        <input className="input-field" type="tel" inputMode="numeric" maxLength={10} placeholder="9800000000" value={form.phone} onChange={(e) => set({ phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} />
      </div>
    </ProfileSubShell>
  );
}
