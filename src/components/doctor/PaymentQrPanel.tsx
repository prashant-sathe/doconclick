"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, Check, Loader2, MessageCircle, RefreshCw, Banknote, QrCode } from "lucide-react";
import { mutate } from "@/lib/apiClient";
import { useToast } from "@/components/Toast";
import { useLocale, useTranslations } from "next-intl";
import { formattingLocale } from "@/lib/appLanguage";

export type PaymentLink = { url: string; expiresAt: string };

const POLL_MS = 4000;

// The desk's "pay on your phone" panel for an unpaid online appointment: a QR
// the patient scans (or the same link on WhatsApp), which opens the
// sign-in-free pay page (/pay/[id]). Watches the payment land, so the desk
// sees "Paid" without refreshing. A walk-in can be switched to cash instead
// when the patient can't pay online.
export default function PaymentQrPanel({
  appointmentId,
  amount: initialAmount,
  patientMobile,
  initialLink,
  canSwitchToCash,
  onPaid,
  onSwitchedToCash,
}: {
  appointmentId: string;
  amount: number;
  patientMobile?: string | null;
  initialLink?: PaymentLink | null;
  canSwitchToCash?: boolean;
  onPaid?: () => void;
  onSwitchedToCash?: () => void;
}) {
  const toast = useToast();
  const t = useTranslations("doctor.paymentQr");
  const tc = useTranslations("doctor.common");
  const locale = formattingLocale(useLocale());
  const [link, setLink] = useState<PaymentLink | null>(initialLink ?? null);
  // What's actually due (after any coupon), once the server has said.
  const [amount, setAmount] = useState(initialAmount);
  const [mobile, setMobile] = useState<string | null>(patientMobile ?? null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [copied, setCopied] = useState(false);
  const [switching, setSwitching] = useState(false);
  // Callers pass inline callbacks; keeping the latest in a ref stops every
  // parent re-render from restarting the payment watch below.
  const onPaidRef = useRef(onPaid);
  useEffect(() => { onPaidRef.current = onPaid; });

  const fetchLink = useCallback(async () => {
    setLinkError(null);
    const r = await mutate<PaymentLink & { patientMobile: string; amount: number }>(`/api/doctor/appointments/${appointmentId}/payment-link`, { method: "POST" });
    if (!r.ok) { setLinkError(r.error); return; }
    setLink({ url: r.data.url, expiresAt: r.data.expiresAt });
    setMobile((m) => m ?? r.data.patientMobile);
    setAmount(r.data.amount);
  }, [appointmentId]);

  useEffect(() => {
    if (link) return;
    // Fetching on mount: it only sets state after its first await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchLink();
  }, [link, fetchLink]);

  useEffect(() => {
    if (!link) return;
    let cancelled = false;
    import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(link.url, { width: 260, margin: 1 }))
      .then((url) => { if (!cancelled) setQr(url); });
    return () => { cancelled = true; };
  }, [link]);

  // Watch for the payment (webhook-settled) while the panel is open.
  useEffect(() => {
    if (!link || paid) return;
    const token = new URL(link.url).searchParams.get("t");
    if (!token) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch(`/api/payments/guest-status?t=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.ok) {
          const d: { paymentStatus: string } = await res.json();
          if (d.paymentStatus === "PAID") { setPaid(true); onPaidRef.current?.(); return; }
        }
      } catch {
        // Offline for a moment — keep watching.
      }
      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [link, paid]);

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  const switchToCash = async () => {
    setSwitching(true);
    const r = await mutate(`/api/doctor/appointments/${appointmentId}/payment-method`, { method: "PATCH", body: { paymentMethod: "CASH" } });
    setSwitching(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(t("switchedToCash", { amount }));
    onSwitchedToCash?.();
  };

  if (paid) {
    return (
      <div className="text-center py-6">
        <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
        </div>
        <p className="font-extrabold text-slate-900 text-lg">{t("received", { amount })}</p>
        <p className="text-sm text-slate-500 mt-1">{t("nothingToCollect")}</p>
      </div>
    );
  }

  const waText = link
    ? t("waText", { amount, url: link.url })
    : "";

  return (
    <div>
      <div className="flex flex-col items-center">
        <div className="w-[236px] h-[236px] rounded-2xl border border-slate-100 bg-white flex items-center justify-center">
          {linkError ? (
            <div className="px-4 text-center">
              <p className="text-sm text-red-600 mb-3">{linkError}</p>
              <button type="button" onClick={fetchLink} className="btn-secondary py-2 px-3 text-xs"><RefreshCw className="w-3.5 h-3.5" /> {tc("retry")}</button>
            </div>
          ) : qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={t("qrAlt")} width={220} height={220} />
          ) : (
            <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
          )}
        </div>
        <p className="text-sm font-semibold text-slate-700 mt-3 flex items-center gap-1.5">
          <QrCode className="w-4 h-4 text-teal-600" /> {t("scanToPay", { amount })}
        </p>
        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" /> {t("waiting")}
        </p>
        {link && (
          <p className="text-[11px] text-slate-400 mt-1">
            {t("validTill", { when: new Date(link.expiresAt).toLocaleString(locale, { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) })}
          </p>
        )}
      </div>

      {link && (
        <div className="grid grid-cols-2 gap-2 mt-4">
          <a
            href={`https://wa.me/${mobile ? `91${mobile}` : ""}?text=${encodeURIComponent(waText)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary py-2.5 justify-center text-sm text-emerald-700 border-emerald-200"
          >
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </a>
          <button type="button" onClick={copy} className="btn-secondary py-2.5 justify-center text-sm">
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />} {copied ? t("copied") : t("copyLink")}
          </button>
        </div>
      )}

      {canSwitchToCash && (
        <button
          type="button"
          onClick={switchToCash}
          disabled={switching}
          className="w-full mt-3 text-sm font-semibold text-slate-500 hover:text-slate-800 py-2 flex items-center justify-center gap-1.5 disabled:opacity-60"
        >
          {switching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
          {t("takeCash")}
        </button>
      )}
    </div>
  );
}
