"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Award, Briefcase, Languages, FileText, Hash } from "lucide-react";
import DoctorProfileSubShell from "@/components/doctor/DoctorProfileSubShell";
import { useDoctorProfile, patchDoctorProfile } from "@/lib/useDoctorProfile";
import { useSpecialties } from "@/lib/useSpecialties";

export default function ProfessionalDetailsPage() {
  const router = useRouter();
  const { profile, loading } = useDoctorProfile();
  const { specialties } = useSpecialties();

  const [form, setForm] = useState({
    specialty: "General Physician", experience: "", qualification: "", languages: "", bio: "", medRegNo: "",
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm({
      specialty: profile.specialty ?? "General Physician",
      experience: profile.experience ? String(profile.experience) : "",
      qualification: profile.qualification ?? "",
      languages: profile.languages ?? "",
      bio: profile.bio ?? "",
      medRegNo: profile.medRegNo ?? "",
    });
  }, [profile]);

  const set = (patch: Partial<typeof form>) => { setDirty(true); setSaved(false); setForm((f) => ({ ...f, ...patch })); };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await patchDoctorProfile({
        specialty: form.specialty,
        experience: form.experience,
        qualification: form.qualification,
        languages: form.languages,
        bio: form.bio,
        medRegNo: form.medRegNo,
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

  return (
    <DoctorProfileSubShell
      title="Professional Details"
      description="Shown on your public profile so patients know your background."
      icon={<Award className="w-5 h-5" />}
      tint="bg-teal-50 text-teal-600"
      loading={loading}
      saving={saving}
      saved={saved}
      dirty={dirty}
      error={error}
      onSave={save}
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="input-label">Specialty</label>
          <select className="input-field" value={form.specialty} onChange={(e) => set({ specialty: e.target.value })}>
            {!specialties.some((s) => s.name === form.specialty) && form.specialty && (
              <option value={form.specialty}>{form.specialty}</option>
            )}
            {specialties.map((s) => <option key={s.name}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="input-label"><Briefcase className="inline w-3.5 h-3.5 mr-1" />Years of Experience</label>
          <input type="number" min={0} inputMode="numeric" className="input-field" placeholder="5" value={form.experience} onChange={(e) => set({ experience: e.target.value })} />
        </div>
      </div>
      <div>
        <label className="input-label">Qualification</label>
        <input className="input-field" placeholder="MBBS, MD" value={form.qualification} onChange={(e) => set({ qualification: e.target.value })} />
      </div>
      <div>
        <label className="input-label"><Languages className="inline w-3.5 h-3.5 mr-1" />Languages Spoken</label>
        <input className="input-field" placeholder="English, Hindi, Marathi" value={form.languages} onChange={(e) => set({ languages: e.target.value })} />
      </div>
      <div>
        <label className="input-label"><FileText className="inline w-3.5 h-3.5 mr-1" />About You</label>
        <textarea rows={3} className="input-field resize-none" placeholder="Tell patients about your experience, approach to care, and specialties…" value={form.bio} onChange={(e) => set({ bio: e.target.value })} />
      </div>
      <div>
        <label className="input-label"><Hash className="inline w-3.5 h-3.5 mr-1" />Medical Registration Number</label>
        <input className="input-field" placeholder="MCI-12345" value={form.medRegNo} onChange={(e) => set({ medRegNo: e.target.value })} />
      </div>
    </DoctorProfileSubShell>
  );
}
