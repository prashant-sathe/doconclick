"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LifeBuoy, AlertCircle, Clock, CheckCheck, Send } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import PatientHeader from "@/components/patient/PatientHeader";
import PatientMobileNav from "@/components/patient/PatientMobileNav";

interface Ticket {
  id: string;
  subject: string;
  description: string;
  status: string;
  createdAt: string;
}

const STATUS_BADGE: Record<string, string> = {
  OPEN: "badge badge-danger",
  IN_PROGRESS: "badge badge-warning",
  RESOLVED: "badge badge-success",
};

const STATUS_ICON: Record<string, React.ElementType> = {
  OPEN: AlertCircle,
  IN_PROGRESS: Clock,
  RESOLVED: CheckCheck,
};

export default function PatientSupportPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    fetch("/api/patient/complaints")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { setTickets(d); setLoading(false); });
  };

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "PATIENT")) {
      router.replace("/login");
      return;
    }
    if (user) load();
  }, [user, authLoading, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/patient/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not raise the ticket. Please try again.");
      setTickets((prev) => [data, ...prev]);
      setSubject("");
      setDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not raise the ticket. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || !user || user.role !== "PATIENT") {
    return (
      <div className="min-h-screen gradient-surface flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-surface pb-24 sm:pb-10">
      <PatientHeader />
      <PatientMobileNav />
      <div className="max-w-2xl mx-auto py-8 px-4 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-slate-900">Help &amp; Support</h1>
          <p className="text-slate-500 text-sm">Raise an issue with the DocOnClick team and track its status here.</p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
              <LifeBuoy className="w-4 h-4 text-blue-600" />
            </div>
            <h2 className="font-bold text-slate-800">Raise a Ticket</h2>
          </div>
          <label className="input-label">Subject</label>
          <input
            type="text"
            className="input-field mb-3"
            placeholder="Short summary of the issue"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            required
          />
          <label className="input-label">Description</label>
          <textarea
            rows={4}
            className="input-field resize-none mb-4"
            placeholder="Describe what happened…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={4000}
            required
          />
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 mb-3">{error}</div>
          )}
          <button
            type="submit"
            disabled={submitting || !subject.trim() || !description.trim()}
            className="btn-primary w-full justify-center py-3"
          >
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : <><Send className="w-4 h-4" /> Raise Ticket</>}
          </button>
        </form>

        <h2 className="font-bold text-slate-800 mb-3">Your Tickets</h2>
        {loading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <LifeBuoy className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No tickets raised yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.map((t) => {
              const Icon = STATUS_ICON[t.status] ?? AlertCircle;
              return (
                <div key={t.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <div className="flex items-start gap-3">
                    <div className={
                      "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 " +
                      (t.status === "RESOLVED" ? "bg-emerald-50 text-emerald-500" : t.status === "IN_PROGRESS" ? "bg-amber-50 text-amber-500" : "bg-red-50 text-red-500")
                    }>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-bold text-slate-900 truncate">{t.subject}</span>
                        <span className={STATUS_BADGE[t.status] ?? "badge badge-gray"}>{t.status.replace("_", " ")}</span>
                      </div>
                      <p className="text-sm text-slate-600 mb-1 whitespace-pre-wrap">{t.description}</p>
                      <p className="text-xs text-slate-400">{new Date(t.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
