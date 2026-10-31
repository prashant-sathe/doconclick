"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Gift, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";

type Status = "idle" | "checking" | "valid" | "invalid";
const CODE_RE = /^[A-Z2-9]{6,12}$/; // same as normalizeReferralCode (src/lib/referrals.ts)
const SYNC_DELAY_MS = 600;

// The register pages' optional "Referral code". An invite link
// (…/register?ref=CODE — on the web, or a native deep link routed here by
// NativeBootstrap) fills it in; the visitor can also type or clear it. Each
// value is handed to /api/referrals/capture, which keeps it in an httpOnly
// cookie for whichever sign-up follows, form or Google (src/lib/referrals.ts).
// Hidden while that role's reward is ₹0.
export function useReferralCode(role: "PATIENT" | "DOCTOR" | "NURSE") {
  const [enabled, setEnabled] = useState(false);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const synced = useRef<{ value: string; result: Promise<boolean> } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolves false only for a code the server refused — a network problem
  // never blocks a sign-up.
  const sync = useCallback((value: string): Promise<boolean> => {
    if (synced.current?.value === value) return synced.current.result;
    const current = () => synced.current?.value === value;
    const result = (async () => {
      if (!value) {
        setStatus("idle");
        await fetch("/api/referrals/capture", { method: "DELETE" }).catch(() => {});
        return true;
      }
      if (!CODE_RE.test(value)) { setStatus("invalid"); return false; }
      setStatus("checking");
      try {
        const res = await fetch("/api/referrals/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: value }),
        });
        const data = await res.json().catch(() => ({}));
        const ok = data.ok === true || data.reason !== "INVALID";
        if (current()) setStatus(data.ok === true ? "valid" : ok ? "idle" : "invalid");
        return ok;
      } catch {
        if (current()) setStatus("idle");
        return true;
      }
    })();
    synced.current = { value, result };
    return result;
  }, []);

  useEffect(() => {
    const fromUrl = (new URLSearchParams(window.location.search).get("ref") ?? "").trim().toUpperCase();
    if (fromUrl) {
      void sync(fromUrl);
    }
    fetch(`/api/referrals/capture?role=${role}`)
      .then((r) => r.json())
      .then((d: { enabled?: boolean; code?: string | null }) => {
        setEnabled(!!d.enabled);
        if (fromUrl) setCode(fromUrl);
        else if (d.code) {
          // Kept from an invite link opened earlier — already in the cookie.
          synced.current = { value: d.code, result: Promise.resolve(true) };
          setCode(d.code);
          setStatus("valid");
        }
      })
      .catch(() => {});
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [role, sync]);

  const change = (raw: string) => {
    const value = raw.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 12);
    setCode(value);
    setStatus("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void sync(value), SYNC_DELAY_MS);
  };

  /** Before submitting: the field's value is in the cookie (true) or refused (false). */
  const confirm = (): Promise<boolean> => {
    if (!enabled) return Promise.resolve(true);
    if (timer.current) clearTimeout(timer.current);
    return sync(code);
  };

  return { enabled, code, status, change, confirm };
}

export default function ReferralCodeField({ referral }: { referral: ReturnType<typeof useReferralCode> }) {
  const tr = useTranslations("auth.register");
  if (!referral.enabled) return null;
  const invalid = referral.status === "invalid";
  return (
    <div>
      <label htmlFor="referral-code" className="input-label"><Gift className="inline w-3.5 h-3.5 mr-1" />{tr("referralOptional")}</label>
      <input
        id="referral-code"
        className="input-field uppercase tracking-wider"
        placeholder={tr("referralPlaceholder")}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={12}
        aria-invalid={invalid}
        aria-describedby={referral.status === "valid" || invalid ? "referral-code-status" : undefined}
        value={referral.code}
        onChange={(e) => referral.change(e.target.value)}
        onBlur={() => void referral.confirm()}
      />
      {referral.status === "valid" && (
        <p id="referral-code-status" className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />{tr("referralApplied")}</p>
      )}
      {invalid && <p id="referral-code-status" role="alert" className="text-xs text-red-600 mt-1.5">{tr("referralInvalid")}</p>}
    </div>
  );
}
