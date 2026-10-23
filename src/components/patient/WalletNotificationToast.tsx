"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Wallet, XCircle, ShieldCheck, X } from "lucide-react";
import type { WalletTxnEvent } from "@/hooks/useWalletNotifications";
import { useTranslations } from "next-intl";

const AUTO_DISMISS_MS = 6000;

// Title/message copy lives in messages/<locale>/patient.json (walletToast.<type>).
const TYPE_COPY = {
  TOPUP: { icon: Wallet, color: "text-emerald-600", bg: "bg-emerald-50" },
  BOOKING_PAYMENT: { icon: Wallet, color: "text-blue-600", bg: "bg-blue-50" },
  ADMIN_CREDIT: { icon: ShieldCheck, color: "text-emerald-600", bg: "bg-emerald-50" },
  ADMIN_DEBIT: { icon: ShieldCheck, color: "text-amber-600", bg: "bg-amber-50" },
  REASSIGNMENT_CREDIT: { icon: Wallet, color: "text-emerald-600", bg: "bg-emerald-50" },
  FAILED: { icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
} as const;
type ToastType = keyof typeof TYPE_COPY;
const isToastType = (v: string): v is ToastType => v in TYPE_COPY;

export default function WalletNotificationToast({ event, onDismiss }: {
  event: WalletTxnEvent;
  onDismiss: () => void;
}) {
  const router = useRouter();
  const t = useTranslations("patient.walletToast");

  useEffect(() => {
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [event.id, event.status, onDismiss]);

  const key = event.status === "FAILED" ? "FAILED" : event.type;
  if (!isToastType(key)) return null;
  const copy = TYPE_COPY[key];
  const Icon = copy.icon;
  // The admin's note is free text from the DB — appended as-is.
  const values = { amount: String(event.amount), balance: String(event.balanceAfter), note: event.note ? ` ${event.note}` : "" };

  return createPortal(
    <div className="fixed bottom-36 sm:bottom-24 right-4 sm:right-6 z-50 w-[calc(100%-2rem)] max-w-sm animate-fade-in-up">
      <button
        onClick={() => { router.push("/patient/wallet"); onDismiss(); }}
        className="w-full text-left bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 flex items-start gap-3 hover:border-blue-200 transition-colors"
      >
        <div className={`w-9 h-9 rounded-xl ${copy.bg} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-4 h-4 ${copy.color}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">{t(`${key}.title`)}</p>
          <p className="text-xs text-slate-500 mt-0.5">{t(`${key}.message`, values)}</p>
        </div>
        <span
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          className="w-6 h-6 flex items-center justify-center rounded-full text-slate-300 hover:bg-slate-100 hover:text-slate-500 flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </span>
      </button>
    </div>,
    document.body
  );
}
