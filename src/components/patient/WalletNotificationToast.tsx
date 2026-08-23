"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Wallet, XCircle, ShieldCheck, X } from "lucide-react";
import type { WalletTxnEvent } from "@/hooks/useWalletNotifications";

const AUTO_DISMISS_MS = 6000;

const TYPE_COPY: Record<string, { title: string; message: (e: WalletTxnEvent) => string; icon: typeof Wallet; color: string; bg: string }> = {
  TOPUP: { title: "Wallet topped up!", message: (e) => `₹${e.amount} added. New balance ₹${e.balanceAfter}.`, icon: Wallet, color: "text-emerald-600", bg: "bg-emerald-50" },
  BOOKING_PAYMENT: { title: "Wallet debited", message: (e) => `₹${e.amount} paid for an appointment. New balance ₹${e.balanceAfter}.`, icon: Wallet, color: "text-blue-600", bg: "bg-blue-50" },
  ADMIN_CREDIT: { title: "Wallet credited by admin", message: (e) => `₹${e.amount} added.${e.note ? ` ${e.note}` : ""} New balance ₹${e.balanceAfter}.`, icon: ShieldCheck, color: "text-emerald-600", bg: "bg-emerald-50" },
  ADMIN_DEBIT: { title: "Wallet debited by admin", message: (e) => `₹${e.amount} deducted.${e.note ? ` ${e.note}` : ""} New balance ₹${e.balanceAfter}.`, icon: ShieldCheck, color: "text-amber-600", bg: "bg-amber-50" },
};

const FAILED_COPY = { title: "Wallet top-up failed", message: (e: WalletTxnEvent) => `Your top-up of ₹${e.amount} didn't go through.`, icon: XCircle, color: "text-red-600", bg: "bg-red-50" };

export default function WalletNotificationToast({ event, onDismiss }: {
  event: WalletTxnEvent;
  onDismiss: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [event.id, event.status, onDismiss]);

  const copy = event.status === "FAILED" ? FAILED_COPY : TYPE_COPY[event.type];
  if (!copy) return null;
  const Icon = copy.icon;

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
          <p className="text-sm font-bold text-slate-900">{copy.title}</p>
          <p className="text-xs text-slate-500 mt-0.5">{copy.message(event)}</p>
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
