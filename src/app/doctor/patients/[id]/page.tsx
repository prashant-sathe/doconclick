"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2, ArrowLeft, User, Droplets, AlertTriangle, Pill,
  Scissors, PhoneCall, CalendarClock, Star, Stethoscope, Paperclip,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import DoctorHeader from "@/components/doctor/DoctorHeader";
import DoctorMobileNav from "@/components/doctor/DoctorMobileNav";

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
  attachments: Attachment[];
  review: { rating: number; comment: string | null } | null;
}

interface PatientHistory {
  patient: {
    id: string;
    name: string;
    mobile: string;
    patientProfile: {
      age: number;
      gender: string;
      bloodGroup: string | null;
      allergies: string | null;
      chronicDiseases: string | null;
      medications: string | null;
      surgeries: string | null;
      emergencyContactName: string | null;
      emergencyContactPhone: string | null;
    } | null;
  };
  appointments: HistoryAppointment[];
}

export default function DoctorPatientHistory() {
  const params = useParams<{ id: string }>();
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
    fetch(`/api/doctors/patients/${params.id}`)
      .then(async (r) => {
        if (!r.ok) { setError((await r.json()).error ?? "Could not load patient history."); return; }
        setData(await r.json());
      })
      .finally(() => setLoading(false));
  }, [user, params.id]);

  if (authLoading || loading || !user) {
    return <div className="min-h-screen gradient-surface flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
    </div>;
  }

  const p = data?.patient.patientProfile;

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
                  {data.patient.name.charAt(0)}
                </div>
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900">{data.patient.name}</h1>
                  <p className="text-sm text-slate-500">{data.patient.mobile}{p ? ` · ${p.age} yrs · ${p.gender}` : ""}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-red-50 rounded-xl p-3">
                  <Droplets className="w-3.5 h-3.5 text-red-500 mb-1" />
                  <p className="text-[10px] font-semibold text-slate-500 uppercase">Blood Group</p>
                  <p className="text-sm font-bold text-slate-800">{p?.bloodGroup ?? "—"}</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-3">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mb-1" />
                  <p className="text-[10px] font-semibold text-slate-500 uppercase">Allergies</p>
                  <p className="text-sm font-bold text-slate-800 truncate">{p?.allergies ?? "—"}</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-3">
                  <Pill className="w-3.5 h-3.5 text-purple-500 mb-1" />
                  <p className="text-[10px] font-semibold text-slate-500 uppercase">Chronic</p>
                  <p className="text-sm font-bold text-slate-800 truncate">{p?.chronicDiseases ?? "—"}</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-3">
                  <Scissors className="w-3.5 h-3.5 text-blue-500 mb-1" />
                  <p className="text-[10px] font-semibold text-slate-500 uppercase">Surgeries</p>
                  <p className="text-sm font-bold text-slate-800 truncate">{p?.surgeries ?? "—"}</p>
                </div>
              </div>

              {(p?.emergencyContactName || p?.emergencyContactPhone) && (
                <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                  <PhoneCall className="w-3.5 h-3.5" /> Emergency: {p.emergencyContactName} {p.emergencyContactPhone}
                </div>
              )}
            </div>

            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <CalendarClock className="w-4 h-4" /> Visit History with You ({data.appointments.length})
            </h2>
            <div className="space-y-3">
              {data.appointments.map((a) => (
                <div key={a.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Stethoscope className="w-4 h-4 text-teal-500" />
                      <span className="font-semibold text-slate-800 text-sm">
                        {new Date(a.scheduledAt).toLocaleDateString("en-IN", { dateStyle: "medium" })} · {a.consultType}
                      </span>
                    </div>
                    <span className="badge badge-gray">{a.status}</span>
                  </div>
                  <p className="text-sm text-slate-600 mb-2">{a.symptoms}</p>
                  {a.doctorNotes && <p className="text-xs text-slate-500 mb-2"><strong>Notes:</strong> {a.doctorNotes}</p>}
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
                          <Paperclip className="w-3 h-3" /> {att.fileName ?? `Attachment ${i + 1}`}
                        </a>
                      ))}
                    </div>
                  )}
                  {a.review && (
                    <div className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                      <Star className="w-3 h-3 fill-amber-400" /> Rated {a.review.rating}/5{a.review.comment ? ` — "${a.review.comment}"` : ""}
                    </div>
                  )}
                </div>
              ))}
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
