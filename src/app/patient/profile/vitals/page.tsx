"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Activity, Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import PatientHeader from "@/components/patient/PatientHeader";
import PatientMobileNav from "@/components/patient/PatientMobileNav";
import VitalsCharts, { type VitalReadingRow } from "@/components/VitalsCharts";
import { cn } from "@/lib/utils";

type Person = { id: string | null; label: string };

// Vitals nurses recorded at home visits, for the patient and each family
// member separately (never mixed) — the same readings the doctor sees.
export default function PatientVitalsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [people, setPeople] = useState<Person[]>([{ id: null, label: "Me" }]);
  const [who, setWho] = useState<string | null>(null);
  const [readings, setReadings] = useState<VitalReadingRow[] | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?next=/patient/profile/vitals");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user?.id) return;
    fetch("/api/patients/me/dependents").then((r) => (r.ok ? r.json() : [])).then((deps: { id: string; name: string; relation: string }[]) => {
      setPeople([{ id: null, label: "Me" }, ...deps.map((d) => ({ id: d.id, label: `${d.name} (${d.relation})` }))]);
    }).catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReadings(null);
    fetch(`/api/vitals?limit=120${who ? `&dependentId=${who}` : ""}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setReadings)
      .catch(() => setReadings([]));
  }, [user?.id, who]);

  return (
    <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
      <PatientHeader />
      <PatientMobileNav />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <Link href="/patient/profile" className="tap-44-y inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Profile
        </Link>
        <div className="flex items-center gap-3 mb-4">
          <span className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center"><Activity className="w-5 h-5" /></span>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">Vitals</h1>
            <p className="text-sm text-slate-500">Recorded by nurses at home visits — your doctor sees these too.</p>
          </div>
        </div>
        {people.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {people.map((p) => (
              <button key={p.id ?? "me"} onClick={() => setWho(p.id)}
                className={cn("min-h-11 px-3 py-1.5 rounded-full text-xs font-semibold border", who === p.id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200")}>
                {p.label}
              </button>
            ))}
          </div>
        )}
        {readings === null ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
        ) : (
          <VitalsCharts readings={readings} emptyText="No vitals yet — they appear here after a nurse records them at a visit." />
        )}
      </div>
    </div>
  );
}
