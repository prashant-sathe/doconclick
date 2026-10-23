"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, User as UserIcon, Clock } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import DoctorHeader from "@/components/doctor/DoctorHeader";
import DoctorMobileNav from "@/components/doctor/DoctorMobileNav";
import ChatThread from "@/components/ChatThread";
import { useTranslations } from "next-intl";

interface ChatAppointment {
  status: string;
  patientName: string | null;
  relation: string;
  patient: { name: string };
}

function patientLabel(a: ChatAppointment): string {
  return a.relation !== "Self" && a.patientName ? a.patientName : a.patient.name;
}

export default function DoctorChatPage() {
  const params = useParams<{ id: string }>();
  const t = useTranslations("doctorAccount.consult");
  const tRel = useTranslations("booking.common.relation");
  const relLabel = (r: string) => (tRel.has(r as "Self") ? tRel(r as "Self") : r);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [appt, setAppt] = useState<ChatAppointment | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.push(`/login?next=/doctor/chat/${params.id}`);
    if (!authLoading && user && user.role !== "DOCTOR" && user.role !== "STAFF") router.push("/login");
  }, [authLoading, user, router, params.id]);

  useEffect(() => {
    if (!user || (user.role !== "DOCTOR" && user.role !== "STAFF")) return;
    fetch(`/api/appointments/${params.id}`).then(async (r) => {
      if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? t("loadFailed")); return; }
      setAppt(await r.json());
    });
  }, [user, params.id, t]);

  if (authLoading || !user) {
    return <div className="min-h-screen gradient-surface flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
    </div>;
  }

  // Only a still-pending request has no chat yet; for every other status the
  // thread shows, and ChatThread explains when it's read-only
  // (src/lib/chatAccess.ts).
  const chatOpen = appt?.status !== "PENDING_APPROVAL";

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

          {error ? (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-400 text-center px-6">{error}</div>
          ) : !appt ? (
            <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
          ) : !chatOpen ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2">
              <Clock className="w-6 h-6 text-amber-400" />
              <p className="text-sm text-slate-500">
                {t("acceptToChat", { name: patientLabel(appt) })}
              </p>
            </div>
          ) : (
            <ChatThread appointmentId={params.id} meId={user.id} accent="teal" />
          )}
        </div>
      </div>
    </div>
  );
}
