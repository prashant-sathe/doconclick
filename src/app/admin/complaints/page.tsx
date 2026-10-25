"use client";
import { useState } from "react";
import Link from "next/link";
import { MessageCircle, AlertCircle, Search, UserCircle, Timer, ChevronRight, Link2 } from "lucide-react";
import { cn, formatDoctorName, nameOrMobile } from "@/lib/utils";
import LoadError from "@/components/LoadError";
import { useLoad } from "@/lib/apiClient";
import { COMPLAINT_PRIORITIES } from "@/lib/complaints";
import { STATUS_BADGE, PRIORITY_BADGE, STATUS_ICON, ageOf, label } from "@/components/admin/complaintUi";

interface Complaint {
  id: string;
  user: { name: string; mobile: string; role: string };
  assignee: { id: string; name: string } | null;
  subject: string;
  description: string;
  status: string;
  priority: string;
  appointmentId: string | null;
  lastActivityAt: string;
  createdAt: string;
  messageCount: number;
  awaitingSupport: boolean;
  sla: { dueAt: string; breached: boolean; awaitingFirstResponse: boolean };
}

interface ListResponse {
  complaints: Complaint[];
  total: number;
  limit: number;
  admins: { id: string; name: string }[];
}

export default function AdminComplaints() {
  const [status, setStatus] = useState("ACTIVE");
  const [priority, setPriority] = useState("");
  const [assignee, setAssignee] = useState("");
  const [role, setRole] = useState("");
  const [sla, setSla] = useState(false);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");

  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (priority) params.set("priority", priority);
  if (assignee) params.set("assignee", assignee);
  if (role) params.set("role", role);
  if (sla) params.set("sla", "breached");
  if (search) params.set("q", search);
  const { data, error, loading, reloading, reload } = useLoad<ListResponse>(`/api/admin/complaints?${params}`, { pollMs: 60_000, fallback: "Couldn't load complaints." });
  const complaints = data?.complaints ?? [];

  const select = "input-field py-2 text-sm w-auto";

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Support & Complaints</h1>
        <p className="text-slate-500 text-sm mt-1">Tickets from patients, nurses and doctors — reply, assign, prioritise and track response times.</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-5 flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()); }}
          className="relative flex-1 min-w-[200px]"
        >
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            className="input-field pl-10 py-2 text-sm"
            placeholder="Search subject, name, mobile or ticket id"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => setSearch(q.trim())}
          />
        </form>
        <select className={select} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="ACTIVE">Open + In progress</option>
          <option value="">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="RESOLVED">Resolved</option>
        </select>
        <select className={select} value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
          <option value="">Any priority</option>
          {COMPLAINT_PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
        </select>
        <select className={select} value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assignee">
          <option value="">Anyone</option>
          <option value="me">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
          {(data?.admins ?? []).map((a) => <option key={a.id} value={a.id}>{a.name || "Admin"}</option>)}
        </select>
        <select className={select} value={role} onChange={(e) => setRole(e.target.value)} aria-label="Raised by">
          <option value="">All users</option>
          <option value="PATIENT">Patients</option>
          <option value="NURSE">Nurses</option>
          <option value="DOCTOR">Doctors</option>
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-slate-600 px-2 cursor-pointer">
          <input type="checkbox" checked={sla} onChange={(e) => setSla(e.target.checked)} className="rounded" />
          SLA breached
        </label>
      </div>

      {error && <LoadError error={error} onRetry={reload} retrying={reloading} hasData={!!data} />}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}
        </div>
      ) : !data ? null : (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            {data.total > data.limit ? `Showing the ${data.limit} most recently active of ${data.total}` : `${data.total} ticket${data.total === 1 ? "" : "s"}`}
          </p>
          {complaints.length === 0 && (
            <div className="text-center py-16 text-slate-400">
              <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
              No complaints match these filters.
            </div>
          )}
          {complaints.map((c) => {
            const Icon = STATUS_ICON[c.status] ?? AlertCircle;
            return (
              <Link key={c.id} href={`/admin/complaints/${c.id}`} className="block bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-4">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5",
                    c.status === "RESOLVED" ? "bg-emerald-50 text-emerald-500" : c.status === "IN_PROGRESS" ? "bg-amber-50 text-amber-500" : "bg-red-50 text-red-500"
                  )}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-bold text-slate-900 break-words">{c.subject}</span>
                      <span className={STATUS_BADGE[c.status] ?? "badge badge-gray"}>{label(c.status)}</span>
                      <span className={PRIORITY_BADGE[c.priority] ?? "badge badge-gray"}>{label(c.priority)}</span>
                      <span className="badge badge-gray text-xs">{c.user.role}</span>
                      {c.sla.breached && <span className="badge badge-danger inline-flex items-center gap-1"><Timer className="w-3 h-3" /> SLA breached</span>}
                      {c.awaitingSupport && !c.sla.breached && <span className="badge badge-warning">Awaiting reply</span>}
                    </div>
                    <p className="text-sm text-slate-600 mb-1 line-clamp-2 break-words">{c.description}</p>
                    <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>By <span className="font-medium text-slate-600">{c.user.role === "DOCTOR" ? formatDoctorName(c.user.name) : nameOrMobile(c.user.name, c.user.mobile)}</span></span>
                      <span>Age {ageOf(c.createdAt)}</span>
                      <span>Last activity {ageOf(c.lastActivityAt)} ago</span>
                      {c.sla.awaitingFirstResponse && <span>First reply due {new Date(c.sla.dueAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}</span>}
                      <span className="inline-flex items-center gap-1"><UserCircle className="w-3.5 h-3.5" />{c.assignee ? c.assignee.name || "Admin" : "Unassigned"}</span>
                      <span className="inline-flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" />{c.messageCount}</span>
                      {c.appointmentId && <span className="inline-flex items-center gap-1"><Link2 className="w-3.5 h-3.5" />Booking linked</span>}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0 self-center" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
