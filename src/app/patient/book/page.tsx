"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Stethoscope, MapPin, Video, Home, Building2, Loader2, CheckCircle, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";

interface Doctor {
  id: string;
  name: string;
  doctorProfile: {
    specialty: string;
    experience: number;
    consultFee: number;
    homeVisitFee: number;
    availability: string;
  } | null;
}

const TYPES = [
  { id: "CLINIC", label: "Clinic Visit", icon: Building2 },
  { id: "HOME",   label: "Home Visit",   icon: Home },
  { id: "VIDEO",  label: "Video Call",   icon: Video },
];

export default function PatientBook() {
  const { user, logout, loading: authLoading } = useAuth();
  const router = useRouter();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [form, setForm] = useState({ doctorId: "", symptoms: "", consultType: "CLINIC" });
  const [loading, setLoading] = useState(false);
  const [booked, setBooked] = useState(false);
  const [fee, setFee] = useState(0);
  const [appointmentId, setAppointmentId] = useState("");

  useEffect(() => {
    fetch("/api/doctors").then((r) => r.json()).then(setDoctors);
  }, []);

  const selectedDoctor = doctors.find((d) => d.id === form.doctorId);
  const currentFee = form.consultType === "HOME"
    ? selectedDoctor?.doctorProfile?.homeVisitFee ?? 0
    : selectedDoctor?.doctorProfile?.consultFee ?? 0;

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) { router.push("/login"); return; }
    setLoading(true);
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, patientId: user.id, amount: currentFee }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) { setFee(currentFee); setAppointmentId(data.id); setBooked(true); }
  };

  if (authLoading) {
    return <div className="min-h-screen gradient-surface flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
    </div>;
  }

  if (booked) {
    return (
      <div className="min-h-screen gradient-surface flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-9 h-9 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Appointment Booked!</h2>
          <p className="text-slate-500 mb-2">Your consultation has been scheduled.</p>
          <p className="text-xs text-slate-400 mb-8 font-mono">ID: {appointmentId.slice(0, 14)}…</p>
          <Link href={`/patient/payment?amount=${fee}&apptId=${appointmentId}`} className="btn-primary w-full justify-center py-3.5 text-base">
            Proceed to Payment
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-surface flex items-center justify-center p-6">
      {/* Top bar */}
      <div className="fixed top-5 inset-x-0 flex justify-between px-6">
        <span className="text-sm text-slate-500">
          Logged in as <strong>{user?.name}</strong>
        </span>
        <button onClick={logout} className="btn-ghost gap-1.5 text-sm text-red-500 hover:text-red-600">
          <LogOut className="w-3.5 h-3.5" /> Sign Out
        </button>
      </div>

      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4 shadow-lg">
            <MapPin className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900">Book Consultation</h1>
          <p className="text-slate-500 mt-2">Choose your doctor and consultation type.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
          <form onSubmit={submit} className="space-y-5">
            {/* Consult Type */}
            <div>
              <label className="input-label mb-2 block">Consultation Type</label>
              <div className="grid grid-cols-3 gap-3">
                {TYPES.map(({ id, label, icon: Icon }) => (
                  <button key={id} type="button" onClick={() => set("consultType", id)}
                    className={cn("flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border text-xs font-semibold transition-all",
                      form.consultType === id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                    )}>
                    <Icon className="w-5 h-5" /> {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Doctor Select */}
            <div>
              <label className="input-label">Select Doctor</label>
              <select required className="input-field" value={form.doctorId} onChange={(e) => set("doctorId", e.target.value)}>
                <option value="">— Choose a doctor —</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} — {d.doctorProfile?.specialty} (₹{form.consultType === "HOME" ? d.doctorProfile?.homeVisitFee : d.doctorProfile?.consultFee})
                  </option>
                ))}
              </select>
            </div>

            {selectedDoctor?.doctorProfile && (
              <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-800 flex items-start gap-3">
                <Stethoscope className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-semibold">{selectedDoctor.name}</div>
                  <div className="text-xs mt-0.5">{selectedDoctor.doctorProfile.specialty} · {selectedDoctor.doctorProfile.experience} yrs · {selectedDoctor.doctorProfile.availability}</div>
                  <div className="text-xs mt-0.5 font-bold">Fee: ₹{currentFee}</div>
                </div>
              </div>
            )}

            <div>
              <label className="input-label">Symptoms / Reason</label>
              <textarea required rows={3} className="input-field resize-none"
                placeholder="Describe your symptoms briefly…"
                value={form.symptoms} onChange={(e) => set("symptoms", e.target.value)} />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3.5 text-base">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Booking…</> : `Confirm Booking (₹${currentFee})`}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
