"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, ShieldCheck } from "lucide-react";
import DoctorProfileSubShell from "@/components/doctor/DoctorProfileSubShell";
import { useDoctorProfile, patchDoctorProfile } from "@/lib/useDoctorProfile";
import { useAuth } from "@/components/AuthProvider";
import { SetPasswordViaGoogle } from "@/components/AccountSecurity";
import { IFSC_REGEX } from "@/lib/validation";
import { useLocale, useTranslations } from "next-intl";
import { formattingLocale } from "@/lib/appLanguage";

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
  const t = useTranslations("doctorAccount.bank");
  const locale = formattingLocale(useLocale());
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
    if (form.bankName.trim().length < 2) { setError(t("errBankName")); return; }
    if (!/^\d{9,18}$/.test(account)) { setError(t("errAccount")); return; }
    if (account !== form.accountNumberConfirm.replace(/[\s-]/g, "")) { setError(t("errMismatch")); return; }
    if (!IFSC_REGEX.test(form.ifsc)) { setError(t("errIfsc")); return; }
    if (!form.currentPassword) { setError(t("errPassword")); return; }

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
      setError(e instanceof Error ? e.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const noPassword = user?.hasPassword === false;
  const changedAt = profile?.bankDetailsUpdatedAt
    ? new Date(profile.bankDetailsUpdatedAt).toLocaleDateString(locale, { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <DoctorProfileSubShell
      title={t("title")}
      description={t("description")}
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
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{t("current")}</p>
          <p className="font-semibold text-slate-800">
            {current.bankName} · XXXX{current.account.slice(-4)} · {current.ifsc}
          </p>
          {changedAt && <p className="text-xs text-slate-400 mt-0.5">{t("lastChanged", { date: changedAt })}</p>}
        </div>
      )}

      {noPassword ? (
        <SetPasswordViaGoogle />
      ) : (
        <>
          <div>
            <label className="input-label">{t("bankName")}</label>
            <input className="input-field" placeholder="HDFC Bank" maxLength={80} value={form.bankName} onChange={(e) => set({ bankName: e.target.value })} />
          </div>
          <div>
            <label className="input-label">{t("accountNumber")}</label>
            <input className="input-field" inputMode="numeric" autoComplete="off" placeholder={t("accountPlaceholder")} value={form.accountNumber}
              onChange={(e) => set({ accountNumber: e.target.value.replace(/[^\d\s]/g, "") })} />
          </div>
          <div>
            <label className="input-label">{t("accountConfirm")}</label>
            <input className="input-field" inputMode="numeric" autoComplete="off" placeholder={t("sameAsAbove")} value={form.accountNumberConfirm}
              onPaste={(e) => e.preventDefault()}
              onChange={(e) => set({ accountNumberConfirm: e.target.value.replace(/[^\d\s]/g, "") })} />
          </div>
          <div>
            <label className="input-label">{t("ifsc")}</label>
            <input className="input-field uppercase" placeholder="HDFC0001234" maxLength={11} value={form.ifsc}
              onChange={(e) => set({ ifsc: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} />
          </div>
          <div>
            <label className="input-label">{t("password")}</label>
            <input type="password" className="input-field" autoComplete="current-password" placeholder={t("passwordPlaceholder")} value={form.currentPassword}
              onChange={(e) => set({ currentPassword: e.target.value })} />
          </div>
          <p className="flex items-start gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            {t("notice")}
          </p>
        </>
      )}
    </DoctorProfileSubShell>
  );
}
