"use client";
import { useEffect, useState } from "react";
import { Gift, MessageCircle, Copy, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/AuthProvider";

type Card = {
  enabled: true;
  code: string;
  amount: number;
  links: { patient?: string; doctor?: string; nurse?: string };
  joined: number;
  rewarded: number;
  earned: number;
  monthlyCap: number;
  walletBalance: number;
};

const wa = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

// "Invite & earn" (FP1-23) on the patient / doctor / nurse profile: the
// user's code with WhatsApp share links in their language. Renders nothing
// while the programme is off for them (GET /api/referrals/me).
export default function ReferralInviteCard() {
  const { user } = useAuth();
  const t = useTranslations("shared.referral");
  const [card, setCard] = useState<Card | null>(null);
  const [copied, setCopied] = useState(false);

  // Keyed on the id — AuthProvider re-polls with a fresh `user` object.
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetch("/api/referrals/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.enabled) setCard(d as Card); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  if (!card || !user) return null;
  const isPatient = user.role === "PATIENT";
  const copyLink = isPatient ? card.links.patient : user.role === "NURSE" ? card.links.nurse : card.links.doctor;

  const copy = async () => {
    if (!copyLink) return;
    try {
      await navigator.clipboard.writeText(copyLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the WhatsApp buttons still work */
    }
  };

  const shareButton = (href: string, label: string) => (
    <a
      key={label}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="tap-44-y btn-secondary py-2.5 justify-center text-sm text-emerald-700 border-emerald-200"
    >
      <MessageCircle className="w-4 h-4" /> {label}
    </a>
  );

  return (
    <section aria-labelledby="referral-card-title" className="mb-5 bg-white rounded-2xl border border-emerald-100 shadow-sm p-5">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
          <Gift className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="referral-card-title" className="font-bold text-slate-900">{t("title")}</h2>
          <p className="text-sm text-slate-600 mt-1">{t(isPatient ? "bodyPatient" : "bodyProvider", { amount: card.amount })}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-slate-50 border border-dashed border-slate-200 px-4 py-2.5">
        <span className="text-xs font-semibold text-slate-500">{t("yourCode")}</span>
        <span className="font-mono font-bold tracking-widest text-slate-900 select-all">{card.code}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
        {isPatient
          ? card.links.patient && shareButton(wa(t("waPatient", { link: card.links.patient })), t("shareWhatsApp"))
          : <>
              {card.links.doctor && shareButton(wa(t("waDoctor", { link: card.links.doctor })), t("inviteDoctor"))}
              {card.links.nurse && shareButton(wa(t("waNurse", { link: card.links.nurse })), t("inviteNurse"))}
            </>}
        <button type="button" onClick={copy} className={`tap-44-y btn-secondary py-2.5 justify-center text-sm ${isPatient ? "" : "sm:col-span-2"}`}>
          {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />} {copied ? t("copied") : t("copyLink")}
        </button>
      </div>

      <p className="text-xs text-slate-500 mt-3">{t("stats", { joined: card.joined, rewarded: card.rewarded, earned: card.earned })}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">
        {t("capNote", { cap: card.monthlyCap })}
        {!isPatient && card.walletBalance > 0 && <> · {t("walletNote", { balance: card.walletBalance })}</>}
      </p>
    </section>
  );
}
