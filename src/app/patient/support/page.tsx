"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LifeBuoy, AlertCircle, Clock, CheckCheck, Send } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import PatientHeader from "@/components/patient/PatientHeader";
import PatientMobileNav from "@/components/patient/PatientMobileNav";
import { useLocale, useTranslations } from "next-intl";
import { formattingLocale } from "@/lib/appLanguage";

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

const TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED"] as const;
const isTicketStatus = (s: string): s is (typeof TICKET_STATUSES)[number] => (TICKET_STATUSES as readonly string[]).includes(s);

const STATUS_ICON: Record<string, React.ElementType> = {
  OPEN: AlertCircle,
  IN_PROGRESS: Clock,
  RESOLVED: CheckCheck,
};

export default function PatientSupportPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const t = useTranslations("patientAccount.support");
  const tStatus = useTranslations("patientAccount.ticketStatus");
  const locale = formattingLocale(useLocale());
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
      if (!res.ok) throw new Error(data.error || t("couldNotRaise"));
      setTickets((prev) => [data, ...prev]);
      setSubject("");
      setDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotRaise"));
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
    <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
      <PatientHeader />
      <PatientMobileNav />
      <div className="max-w-2xl mx-auto py-8 px-4 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-slate-900">{t("title")}</h1>
          <p className="text-slate-500 text-sm">{t("subtitle")}</p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
              <LifeBuoy className="w-4 h-4 text-blue-600" />
            </div>
            <h2 className="font-bold text-slate-800">{t("raiseTitle")}</h2>
          </div>
          <label className="input-label">{t("subject")}</label>
          <input
            type="text"
            className="input-field mb-3"
            placeholder={t("subjectPlaceholder")}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            required
          />
          <label className="input-label">{t("description")}</label>
          <textarea
            rows={4}
            className="input-field resize-none mb-4"
            placeholder={t("descriptionPlaceholder")}
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
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("submitting")}</> : <><Send className="w-4 h-4" /> {t("raise")}</>}
          </button>
        </form>

        <h2 className="font-bold text-slate-800 mb-3">{t("yours")}</h2>
        {loading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <LifeBuoy className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t("none")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.map((ticket) => {
              const Icon = STATUS_ICON[ticket.status] ?? AlertCircle;
              return (
                <div key={ticket.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <div className="flex items-start gap-3">
                    <div className={
                      "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 " +
                      (ticket.status === "RESOLVED" ? "bg-emerald-50 text-emerald-500" : ticket.status === "IN_PROGRESS" ? "bg-amber-50 text-amber-500" : "bg-red-50 text-red-500")
                    }>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-bold text-slate-900 truncate">{ticket.subject}</span>
                        <span className={STATUS_BADGE[ticket.status] ?? "badge badge-gray"}>{isTicketStatus(ticket.status) ? tStatus(ticket.status) : ticket.status.replace("_", " ")}</span>
                      </div>
                      <p className="text-sm text-slate-600 mb-1 whitespace-pre-wrap">{ticket.description}</p>
                      <p className="text-xs text-slate-400">{new Date(ticket.createdAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}</p>
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
