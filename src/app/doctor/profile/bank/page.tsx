"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";
import DoctorProfileSubShell from "@/components/doctor/DoctorProfileSubShell";
import { useDoctorProfile, patchDoctorProfile } from "@/lib/useDoctorProfile";

export default function BankDetailsPage() {
  const router = useRouter();
  const { profile, loading } = useDoctorProfile();

  const [form, setForm] = useState({ bankName: "", bankAccount: "", ifsc: "" });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile) return;
    if (profile.bankDetails) {
      const [bankName, bankAccount, ifscPart] = String(profile.bankDetails).split(" | ");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({ bankName: bankName ?? "", bankAccount: bankAccount ?? "", ifsc: (ifscPart ?? "").replace("IFSC: ", "") });
    }
  }, [profile]);

  const set = (patch: Partial<typeof form>) => { setDirty(true); setSaved(false); setForm((f) => ({ ...f, ...patch })); };

  const save = async () => {
    setSaving(true);
    setError("");
    const bankDetails = form.bankName || form.bankAccount || form.ifsc
      ? `${form.bankName} | ${form.bankAccount} | IFSC: ${form.ifsc}`
      : null;
    try {
      await patchDoctorProfile({ bankDetails });
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
      title="Bank Details"
      description="Where DocOnClick sends your consultation payouts."
      icon={<CreditCard className="w-5 h-5" />}
      tint="bg-purple-50 text-purple-500"
      loading={loading}
      saving={saving}
      saved={saved}
      dirty={dirty}
      error={error}
      onSave={save}
    >
      <div>
        <label className="input-label">Bank Name</label>
        <input className="input-field" placeholder="HDFC Bank" value={form.bankName} onChange={(e) => set({ bankName: e.target.value })} />
      </div>
      <div>
        <label className="input-label">Account Number</label>
        <input className="input-field" inputMode="numeric" placeholder="XXXX XXXX XXXX" value={form.bankAccount} onChange={(e) => set({ bankAccount: e.target.value })} />
      </div>
      <div>
        <label className="input-label">IFSC Code</label>
        <input className="input-field uppercase" placeholder="HDFC0001234" value={form.ifsc} onChange={(e) => set({ ifsc: e.target.value.toUpperCase() })} />
      </div>
    </DoctorProfileSubShell>
  );
}
