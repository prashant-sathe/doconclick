"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Clock, Car, MapPinCheck, X } from "lucide-react";
import type { AppointmentStatusEvent } from "@/hooks/usePatientNotifications";
import { formatProviderName } from "@/lib/utils";
import { useTranslations } from "next-intl";

const AUTO_DISMISS_MS = 6000;

// Title/message copy lives in messages/<locale>/patient.json (appointmentToast.<event>).
const EVENT_COPY = {
  SCHEDULED: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
  ON_THE_WAY: { icon: Car, color: "text-blue-600", bg: "bg-blue-50" },
  ARRIVED: { icon: MapPinCheck, color: "text-emerald-600", bg: "bg-emerald-50" },
  REJECTED: { icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
  EXPIRED: { icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
  COMPLETED: { icon: CheckCircle2, color: "text-blue-600", bg: "bg-blue-50" },
  CANCELLED: { icon: XCircle, color: "text-slate-500", bg: "bg-slate-100" },
} as const;
type ToastEvent = keyof typeof EVENT_COPY;
const isToastEvent = (v: string): v is ToastEvent => v in EVENT_COPY;

export default function PatientNotificationToast({ event, onDismiss }: {
  event: AppointmentStatusEvent;
  onDismiss: () => void;
}) {
  const router = useRouter();
  const t = useTranslations("patient.appointmentToast");

  useEffect(() => {
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [event.id, event.event, onDismiss]);

  if (!isToastEvent(event.event)) return null;
  const key = event.event;
  const copy = EVENT_COPY[key];
  const Icon = copy.icon;
  const provider = event.providerType === "NURSE" ? "NURSE" : "DOCTOR";
  const name = formatProviderName(event.doctor.name, event.providerType);

  return createPortal(
    <div className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-50 w-[calc(100%-2rem)] max-w-sm animate-fade-in-up">
      <button
        onClick={() => { router.push("/patient/appointments"); onDismiss(); }}
        className="w-full text-left bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 flex items-start gap-3 hover:border-blue-200 transition-colors"
      >
        <div className={`w-9 h-9 rounded-xl ${copy.bg} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-4 h-4 ${copy.color}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">{t(`${key}.title`, { provider })}</p>
          <p className="text-xs text-slate-500 mt-0.5">{t(`${key}.message`, { name })}</p>
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
