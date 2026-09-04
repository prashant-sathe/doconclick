"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Clock, Car, MapPinCheck, X } from "lucide-react";
import type { AppointmentStatusEvent } from "@/hooks/usePatientNotifications";
import { formatDoctorName } from "@/lib/utils";

const AUTO_DISMISS_MS = 6000;

const EVENT_COPY: Record<string, { title: string; message: (doctor: string) => string; icon: typeof CheckCircle2; color: string; bg: string }> = {
  SCHEDULED: { title: "Appointment confirmed!", message: (d) => `${d} accepted your request.`, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
  ON_THE_WAY: { title: "Your doctor is on the way!", message: (d) => `${d} has started the journey to you.`, icon: Car, color: "text-blue-600", bg: "bg-blue-50" },
  ARRIVED: { title: "Your doctor has arrived!", message: (d) => `${d} is here for your visit.`, icon: MapPinCheck, color: "text-emerald-600", bg: "bg-emerald-50" },
  REJECTED: { title: "Request declined", message: (d) => `${d} was unable to accept your request.`, icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
  EXPIRED: { title: "No response from doctor", message: (d) => `${d} didn't respond in time.`, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
  COMPLETED: { title: "Consultation completed", message: (d) => `Your consultation with ${d} is complete.`, icon: CheckCircle2, color: "text-blue-600", bg: "bg-blue-50" },
  CANCELLED: { title: "Appointment cancelled", message: (d) => `Your appointment with ${d} was cancelled.`, icon: XCircle, color: "text-slate-500", bg: "bg-slate-100" },
};

export default function PatientNotificationToast({ event, onDismiss }: {
  event: AppointmentStatusEvent;
  onDismiss: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [event.id, event.event, onDismiss]);

  const copy = EVENT_COPY[event.event];
  if (!copy) return null;
  const Icon = copy.icon;

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
          <p className="text-sm font-bold text-slate-900">{copy.title}</p>
          <p className="text-xs text-slate-500 mt-0.5">{copy.message(formatDoctorName(event.doctor.name))}</p>
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
