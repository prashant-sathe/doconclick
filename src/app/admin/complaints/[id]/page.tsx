"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, Send, Lock, Phone, Mail, CalendarDays, Timer, UserCircle } from "lucide-react";
import { cn, formatDoctorName, nameOrMobile } from "@/lib/utils";
import LoadError from "@/components/LoadError";
import { useToast } from "@/components/Toast";
import { mutate, useLoad } from "@/lib/apiClient";
import { COMPLAINT_MESSAGE_MAX, COMPLAINT_PRIORITIES, COMPLAINT_STATUSES } from "@/lib/complaints";
import { STATUS_BADGE, PRIORITY_BADGE, ageOf, label } from "@/components/admin/complaintUi";

interface Msg {
  id: string;
  body: string;
  fromSupport: boolean;
  internal: boolean;
  createdAt: string;
  author: { id: string; name: string } | null;
}

interface AppointmentSummary {
  id: string;
  scheduledAt: string;
  status: string;
  consultType: string;
  providerType: string;
  serviceName: string | null;
  withName: string;
  patientName?: string;
  providerName?: string;
}

interface Detail {
  id: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  contactMobile: string | null;
  createdAt: string;
  lastActivityAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  appointmentId: string | null;
  user: { id: string; name: string; mobile: string; email: string | null; role: string; deletedAt: string | null; createdAt: string };
  assignee: { id: string; name: string } | null;
  messages: Msg[];
  sla: { dueAt: string; breached: boolean; awaitingFirstResponse: boolean };
  appointment: AppointmentSummary | null;
  userAppointments: AppointmentSummary[];
  admins: { id: string; name: string }[];
  otherTickets: number;
}

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

const USER_PAGE: Record<string, string> = { PATIENT: "/admin/patients", DOCTOR: "/admin/doctors", NURSE: "/admin/nurses" };

export default function AdminComplaintDetail() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { data, error, loading, reloading, reload } = useLoad<Detail>(`/api/admin/complaints/${id}`, { pollMs: 30_000, fallback: "Couldn't load this complaint." });
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);

  const patch = async (change: Record<string, unknown>) => {
    setSaving(true);
    const res = await mutate("/api/admin/complaints", { method: "PATCH", body: { id, ...change }, fallback: "Couldn't update the complaint." });
    setSaving(false);
    if (!res.ok) { toast.error(res.error); return; }
    reload();
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim() || sending) return;
    setSending(true);
    const res = await mutate(`/api/admin/complaints/${id}/messages`, { body: { body: reply, internal }, fallback: "Couldn't send." });
    setSending(false);
    if (!res.ok) { toast.error(res.error); return; }
    setReply("");
    toast.success(internal ? "Internal note added." : "Reply sent — the user has been notified.");
    reload();
  };

  const back = (
    <Link href="/admin/complaints" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 py-2.5 mb-2">
      <ArrowLeft className="w-4 h-4" /> All complaints
    </Link>
  );

  if (loading) return <div className="p-4 sm:p-6 lg:p-8">{back}<div className="skeleton h-64 rounded-2xl" /></div>;
  if (!data) return <div className="p-4 sm:p-6 lg:p-8">{back}{error && <LoadError error={error} onRetry={reload} retrying={reloading} />}</div>;

  const userName = data.user.role === "DOCTOR" ? formatDoctorName(data.user.name) : nameOrMobile(data.user.name, data.user.mobile);
  const select = "input-field py-2 text-sm";

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {back}
      {error && <LoadError error={error} onRetry={reload} retrying={reloading} hasData />}

      <div className="grid lg:grid-cols-3 gap-5 items-start">
        {/* ── Thread ── */}
        <div className="lg:col-span-2 space-y-4 min-w-0">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <h1 className="text-xl font-extrabold text-slate-900 break-words">{data.subject}</h1>
              <span className={STATUS_BADGE[data.status] ?? "badge badge-gray"}>{label(data.status)}</span>
              <span className={PRIORITY_BADGE[data.priority] ?? "badge badge-gray"}>{label(data.priority)}</span>
              {data.sla.breached && <span className="badge badge-danger inline-flex items-center gap-1"><Timer className="w-3 h-3" /> SLA breached</span>}
            </div>
            <p className="text-sm text-slate-700 whitespace-pre-wrap break-words mb-3">{data.description}</p>
            <p className="text-xs text-slate-400">Raised by {userName} · {when(data.createdAt)} · ticket <span className="font-mono">{data.id}</span></p>
          </div>

          <div className="space-y-3">
            {data.messages.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No replies yet.</p>}
            {data.messages.map((m) => (
              <div key={m.id} className={cn("flex", m.fromSupport ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm border",
                  m.internal ? "bg-amber-50 border-amber-200 text-amber-900"
                    : m.fromSupport ? "bg-blue-600 border-blue-600 text-white"
                    : "bg-white border-slate-100 text-slate-800",
                )}>
                  <p className={cn("text-[11px] font-semibold mb-0.5 flex items-center gap-1", m.internal ? "text-amber-700" : m.fromSupport ? "text-white/80" : "text-slate-500")}>
                    {m.internal && <Lock className="w-3 h-3" />}
                    {m.fromSupport ? `${m.author?.name || "Admin"}${m.internal ? " · internal note" : ""}` : userName}
                  </p>
                  <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={cn("text-[10px] mt-1", m.fromSupport && !m.internal ? "text-white/70" : "text-slate-400")}>{when(m.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={send} className={cn("rounded-2xl border shadow-sm p-4", internal ? "bg-amber-50 border-amber-200" : "bg-white border-slate-100")}>
            <div className="flex gap-1 mb-3 p-1 bg-slate-100 rounded-xl w-fit">
              <button type="button" onClick={() => setInternal(false)} className={cn("px-3 py-2.5 rounded-lg text-xs font-semibold", !internal ? "bg-white shadow-sm text-slate-900" : "text-slate-500")}>Reply to user</button>
              <button type="button" onClick={() => setInternal(true)} className={cn("px-3 py-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1", internal ? "bg-white shadow-sm text-amber-800" : "text-slate-500")}><Lock className="w-3 h-3" /> Internal note</button>
            </div>
            <textarea
              rows={4}
              className="input-field resize-none mb-3"
              placeholder={internal ? "Visible to admins only." : "The user sees this and gets a notification."}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              maxLength={COMPLAINT_MESSAGE_MAX}
            />
            <button type="submit" disabled={sending || !reply.trim()} className="btn-primary py-2.5 px-4 text-sm">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : internal ? <Lock className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              {internal ? "Add note" : "Send reply"}
            </button>
          </form>
        </div>

        {/* ── Side panel ── */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
            <h2 className="font-bold text-slate-800">Ticket</h2>
            <div>
              <label className="input-label">Status</label>
              <select className={select} value={data.status} disabled={saving} onChange={(e) => patch({ status: e.target.value })}>
                {COMPLAINT_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Priority</label>
              <select className={select} value={data.priority} disabled={saving} onChange={(e) => patch({ priority: e.target.value })}>
                {COMPLAINT_PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Assignee</label>
              <select className={select} value={data.assignee?.id ?? ""} disabled={saving} onChange={(e) => patch({ assigneeId: e.target.value || null })}>
                <option value="">Unassigned</option>
                {data.admins.map((a) => <option key={a.id} value={a.id}>{a.name || "Admin"}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Linked booking</label>
              <select className={select} value={data.appointmentId ?? ""} disabled={saving} onChange={(e) => patch({ appointmentId: e.target.value || null })}>
                <option value="">None</option>
                {data.appointment && !data.userAppointments.some((a) => a.id === data.appointment!.id) && (
                  <option value={data.appointment.id}>{data.appointment.providerName} · {when(data.appointment.scheduledAt)}</option>
                )}
                {data.userAppointments.map((a) => <option key={a.id} value={a.id}>{a.withName} · {when(a.scheduledAt)}</option>)}
              </select>
              {data.appointment && (
                <div className="mt-2 text-xs text-slate-500 bg-slate-50 rounded-xl p-3 space-y-0.5">
                  <p className="flex items-center gap-1.5 font-semibold text-slate-700"><CalendarDays className="w-3.5 h-3.5" /> {when(data.appointment.scheduledAt)}</p>
                  <p>{data.appointment.patientName} → {data.appointment.providerName}</p>
                  <p>{label(data.appointment.consultType)}{data.appointment.serviceName ? ` · ${data.appointment.serviceName}` : ""} · {label(data.appointment.status)}</p>
                  <p>Booking id <span className="font-mono select-all">{data.appointment.id}</span></p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-2 text-sm">
            <h2 className="font-bold text-slate-800">Contact</h2>
            <p className="flex items-center gap-2 text-slate-700"><UserCircle className="w-4 h-4 text-slate-400" /> {userName} <span className="badge badge-gray text-xs">{data.user.role}</span></p>
            {data.user.deletedAt && <p className="text-xs text-red-600">Account deleted {when(data.user.deletedAt)}</p>}
            <p className="flex items-center gap-2"><Phone className="w-4 h-4 text-slate-400" /><a href={`tel:${data.user.mobile}`} className="text-blue-600 hover:underline py-1.5">{data.user.mobile}</a><span className="text-xs text-slate-400">account</span></p>
            {data.contactMobile && data.contactMobile !== data.user.mobile && (
              <p className="flex items-center gap-2"><Phone className="w-4 h-4 text-slate-400" /><a href={`tel:${data.contactMobile}`} className="text-blue-600 hover:underline py-1.5">{data.contactMobile}</a><span className="text-xs text-slate-400">callback</span></p>
            )}
            {data.user.email && <p className="flex items-center gap-2"><Mail className="w-4 h-4 text-slate-400" /><a href={`mailto:${data.user.email}`} className="text-blue-600 hover:underline break-all">{data.user.email}</a></p>}
            <p className="text-xs text-slate-400">Member since {new Date(data.user.createdAt).toLocaleDateString("en-IN")} · {data.otherTickets} other ticket{data.otherTickets === 1 ? "" : "s"}</p>
            {USER_PAGE[data.user.role] && <Link href={USER_PAGE[data.user.role]} className="text-xs text-blue-600 hover:underline">Find in {label(data.user.role)}s →</Link>}
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-1.5 text-sm">
            <h2 className="font-bold text-slate-800 mb-1">SLA</h2>
            <p className="text-slate-600">Age: <span className="font-semibold">{ageOf(data.createdAt)}</span></p>
            <p className="text-slate-600">First reply due: {when(data.sla.dueAt)}</p>
            <p className={cn(data.sla.breached ? "text-red-600 font-semibold" : "text-slate-600")}>
              {data.firstResponseAt
                ? `First replied ${when(data.firstResponseAt)}${data.sla.breached ? " (late)" : ""}`
                : data.sla.awaitingFirstResponse ? (data.sla.breached ? "Overdue — no reply yet" : "Waiting for first reply") : "Resolved without a reply"}
            </p>
            <p className="text-slate-600">Last activity: {when(data.lastActivityAt)}</p>
            {data.resolvedAt && <p className="text-slate-600">Resolved: {when(data.resolvedAt)}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
