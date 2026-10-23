"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, User as UserIcon, Clock, CreditCard, Video } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import DoctorHeader from "@/components/doctor/DoctorHeader";
import DoctorMobileNav from "@/components/doctor/DoctorMobileNav";
import VideoCallRoom from "@/components/VideoCallRoom";
import { VIDEO_UNLOCK_DELAY_SECONDS, videoJoinWindow } from "@/lib/videoCall";
import { useVideoAppointment } from "@/lib/useVideoAppointment";
import { useLocale, useTranslations } from "next-intl";
import { formattingLocale } from "@/lib/appLanguage";

interface VideoAppointment {
  status: string;
  consultType: string;
  paymentStatus: string;
  paidAt: string | null;
  scheduledAt: string;
  createdAt: string;
  acceptedAt: string | null;
  patientName: string | null;
  relation: string;
  patient: { name: string };
}

function patientLabel(a: VideoAppointment): string {
  return a.relation !== "Self" && a.patientName ? a.patientName : a.patient.name;
}

export default function DoctorVideoCallPage() {
  const params = useParams<{ id: string }>();
  const t = useTranslations("doctorAccount.consult");
  const tRel = useTranslations("booking.common.relation");
  const relLabel = (r: string) => (tRel.has(r as "Self") ? tRel(r as "Self") : r);
  const locale = formattingLocale(useLocale());
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [now, setNow] = useState(() => Date.now());
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push(`/login?next=/doctor/video/${params.id}`);
    if (!authLoading && user && user.role !== "DOCTOR") router.push("/login");
  }, [authLoading, user, router, params.id]);

  // Tolerates a failed poll — never swaps a live call out for an error.
  const { appt, error, connectionWarning } = useVideoAppointment<VideoAppointment>(params.id, user?.role === "DOCTOR");

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  if (authLoading || !user) {
    return <div className="min-h-screen gradient-surface flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
    </div>;
  }

  const requestOpen = appt?.consultType === "VIDEO" && appt?.status === "SCHEDULED";
  const paid = appt?.paymentStatus === "PAID";
  const unlockAt = appt?.paidAt ? new Date(appt.paidAt).getTime() + VIDEO_UNLOCK_DELAY_SECONDS * 1000 : 0;
  const unlockRemainingSec = Math.max(0, Math.ceil((unlockAt - now) / 1000));
  // Same window the video-token route enforces.
  const joinWindow = appt ? videoJoinWindow(appt) : null;
  const fmtTime = (ms: number) => new Date(ms).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

  return (
    <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
      <DoctorHeader />
      <DoctorMobileNav />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <Link href="/doctor/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> {t("backToDashboard")}
        </Link>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden h-[75vh] flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 flex-shrink-0">
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
              <UserIcon className="w-5 h-5 text-teal-600" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-slate-900 truncate">{appt ? patientLabel(appt) : "…"}</p>
              {appt && appt.relation !== "Self" && (
                <p className="text-xs text-slate-400 truncate">{t("relationOf", { relation: relLabel(appt.relation), name: appt.patient.name })}</p>
              )}
            </div>
          </div>

          {connectionWarning && (
            <div className="px-5 py-1.5 bg-amber-50 text-amber-700 text-[11px] font-semibold text-center flex-shrink-0">
              {t("unstable")}
            </div>
          )}
          {error && !appt ? (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-400 text-center px-6">{error}</div>
          ) : !appt ? (
            <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
          ) : !requestOpen ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2">
              <Clock className="w-6 h-6 text-amber-400" />
              <p className="text-sm text-slate-500">{t("acceptToVideo", { name: patientLabel(appt) })}</p>
            </div>
          ) : !paid ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2">
              <CreditCard className="w-6 h-6 text-amber-400" />
              <p className="text-sm text-slate-500">{t("waitingPayment", { name: patientLabel(appt) })}</p>
            </div>
          ) : unlockRemainingSec > 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2">
              <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
              <p className="text-sm text-slate-500">{t("unlocking", { seconds: unlockRemainingSec })}</p>
              <p className="text-xs text-slate-400">
                {t("startsAt", { time: new Date(unlockAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) })}
              </p>
            </div>
          ) : !started && joinWindow && now < joinWindow.opensAt ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2">
              <Clock className="w-6 h-6 text-amber-400" />
              <p className="text-sm text-slate-500">{t("opensAt", { time: fmtTime(joinWindow.opensAt) })}</p>
              <p className="text-xs text-slate-400">{t("joinEarly")}</p>
            </div>
          ) : !started && joinWindow && now > joinWindow.closesAt ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2">
              <Clock className="w-6 h-6 text-slate-400" />
              <p className="text-sm text-slate-500">{t("passed")}</p>
            </div>
          ) : !started ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-3">
              <div className="w-14 h-14 rounded-full bg-teal-50 flex items-center justify-center">
                <Video className="w-6 h-6 text-teal-600" />
              </div>
              <p className="text-sm text-slate-700 font-semibold">{t("ready", { name: patientLabel(appt) })}</p>
              <p className="text-xs text-slate-400 max-w-xs">{t("cameraMic")}</p>
              <button onClick={() => setStarted(true)} className="btn-primary py-2.5 px-5 text-sm mt-1">
                <Video className="w-4 h-4" /> {t("startVideo")}
              </button>
            </div>
          ) : (
            <VideoCallRoom appointmentId={params.id} accent="teal" leaveHref="/doctor/dashboard" />
          )}
        </div>
      </div>
    </div>
  );
}
