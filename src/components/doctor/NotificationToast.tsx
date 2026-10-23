"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Bell, X } from "lucide-react";
import type { PendingRequest } from "@/hooks/useDoctorNotifications";
import { useTranslations } from "next-intl";

const CONSULT_TYPES = ["CLINIC", "HOME", "VIDEO"] as const;
const isConsultType = (v: string): v is (typeof CONSULT_TYPES)[number] => (CONSULT_TYPES as readonly string[]).includes(v);

const AUTO_DISMISS_MS = 6000;

// Also used by the nurse header (href "/nurse/dashboard").
export default function NotificationToast({ request, onDismiss, href = "/doctor/dashboard" }: {
  request: PendingRequest;
  onDismiss: () => void;
  href?: string;
}) {
  const router = useRouter();
  const t = useTranslations("shared.requestToast");
  const tb = useTranslations("booking.common");

  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [request.id, onDismiss]);

  const patientLabel = request.relation !== "Self" && request.patientName ? request.patientName : request.patient.name;

  return createPortal(
    <div className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-50 w-[calc(100%-2rem)] max-w-sm animate-fade-in-up">
      <button
        onClick={() => { router.push(href); onDismiss(); }}
        className="w-full text-left bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 flex items-start gap-3 hover:border-teal-200 transition-colors"
      >
        <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
          <Bell className="w-4 h-4 text-teal-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">{request.serviceName ? t("newVisit") : t("newAppointment")}</p>
          <p className="text-xs text-slate-500 mt-0.5">{patientLabel} · {request.serviceName ?? (isConsultType(request.consultType) ? tb(`consultType.${request.consultType}`) : request.consultType)}</p>
          <p className="text-xs text-slate-400 mt-0.5 truncate">{request.symptoms}</p>
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
