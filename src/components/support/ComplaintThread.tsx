"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Send, LifeBuoy, CalendarDays, Phone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import LoadError from "@/components/LoadError";
import { mutate, useLoad } from "@/lib/apiClient";
import { formattingLocale } from "@/lib/appLanguage";
import { COMPLAINT_MESSAGE_MAX, isComplaintStatus } from "@/lib/complaints";

interface ThreadMessage {
  id: string;
  body: string;
  fromSupport: boolean;
  createdAt: string;
}

interface Ticket {
  id: string;
  subject: string;
  description: string;
  status: string;
  contactMobile: string | null;
  createdAt: string;
  appointment: { id: string; scheduledAt: string; withName: string } | null;
  messages: ThreadMessage[];
}

export const COMPLAINT_STATUS_BADGE: Record<string, string> = {
  OPEN: "badge badge-danger",
  IN_PROGRESS: "badge badge-warning",
  RESOLVED: "badge badge-success",
};

const ACCENT = {
  blue: { bubble: "bg-blue-600 text-white", button: "btn-primary" },
  rose: { bubble: "bg-rose-500 text-white", button: "btn-primary" },
  teal: { bubble: "bg-teal-600 text-white", button: "btn-primary" },
};

// A filer's own ticket (patient, nurse or doctor): the original description,
// the public replies from both sides and a reply box. GET/POST
// /api/complaints/[id] only ever return the public thread.
export default function ComplaintThread({ id, backHref, accent = "blue" }: { id: string; backHref: string; accent?: keyof typeof ACCENT }) {
  const t = useTranslations("shared.complaints");
  const locale = formattingLocale(useLocale());
  const { data, setData, error, loading, reloading, reload } = useLoad<Ticket>(`/api/complaints/${id}`, { pollMs: 30_000 });
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const when = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
  const styles = ACCENT[accent];

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim() || sending) return;
    setSending(true);
    setSendError(null);
    const res = await mutate<{ message: ThreadMessage; status: string }>(`/api/complaints/${id}/messages`, {
      body: { body: reply },
      fallback: t("sendFailed"),
    });
    setSending(false);
    if (!res.ok) { setSendError(res.error); return; }
    setReply("");
    setData((prev) => (prev ? { ...prev, status: res.data.status, messages: [...prev.messages, res.data.message] } : prev));
  };

  const back = (
    <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 py-2.5 mb-2">
      <ArrowLeft className="w-4 h-4" /> {t("allTickets")}
    </Link>
  );

  if (loading) {
    return <div>{back}<div className="skeleton h-40 rounded-2xl mb-3" /><div className="skeleton h-24 rounded-2xl" /></div>;
  }
  if (!data) {
    return <div>{back}{error && <LoadError error={error} onRetry={reload} retrying={reloading} />}</div>;
  }

  return (
    <div>
      {back}
      {error && <LoadError error={error} onRetry={reload} retrying={reloading} hasData />}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h2 className="font-bold text-slate-900 break-words min-w-0">{data.subject}</h2>
          <span className={cn(COMPLAINT_STATUS_BADGE[data.status] ?? "badge badge-gray", "flex-shrink-0")}>
            {isComplaintStatus(data.status) ? t(`status.${data.status}`) : data.status}
          </span>
        </div>
        <p className="text-sm text-slate-600 whitespace-pre-wrap break-words mb-3">{data.description}</p>
        <div className="space-y-1 text-xs text-slate-400">
          <p>{t("raisedOn", { date: when(data.createdAt) })}</p>
          {data.appointment && (
            <p className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              <span>{t("aboutBooking")}: {t("bookingWith", { name: data.appointment.withName, date: when(data.appointment.scheduledAt) })}</span>
            </p>
          )}
          {data.contactMobile && (
            <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {t("callback", { mobile: data.contactMobile })}</p>
          )}
        </div>
      </div>

      <h3 className="font-bold text-slate-800 mb-3">{t("conversation")}</h3>
      {data.messages.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-sm bg-white rounded-2xl border border-slate-100 mb-4 px-4">
          <LifeBuoy className="w-8 h-8 mx-auto mb-2 opacity-30" />
          {t("noReplies")}
        </div>
      ) : (
        <div className="space-y-3 mb-4">
          {data.messages.map((m) => (
            <div key={m.id} className={cn("flex", m.fromSupport ? "justify-start" : "justify-end")}>
              <div className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm",
                m.fromSupport ? "bg-white border border-slate-100 text-slate-800" : styles.bubble,
              )}>
                <p className={cn("text-[11px] font-semibold mb-0.5", m.fromSupport ? "text-slate-500" : "text-white/80")}>
                  {m.fromSupport ? t("support") : t("you")}
                </p>
                <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                <p className={cn("text-[10px] mt-1", m.fromSupport ? "text-slate-400" : "text-white/70")}>{when(m.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={send} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        {data.status === "RESOLVED" && (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 mb-3">{t("resolvedNote")}</p>
        )}
        <label className="input-label" htmlFor="complaint-reply">{t("replyLabel")}</label>
        <textarea
          id="complaint-reply"
          rows={3}
          className="input-field resize-none mb-3"
          placeholder={t("replyPlaceholder")}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          maxLength={COMPLAINT_MESSAGE_MAX}
        />
        {sendError && (
          <div role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 mb-3">{sendError}</div>
        )}
        <button type="submit" disabled={sending || !reply.trim()} className={cn(styles.button, "w-full justify-center py-3")}>
          {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("sending")}</> : <><Send className="w-4 h-4" /> {t("send")}</>}
        </button>
      </form>
    </div>
  );
}
