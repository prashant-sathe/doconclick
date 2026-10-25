"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, LifeBuoy, AlertCircle, Clock, CheckCheck, Send, ChevronRight, MessageSquareReply } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import NurseSubShell from "@/components/nurse/NurseSubShell";
import { formattingLocale } from "@/lib/appLanguage";
import { isValidMobile } from "@/lib/validation";
import ComplaintFormExtras from "@/components/support/ComplaintFormExtras";

interface Ticket {
  id: string;
  subject: string;
  description: string;
  status: string;
  createdAt: string;
  replyCount: number;
  supportRepliedLast: boolean;
}

const STATUS_BADGE: Record<string, string> = {
  OPEN: "badge badge-danger",
  IN_PROGRESS: "badge badge-warning",
  RESOLVED: "badge badge-success",
};

const STATUS_KEYS = ["OPEN", "IN_PROGRESS", "RESOLVED"] as const;
const isStatusKey = (s: string): s is (typeof STATUS_KEYS)[number] => (STATUS_KEYS as readonly string[]).includes(s);

const STATUS_ICON: Record<string, React.ElementType> = {
  OPEN: AlertCircle,
  IN_PROGRESS: Clock,
  RESOLVED: CheckCheck,
};

// Same ticket flow patients use (the /api/patient/complaints route serves nurses too).
export default function NurseSupportPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const t = useTranslations("nurse.support");
  const tc = useTranslations("shared.complaints");
  const locale = formattingLocale(useLocale());
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [appointmentId, setAppointmentId] = useState("");
  const [contactMobile, setContactMobile] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    fetch("/api/patient/complaints")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { setTickets(d); setLoading(false); });
  };

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "NURSE")) {
      router.replace("/login");
      return;
    }
    if (user) load();
  }, [user, authLoading, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim() || submitting) return;
    if (contactMobile.trim() && !isValidMobile(contactMobile)) { setError(tc("contactInvalid")); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/patient/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, description, appointmentId: appointmentId || null, contactMobile: contactMobile.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("failed"));
      setTickets((prev) => [data, ...prev]);
      setSubject("");
      setDescription("");
      setAppointmentId("");
      setContactMobile("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failed"));
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || !user || user.role !== "NURSE") {
    return (
      <div className="min-h-screen gradient-surface flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
      </div>
    );
  }

  return (
    <NurseSubShell title={t("title")} description={t("description")} icon={<LifeBuoy className="w-5 h-5" />}>

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
          <label className="input-label">{t("details")}</label>
          <textarea
            rows={4}
            className="input-field resize-none mb-3"
            placeholder={t("detailsPlaceholder")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={4000}
            required
          />
          <ComplaintFormExtras
            appointmentId={appointmentId}
            onAppointmentId={setAppointmentId}
            contactMobile={contactMobile}
            onContactMobile={setContactMobile}
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
            {tickets.map((tk) => {
              const Icon = STATUS_ICON[tk.status] ?? AlertCircle;
              return (
                <Link key={tk.id} href={`/nurse/support/${tk.id}`} className="block bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-3">
                    <div className={
                      "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 " +
                      (tk.status === "RESOLVED" ? "bg-emerald-50 text-emerald-500" : tk.status === "IN_PROGRESS" ? "bg-amber-50 text-amber-500" : "bg-red-50 text-red-500")
                    }>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-bold text-slate-900 truncate">{tk.subject}</span>
                        <span className={STATUS_BADGE[tk.status] ?? "badge badge-gray"}>{isStatusKey(tk.status) ? t(`status.${tk.status}`) : tk.status.replace("_", " ")}</span>
                      </div>
                      <p className="text-sm text-slate-600 mb-1 whitespace-pre-wrap line-clamp-3 break-words">{tk.description}</p>
                      <p className="text-xs text-slate-400">{new Date(tk.createdAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}</p>
                      <p className="text-xs mt-1.5 flex items-center gap-1.5 flex-wrap">
                        {tk.supportRepliedLast && (
                          <span className="inline-flex items-center gap-1 font-semibold text-rose-600"><MessageSquareReply className="w-3.5 h-3.5" /> {tc("supportReplied")}</span>
                        )}
                        <span className="text-slate-400">{tc("replies", { count: tk.replyCount })}</span>
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0 self-center" aria-label={tc("view")} />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
    </NurseSubShell>
  );
}
