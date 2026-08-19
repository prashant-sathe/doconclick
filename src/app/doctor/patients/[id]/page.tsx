"use client";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Loader2, ArrowLeft, User, Droplets, AlertTriangle, Pill,
  Scissors, PhoneCall, CalendarClock, Star, Paperclip, Users,
  Home, Building2, Video, Stethoscope, ClipboardList,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import DoctorHeader from "@/components/doctor/DoctorHeader";
import DoctorMobileNav from "@/components/doctor/DoctorMobileNav";
import ConsultationTimer from "@/components/ConsultationTimer";
import { computeBMI, bmiCategoryClasses } from "@/lib/bmi";

const TYPE_ICON: Record<string, React.ElementType> = { HOME: Home, CLINIC: Building2, VIDEO: Video };

const STATUS_BADGE: Record<string, string> = {
  COMPLETED: "badge badge-success",
  SCHEDULED: "badge badge-info",
  CANCELLED: "badge badge-gray",
  REJECTED: "badge badge-danger",
  EXPIRED: "badge badge-gray",
  PENDING_APPROVAL: "badge badge-warning",
};

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
  otpVerifiedAt: string | null;
  completedAt: string | null;
  medicines: Medicine[];
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

function DoctorPatientHistoryInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const dependentId = searchParams.get("dependentId");
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<PatientHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?next=/doctor/dashboard");
    if (!authLoading && user && user.role !== "DOCTOR") router.push("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user || user.role !== "DOCTOR") return;
    const url = dependentId
      ? `/api/doctors/patients/${params.id}?dependentId=${dependentId}`
      : `/api/doctors/patients/${params.id}`;
    fetch(url)
      .then(async (r) => {
        if (!r.ok) { setError((await r.json()).error ?? "Could not load patient history."); return; }
        setData(await r.json());
      })
      .finally(() => setLoading(false));
  }, [user, params.id, dependentId]);

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
    <div className="min-h-screen gradient-surface pb-24 sm:pb-10">
      <DoctorHeader />
      <DoctorMobileNav />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <Link href="/doctor/dashboard" className="btn-ghost gap-1.5 text-sm mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
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
                      <span className="badge badge-gray text-[10px]"><Users className="w-3 h-3" /> {data.dependent.relation} of {data.patient.name}</span>
                    )}
                  </h1>
                  <p className="text-sm text-slate-500">
                    {data.patient.mobile}
                    {subject?.age ? ` · ${subject.age} yrs` : ""}{subject?.gender ? ` · ${subject.gender}` : ""}
                    {subject?.height ? ` · ${subject.height}cm` : ""}{subject?.weight ? ` · ${subject.weight}kg` : ""}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-red-50 rounded-xl p-3">
                  <Droplets className="w-3.5 h-3.5 text-red-500 mb-1" />
                  <p className="text-[10px] font-semibold text-slate-500 uppercase">Blood Group</p>
                  <p className="text-sm font-bold text-slate-800">{subject?.bloodGroup ?? "—"}</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-3">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mb-1" />
                  <p className="text-[10px] font-semibold text-slate-500 uppercase">Allergies</p>
                  <p className="text-sm font-bold text-slate-800 truncate">{subject?.allergies ?? "—"}</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-3">
                  <Pill className="w-3.5 h-3.5 text-purple-500 mb-1" />
                  <p className="text-[10px] font-semibold text-slate-500 uppercase">Chronic</p>
                  <p className="text-sm font-bold text-slate-800 truncate">{subject?.chronicDiseases ?? "—"}</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-3">
                  <Scissors className="w-3.5 h-3.5 text-blue-500 mb-1" />
                  <p className="text-[10px] font-semibold text-slate-500 uppercase">Surgeries</p>
                  <p className="text-sm font-bold text-slate-800 truncate">{subject?.surgeries ?? "—"}</p>
                </div>
                {bmi && (
                  <div className={`rounded-xl p-3 ${bmiCategoryClasses(bmi.category)}`}>
                    <p className="text-[10px] font-semibold uppercase opacity-70">BMI</p>
                    <p className="text-sm font-bold">{bmi.value}</p>
                    <p className="text-[10px] font-semibold">{bmi.category}</p>
                  </div>
                )}
              </div>

              {(subject?.emergencyContactName || subject?.emergencyContactPhone) && (
                <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                  <PhoneCall className="w-3.5 h-3.5" /> Emergency: {subject.emergencyContactName} {subject.emergencyContactPhone}
                </div>
              )}
            </div>

            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <CalendarClock className="w-4 h-4" /> Visit History with You ({data.appointments.length})
            </h2>
            <div className="space-y-3">
              {data.appointments.map((a) => {
                const VisitIcon = TYPE_ICON[a.consultType] ?? Stethoscope;
                return (
                  <div key={a.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                          <VisitIcon className="w-4.5 h-4.5 text-teal-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 text-sm">
                            {new Date(a.scheduledAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                          </p>
                          <p className="text-xs text-slate-400">{a.consultType} · ₹{a.amount}</p>
                        </div>
                      </div>
                      <span className={STATUS_BADGE[a.status] ?? "badge badge-gray"}>{a.status.replace("_", " ")}</span>
                    </div>

                    <p className="text-sm text-slate-600 mb-2">{a.symptoms}</p>
                    {a.doctorNotes && (
                      <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-600 mb-2">
                        <span className="font-semibold text-slate-700">Notes: </span>{a.doctorNotes}
                      </div>
                    )}

                    {a.medicines.length > 0 && (
                      <div className="mb-2">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                          <ClipboardList className="w-3 h-3" /> Prescription
                        </div>
                        <div className="space-y-1">
                          {a.medicines.map((m) => (
                            <div key={m.id} className="flex items-center gap-2 bg-purple-50/60 rounded-lg px-2.5 py-1.5 text-xs">
                              <Pill className="w-3 h-3 text-purple-500 flex-shrink-0" />
                              <span className="font-semibold text-slate-700">{m.name}</span>
                              <span className="text-slate-500">{[m.dosage, m.frequency, m.duration].filter(Boolean).join(" · ")}</span>
                            </div>
                          ))}
                        </div>
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
                            <Paperclip className="w-3 h-3" /> {att.fileName ?? `Attachment ${i + 1}`}
                          </a>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between flex-wrap gap-2 mt-1">
                      {a.otpVerifiedAt && a.completedAt ? (
                        <ConsultationTimer startedAt={a.otpVerifiedAt} endedAt={a.completedAt} />
                      ) : <span />}
                      {a.review && (
                        <div className="text-xs text-amber-600 flex items-center gap-1">
                          <Star className="w-3 h-3 fill-amber-400" /> Rated {a.review.rating}/5{a.review.comment ? ` — "${a.review.comment}"` : ""}
                        </div>
                      )}
                    </div>
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
