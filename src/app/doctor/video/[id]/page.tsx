"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, User as UserIcon, Clock, CreditCard } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import DoctorHeader from "@/components/doctor/DoctorHeader";
import DoctorMobileNav from "@/components/doctor/DoctorMobileNav";
import VideoCallRoom from "@/components/VideoCallRoom";
import { VIDEO_UNLOCK_DELAY_SECONDS } from "@/lib/videoCall";

interface VideoAppointment {
  status: string;
  consultType: string;
  paymentStatus: string;
  paidAt: string | null;
  patientName: string | null;
  relation: string;
  patient: { name: string };
}

const POLL_MS = 3000;

function patientLabel(a: VideoAppointment): string {
  return a.relation !== "Self" && a.patientName ? a.patientName : a.patient.name;
}

export default function DoctorVideoCallPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [appt, setAppt] = useState<VideoAppointment | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!authLoading && !user) router.push(`/login?next=/doctor/video/${params.id}`);
    if (!authLoading && user && user.role !== "DOCTOR") router.push("/login");
  }, [authLoading, user, router, params.id]);

  useEffect(() => {
    if (!user || user.role !== "DOCTOR") return;
    const load = () => fetch(`/api/appointments/${params.id}`).then(async (r) => {
      if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? "Could not load this appointment."); return; }
      setAppt(await r.json());
    });
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [user, params.id]);

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

  return (
    <div className="min-h-screen gradient-surface pb-24 sm:pb-10">
      <DoctorHeader />
      <DoctorMobileNav />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <Link href="/doctor/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden h-[75vh] flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 flex-shrink-0">
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
              <UserIcon className="w-5 h-5 text-teal-600" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-slate-900 truncate">{appt ? patientLabel(appt) : "…"}</p>
              {appt && appt.relation !== "Self" && (
                <p className="text-xs text-slate-400 truncate">{appt.relation} of {appt.patient.name}</p>
              )}
            </div>
          </div>

          {error ? (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-400 text-center px-6">{error}</div>
          ) : !appt ? (
            <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
          ) : !requestOpen ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2">
              <Clock className="w-6 h-6 text-amber-400" />
              <p className="text-sm text-slate-500">Accept this request to start a video call with {patientLabel(appt)}.</p>
            </div>
          ) : !paid ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2">
              <CreditCard className="w-6 h-6 text-amber-400" />
              <p className="text-sm text-slate-500">Waiting for {patientLabel(appt)} to complete payment.</p>
            </div>
          ) : unlockRemainingSec > 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2">
              <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
              <p className="text-sm text-slate-500">Video call unlocking in {unlockRemainingSec}s…</p>
            </div>
          ) : (
            <VideoCallRoom appointmentId={params.id} accent="teal" leaveHref="/doctor/dashboard" />
          )}
        </div>
      </div>
    </div>
  );
}
