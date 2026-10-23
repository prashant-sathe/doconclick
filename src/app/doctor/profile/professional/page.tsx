"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Award, Briefcase, Languages, FileText, Hash, Lock, Clock, XCircle } from "lucide-react";
import DoctorProfileSubShell from "@/components/doctor/DoctorProfileSubShell";
import { useDoctorProfile, patchDoctorProfile, type DoctorChangeRequest } from "@/lib/useDoctorProfile";
import { LOCKED_FIELD_LABELS, isProfileLocked } from "@/lib/doctorProfileLock";
import { useTranslations } from "next-intl";

// What the doctor asked to change, e.g. "Specialty → Cardiologist".
function describeChanges(r: DoctorChangeRequest, label: (f: keyof typeof LOCKED_FIELD_LABELS) => string) {
  return (Object.keys(r.changes) as (keyof typeof LOCKED_FIELD_LABELS)[])
    .map((f) => `${label(f)} → ${r.changes[f]?.to ?? "—"}`)
    .join(" · ");
}
import { useSpecialties } from "@/lib/useSpecialties";

export default function ProfessionalDetailsPage() {
  const t = useTranslations("doctorAccount.professional");
  const fieldLabel = (f: keyof typeof LOCKED_FIELD_LABELS) => t(`field.${f}`);
  const router = useRouter();
  const { profile, changeRequest: loadedRequest, loading } = useDoctorProfile();
  // Updated from the save response, so a new/merged request shows at once.
  const [savedRequest, setSavedRequest] = useState<DoctorChangeRequest | null | undefined>(undefined);
  const changeRequest = savedRequest === undefined ? loadedRequest : savedRequest;
  const [notice, setNotice] = useState("");
  // Verified fields can't be edited directly any more — a change goes to an admin.
  const locked = !!profile && isProfileLocked({ isVerified: !!profile.isVerified, status: String(profile.status ?? "PENDING") });
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
    // While a re-verification request is pending, the verified fields show
    // what was asked for — so saving something else re-sends (keeps) it, and
    // setting one back to its verified value withdraws that part.
    const asked = loadedRequest?.status === "PENDING" ? loadedRequest.changes : {};
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm({
      specialty: asked.specialty?.to ?? profile.specialty ?? "General Physician",
      experience: profile.experience ? String(profile.experience) : "",
      qualification: asked.qualification?.to ?? profile.qualification ?? "",
      languages: profile.languages ?? "",
      bio: profile.bio ?? "",
      medRegNo: asked.medRegNo?.to ?? profile.medRegNo ?? "",
    });
  }, [profile, loadedRequest]);

  const set = (patch: Partial<typeof form>) => { setDirty(true); setSaved(false); setForm((f) => ({ ...f, ...patch })); };

  const save = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await patchDoctorProfile({
        specialty: form.specialty,
        experience: form.experience,
        qualification: form.qualification,
        languages: form.languages,
        bio: form.bio,
        medRegNo: form.medRegNo,
      });
      setSaved(true);
      setDirty(false);
      setSavedRequest(res.changeRequest);
      if (locked && res.changeRequest?.status === "PENDING") {
        // Stay here so the doctor sees what's waiting for review.
        setNotice(t("sentForReview"));
        return;
      }
      setTimeout(() => router.push("/doctor/profile"), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DoctorProfileSubShell
      title={t("title")}
      description={t("description")}
      icon={<Award className="w-5 h-5" />}
      tint="bg-teal-50 text-teal-600"
      loading={loading}
      saving={saving}
      saved={saved}
      dirty={dirty}
      error={error}
      onSave={save}
    >
      {changeRequest?.status === "PENDING" && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <Clock className="w-4 h-4 flex-shrink-0" />
          <span><span className="font-semibold">{t("waitingReview")}</span> {describeChanges(changeRequest, fieldLabel)}</span>
        </div>
      )}
      {changeRequest?.status === "REJECTED" && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          <span><span className="font-semibold">{t("notApproved")}</span> ({describeChanges(changeRequest, fieldLabel)}){changeRequest.reviewNote ? `: ${changeRequest.reviewNote}` : "."}</span>
        </div>
      )}
      {notice && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">{notice}</p>}
      {locked && (
        <p className="flex items-start gap-1.5 text-xs text-slate-500">
          <Lock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {t("lockedHint")}
        </p>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="input-label">{t("specialty")}{locked && <Lock className="inline w-3 h-3 ml-1 text-slate-400" />}</label>
          <select className="input-field" value={form.specialty} onChange={(e) => set({ specialty: e.target.value })}>
            {!specialties.some((s) => s.name === form.specialty) && form.specialty && (
              <option value={form.specialty}>{form.specialty}</option>
            )}
            {specialties.map((s) => <option key={s.name}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="input-label"><Briefcase className="inline w-3.5 h-3.5 mr-1" />{t("experience")}</label>
          <input type="number" min={0} inputMode="numeric" className="input-field" placeholder="5" value={form.experience} onChange={(e) => set({ experience: e.target.value })} />
        </div>
      </div>
      <div>
        <label className="input-label">{t("qualification")}{locked && <Lock className="inline w-3 h-3 ml-1 text-slate-400" />}</label>
        <input className="input-field" placeholder="MBBS, MD" value={form.qualification} onChange={(e) => set({ qualification: e.target.value })} />
      </div>
      <div>
        <label className="input-label"><Languages className="inline w-3.5 h-3.5 mr-1" />{t("languages")}</label>
        <input className="input-field" placeholder={t("languagesPlaceholder")} value={form.languages} onChange={(e) => set({ languages: e.target.value })} />
      </div>
      <div>
        <label className="input-label"><FileText className="inline w-3.5 h-3.5 mr-1" />{t("bio")}</label>
        <textarea rows={3} className="input-field resize-none" placeholder={t("bioPlaceholder")} value={form.bio} onChange={(e) => set({ bio: e.target.value })} />
      </div>
      <div>
        <label className="input-label"><Hash className="inline w-3.5 h-3.5 mr-1" />{t("medRegNo")}{locked && <Lock className="inline w-3 h-3 ml-1 text-slate-400" />}</label>
        <input className="input-field" placeholder="MCI-12345" value={form.medRegNo} onChange={(e) => set({ medRegNo: e.target.value })} />
      </div>
    </DoctorProfileSubShell>
  );
}
