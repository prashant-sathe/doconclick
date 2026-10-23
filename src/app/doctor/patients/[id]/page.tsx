"use client";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Loader2, ArrowLeft, User, Droplets, AlertTriangle, Pill, Scissors, PhoneCall, CalendarClock, Star, Stethoscope, Paperclip, Users, Home, Building2, Video, Activity, FileText,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import VitalsCharts, { type VitalReadingRow } from "@/components/VitalsCharts";
import DoctorHeader from "@/components/doctor/DoctorHeader";
import DoctorMobileNav from "@/components/doctor/DoctorMobileNav";
import { computeBMI, bmiCategoryClasses } from "@/lib/bmi";
import PrescriptionViewer from "@/components/doctor/PrescriptionViewer";
import { useLocale, useTranslations } from "next-intl";
import { formattingLocale } from "@/lib/appLanguage";

interface Medicine {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string | null;
}

interface Attachment {
  id: string;
  url: string;
  fileName: string | null;
}

interface HistoryAppointment {
  id: string;
  status: string;
  consultType: string;
  symptoms: string;
  amount: number;
  doctorNotes: string | null;
  scheduledAt: string;
  medicines: Medicine[];
  tests: { id: string }[];
  attachments: Attachment[];
  review: { rating: number; comment: string | null } | null;
}

interface MedicalInfo {
  age: number | null;
  gender: string | null;
  bloodGroup: string | null;
  height: number | null;
  weight: number | null;
  allergies: string | null;
  chronicDiseases: string | null;
  medications: string | null;
  surgeries: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
}

interface PatientHistory {
  patient: {
    id: string;
    name: string;
    mobile: string;
    patientProfile: MedicalInfo | null;
  };
  dependent: (MedicalInfo & { name: string; relation: string }) | null;
  appointments: HistoryAppointment[];
}

const TYPE_ICON: Record<string, React.ElementType> = { HOME: Home, CLINIC: Building2, VIDEO: Video };

// Labels are message keys (doctorAccount.patientHistory.status).
const STATUS_KEYS = ["PENDING_APPROVAL", "SCHEDULED", "COMPLETED", "CANCELLED", "REJECTED", "EXPIRED", "NO_SHOW"] as const;
const isStatusKey = (s: string): s is (typeof STATUS_KEYS)[number] => (STATUS_KEYS as readonly string[]).includes(s);
const CONSULT_TYPES = ["CLINIC", "HOME", "VIDEO"] as const;
const isConsultType = (s: string): s is (typeof CONSULT_TYPES)[number] => (CONSULT_TYPES as readonly string[]).includes(s);

const STATUS_BADGE: Record<string, string> = {
  PENDING_APPROVAL: "badge badge-warning",
  SCHEDULED: "badge badge-info",
  COMPLETED: "badge badge-success",
  CANCELLED: "badge badge-gray",
  REJECTED: "badge badge-danger",
  EXPIRED: "badge badge-gray",
  NO_SHOW: "badge badge-warning",
};

function DoctorPatientHistoryInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const dependentId = searchParams.get("dependentId");
  const t = useTranslations("doctorAccount.patientHistory");
  const tType = useTranslations("doctorAccount.analytics.type");
  const tRel = useTranslations("booking.common.relation");
  const tGender = useTranslations("booking.common.gender");
  const relLabel = (r: string) => (tRel.has(r as "Self") ? tRel(r as "Self") : r);
  const genderLabel = (g: string) => (tGender.has(g as "Male") ? tGender(g as "Male") : g);
  const locale = formattingLocale(useLocale());
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<PatientHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Consultation whose prescription is open in the viewer.
  const [rxFor, setRxFor] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?next=/doctor/dashboard");
    if (!authLoading && user && user.role !== "DOCTOR") router.push("/login");
  }, [authLoading, user, router]);

  const [vitals, setVitals] = useState<VitalReadingRow[] | null>(null);
  const userId = user?.id;
  const userRole = user?.role;
  useEffect(() => {
    if (!user?.id || user.role !== "DOCTOR") return;
    fetch(`/api/vitals?patientId=${params.id}${dependentId ? `&dependentId=${dependentId}` : ""}&limit=120`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setVitals)
      .catch(() => setVitals([]));
  }, [user?.id, user?.role, params.id, dependentId]);

  useEffect(() => {
    if (!userId || userRole !== "DOCTOR") return;
    const url = dependentId
      ? `/api/doctors/patients/${params.id}?dependentId=${dependentId}`
      : `/api/doctors/patients/${params.id}`;
    fetch(url)
      .then(async (r) => {
        if (!r.ok) { setError((await r.json()).error ?? t("loadFailed")); return; }
        setData(await r.json());
      })
      .finally(() => setLoading(false));
  }, [userId, userRole, params.id, dependentId, t]);

  if (authLoading || loading || !user) {
    return <div className="min-h-screen gradient-surface flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
    </div>;
  }

  // Viewing a family member's records shows only their own info — never the
  // account holder's own medical data — per the scoped-history requirement.
  const subject = data?.dependent ?? data?.patient.patientProfile ?? null;
  const displayName = data?.dependent?.name ?? data?.patient.name ?? "";
  const bmi = subject?.height && subject?.weight ? computeBMI(subject.height, subject.weight) : null;

  return (
    <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
      <DoctorHeader />
      <DoctorMobileNav />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <Link href="/doctor/dashboard" className="btn-ghost gap-1.5 text-sm mb-6">
          <ArrowLeft className="w-4 h-4" /> {t("backToDashboard")}
        </Link>

        {error ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400">{error}</div>
        ) : data ? (
          <>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-2xl bg-teal-500 flex items-center justify-center text-white text-xl font-extrabold">
                  {displayName.charAt(0)}
                </div>
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2 flex-wrap">
                    {displayName}
                    {data.dependent && (
                      <span className="badge badge-gray text-[10px]"><Users className="w-3 h-3" /> {t("relationOf", { relation: relLabel(data.dependent.relation), name: data.patient.name })}</span>
                    )}
                  </h1>
                  <p className="text-sm text-slate-500">
                    {data.patient.mobile}
                    {subject?.age ? ` · ${t("age", { age: subject.age })}` : ""}{subject?.gender ? ` · ${genderLabel(subject.gender)}` : ""}
                    {subject?.height ? ` · ${subject.height}cm` : ""}{subject?.weight ? ` · ${subject.weight}kg` : ""}
                  </p>
                </div>
              </div>

              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">{t("snapshot")}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-red-50 rounded-xl p-3">
                  <Droplets className="w-3.5 h-3.5 text-red-500 mb-1" />
                  <p className="text-[10px] font-semibold text-slate-500 uppercase">{t("bloodGroup")}</p>
                  <p className="text-sm font-bold text-slate-800">{subject?.bloodGroup ?? "—"}</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-3">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mb-1" />
                  <p className="text-[10px] font-semibold text-slate-500 uppercase">{t("allergies")}</p>
                  <p className="text-sm font-bold text-slate-800 truncate">{subject?.allergies ?? "—"}</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-3">
                  <Pill className="w-3.5 h-3.5 text-purple-500 mb-1" />
                  <p className="text-[10px] font-semibold text-slate-500 uppercase">{t("chronic")}</p>
                  <p className="text-sm font-bold text-slate-800 truncate">{subject?.chronicDiseases ?? "—"}</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-3">
                  <Scissors className="w-3.5 h-3.5 text-blue-500 mb-1" />
                  <p className="text-[10px] font-semibold text-slate-500 uppercase">{t("surgeries")}</p>
                  <p className="text-sm font-bold text-slate-800 truncate">{subject?.surgeries ?? "—"}</p>
                </div>
                {bmi && (
                  <div className={`rounded-xl p-3 ${bmiCategoryClasses(bmi.category)}`}>
                    <p className="text-[10px] font-semibold uppercase opacity-70">BMI</p>
                    <p className="text-sm font-bold">{bmi.value}</p>
                    <p className="text-[10px] font-semibold">{t(`bmi.${bmi.category}`)}</p>
                  </div>
                )}
              </div>

              {(subject?.emergencyContactName || subject?.emergencyContactPhone) && (
                <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                  <PhoneCall className="w-3.5 h-3.5" /> {t("emergency")} {subject.emergencyContactName} {subject.emergencyContactPhone}
                </div>
              )}
            </div>

            {vitals && vitals.length > 0 && (
              <div className="mb-6">
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Activity className="w-4 h-4" /> {t("vitals", { count: vitals.length })}
                </h2>
                <VitalsCharts readings={vitals} />
              </div>
            )}

            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <CalendarClock className="w-4 h-4" /> {t("visitHistory", { count: data.appointments.length })}
            </h2>
            <div className="space-y-3">
              {data.appointments.map((a) => {
                const Icon = TYPE_ICON[a.consultType] ?? Stethoscope;
                return (
                <div key={a.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-teal-500" />
                      <span className="font-semibold text-slate-800 text-sm">
                        {new Date(a.scheduledAt).toLocaleDateString(locale, { dateStyle: "medium", timeZone: "Asia/Kolkata" })} · {isConsultType(a.consultType) ? tType(a.consultType) : a.consultType}
                      </span>
                    </div>
                    <span className={STATUS_BADGE[a.status] ?? "badge badge-gray"}>{isStatusKey(a.status) ? t(`status.${a.status}`) : a.status}</span>
                  </div>
                  <p className="text-sm text-slate-600 mb-2">{a.symptoms}</p>
                  {a.doctorNotes && <p className="text-xs text-slate-500 mb-2"><strong>{t("notes")}</strong> {a.doctorNotes}</p>}
                  {a.medicines.length > 0 && (
                    <div className="text-xs text-slate-500 space-y-0.5 mb-2">
                      {a.medicines.map((m) => (
                        <div key={m.id}>• {m.name} — {[m.dosage, m.frequency, m.duration].filter(Boolean).join(" · ")}</div>
                      ))}
                    </div>
                  )}
                  {a.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {a.attachments.map((att, i) => (
                        <a
                          key={att.id}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-teal-600 bg-teal-50 border border-teal-100 rounded-lg px-2 py-1 hover:bg-teal-100"
                        >
                          <Paperclip className="w-3 h-3" /> {att.fileName ?? t("attachment", { n: i + 1 })}
                        </a>
                      ))}
                    </div>
                  )}
                  {/* The prescription exactly as issued to the patient — same document they download. */}
                  {a.status === "COMPLETED" && (a.medicines.length > 0 || a.tests.length > 0 || !!a.doctorNotes) && (
                    <div className="mb-2">
                      <button type="button" onClick={() => setRxFor(a.id)} className="btn-secondary py-2 px-3 text-xs">
                        <FileText className="w-3.5 h-3.5" /> {t("prescription")}
                      </button>
                    </div>
                  )}
                  {a.review && (
                    <div className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                      <Star className="w-3 h-3 fill-amber-400" /> {t("rated", { rating: a.review.rating })}{a.review.comment ? ` — "${a.review.comment}"` : ""}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center py-20">
            <User className="w-8 h-8 text-slate-300" />
          </div>
        )}
      </div>
      {rxFor && <PrescriptionViewer appointmentId={rxFor} patientId={params.id} onClose={() => setRxFor(null)} />}
    </div>
  );
}

export default function DoctorPatientHistory() {
  return (
    <Suspense fallback={
      <div className="min-h-screen gradient-surface flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
      </div>
    }>
      <DoctorPatientHistoryInner />
    </Suspense>
  );
}
