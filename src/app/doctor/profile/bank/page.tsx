"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, ShieldCheck } from "lucide-react";
import DoctorProfileSubShell from "@/components/doctor/DoctorProfileSubShell";
import { useDoctorProfile, patchDoctorProfile } from "@/lib/useDoctorProfile";
import { useAuth } from "@/components/AuthProvider";
import { SetPasswordViaGoogle } from "@/components/AccountSecurity";
import { IFSC_REGEX } from "@/lib/validation";

// Stored as "Bank | Account | IFSC: CODE" (see src/lib/doctorProfileLock.ts).
function parseBankDetails(raw: string | null | undefined) {
  if (!raw) return null;
  const [bankName, account, ifscPart] = raw.split(" | ");
  return { bankName: bankName ?? "", account: account ?? "", ifsc: (ifscPart ?? "").replace("IFSC: ", "") };
}

// Where payouts go. Changing it is a sensitive action: the account number is
// typed twice, the IFSC format is checked, and the doctor's password is
// required (the server enforces all of it and pushes a notice afterwards).
export default function BankDetailsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { profile, loading } = useDoctorProfile();
  const current = parseBankDetails(profile?.bankDetails as string | null | undefined);

  const [form, setForm] = useState({ bankName: "", accountNumber: "", accountNumberConfirm: "", ifsc: "", currentPassword: "" });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile) return;
    const c = parseBankDetails(profile.bankDetails as string | null | undefined);
    // The account number is never pre-filled: a change means typing it (twice).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (c) setForm((f) => ({ ...f, bankName: c.bankName, ifsc: c.ifsc }));
  }, [profile]);

  const set = (patch: Partial<typeof form>) => { setDirty(true); setSaved(false); setError(""); setForm((f) => ({ ...f, ...patch })); };

  const save = async () => {
    const account = form.accountNumber.replace(/[\s-]/g, "");
    if (form.bankName.trim().length < 2) { setError("Enter your bank's name."); return; }
    if (!/^\d{9,18}$/.test(account)) { setError("Account number must be 9 to 18 digits."); return; }
    if (account !== form.accountNumberConfirm.replace(/[\s-]/g, "")) { setError("The account numbers don't match."); return; }
    if (!IFSC_REGEX.test(form.ifsc)) { setError("IFSC must be 11 characters, like HDFC0001234."); return; }
    if (!form.currentPassword) { setError("Enter your password to confirm."); return; }

    setSaving(true);
    setError("");
    try {
      await patchDoctorProfile({
        bank: { bankName: form.bankName, accountNumber: account, accountNumberConfirm: form.accountNumberConfirm, ifsc: form.ifsc },
        currentPassword: form.currentPassword,
      });
      setSaved(true);
      setDirty(false);
      setForm((f) => ({ ...f, currentPassword: "" }));
      setTimeout(() => router.push("/doctor/profile"), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const noPassword = user?.hasPassword === false;
  const changedAt = profile?.bankDetailsUpdatedAt
    ? new Date(profile.bankDetailsUpdatedAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })
    : null;

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
      onSave={noPassword ? undefined : save}
    >
      {current && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Current payout account</p>
          <p className="font-semibold text-slate-800">
            {current.bankName} · XXXX{current.account.slice(-4)} · {current.ifsc}
          </p>
          {changedAt && <p className="text-xs text-slate-400 mt-0.5">Last changed {changedAt}</p>}
        </div>
      )}

      {noPassword ? (
        <SetPasswordViaGoogle />
      ) : (
        <>
          <div>
            <label className="input-label">Bank Name</label>
            <input className="input-field" placeholder="HDFC Bank" maxLength={80} value={form.bankName} onChange={(e) => set({ bankName: e.target.value })} />
          </div>
          <div>
            <label className="input-label">Account Number</label>
            <input className="input-field" inputMode="numeric" autoComplete="off" placeholder="9 to 18 digits" value={form.accountNumber}
              onChange={(e) => set({ accountNumber: e.target.value.replace(/[^\d\s]/g, "") })} />
          </div>
          <div>
            <label className="input-label">Re-enter Account Number</label>
            <input className="input-field" inputMode="numeric" autoComplete="off" placeholder="Same as above" value={form.accountNumberConfirm}
              onPaste={(e) => e.preventDefault()}
              onChange={(e) => set({ accountNumberConfirm: e.target.value.replace(/[^\d\s]/g, "") })} />
          </div>
          <div>
            <label className="input-label">IFSC Code</label>
            <input className="input-field uppercase" placeholder="HDFC0001234" maxLength={11} value={form.ifsc}
              onChange={(e) => set({ ifsc: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} />
          </div>
          <div>
            <label className="input-label">Your Password</label>
            <input type="password" className="input-field" autoComplete="current-password" placeholder="To confirm it's you" value={form.currentPassword}
              onChange={(e) => set({ currentPassword: e.target.value })} />
          </div>
          <p className="flex items-start gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            We&apos;ll notify you whenever your payout account changes.
          </p>
        </>
      )}
    </DoctorProfileSubShell>
  );
}
