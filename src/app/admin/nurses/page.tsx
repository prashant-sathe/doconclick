"use client";
import { useState } from "react";
import {
  HeartPulse, Loader2, Search, CheckCircle2, XCircle, Ban, RotateCcw, BadgeCheck, LogIn, FileText,
  Circle, MapPin, Phone, Mail, X, AlertCircle, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { nurseChecklist } from "@/lib/nurseChecklist";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useAccountImpact, impactResultText } from "@/components/admin/AccountImpactDialog";
import LoadError from "@/components/LoadError";
import { useToast } from "@/components/Toast";
import { mutate, useLoad } from "@/lib/apiClient";

interface NurseRow {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  createdAt: string;
  _count: { asDoctor: number };
  nurseProfile: {
    status: string; isVerified: boolean; qualification: string | null; councilRegNo: string | null; councilState: string | null;
    experience: number; gender: string | null; languages: string; bio: string | null; address: string | null; radius: number;
    lat: number | null; lng: number | null; bankDetails: string | null; photoUrl: string | null;
    councilCertUrl: string | null; degreeCertUrl: string | null; kycDocUrl: string | null; policeVerifUrl: string | null;
    registrationFeePaid: boolean; subscriptionPaidUntil: string | null; avgRating: number; totalReviews: number;
    services: { price: number; service: { name: string } }[];
  } | null;
}

// GET /api/admin/nurses/[id] — what approving needs, each document read back
// and checked to be the real file type (src/lib/nurseApproval.ts).
interface NurseDetail {
  id: string;
  approvalChecklist: { items: { key: string; label: string; ok: boolean; problem: string | null }[]; ready: boolean } | null;
}

const FILTERS = ["ALL", "PENDING", "APPROVED", "REJECTED", "SUSPENDED"] as const;
const STATUS_BADGE: Record<string, string> = {
  PENDING: "badge badge-warning", APPROVED: "badge badge-success", REJECTED: "badge badge-gray", SUSPENDED: "badge badge-danger",
};
const DOCS: { key: keyof NonNullable<NurseRow["nurseProfile"]>; label: string }[] = [
  { key: "councilCertUrl", label: "Council certificate" },
  { key: "degreeCertUrl", label: "Degree / diploma" },
  { key: "kycDocUrl", label: "Aadhaar / PAN" },
  { key: "policeVerifUrl", label: "Police verification" },
  { key: "photoUrl", label: "Photo" },
];

export default function AdminNurses() {
  const { data: nurses, error: loadError, loading, reloading, reload } = useLoad<NurseRow[]>("/api/admin/nurses", { fallback: "Couldn't load nurses." });
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // status is SUSPENDED / REJECTED, or DELETE for removing the account.
  const [confirm, setConfirm] = useState<{ nurse: NurseRow; status: string } | null>(null);
  const [notice, setNotice] = useState("");
  const impact = useAccountImpact();
  const toast = useToast();
  const detail = useLoad<NurseDetail>(openId ? `/api/admin/nurses/${openId}` : null, { fallback: "Couldn't check this nurse's documents." });
  // useLoad keeps the previous nurse's data until this one loads — only trust a match.
  const approval = detail.data?.id === openId ? detail.data.approvalChecklist : null;

  // Suspending/rejecting an approved nurse, or deleting one, goes through the
  // impact step (her upcoming bookings) when she has any — see useAccountImpact.
  const send = async (nurse: NurseRow, method: "PATCH" | "DELETE", body: Record<string, unknown>) => {
    setBusy(true); setNotice("");
    const result = await impact.run(
      (extra) => fetch(`/api/admin/nurses/${nurse.id}`, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, ...extra }),
      }),
      { title: `Open bookings with ${nurse.name}`, actionLabel: method === "DELETE" ? "Delete account" : body.status === "SUSPENDED" ? "Suspend" : "Confirm" },
    );
    setBusy(false);
    void detail.reload();
    if (!result) return false;
    setNotice(impactResultText(result.bookings as never));
    reload();
    return true;
  };
  const update = (nurse: NurseRow, body: Record<string, unknown>) => send(nurse, "PATCH", body);

  const impersonate = async (id: string) => {
    setBusy(true);
    const res = await mutate(`/api/admin/impersonate/${id}`, { method: "POST", fallback: "Could not log in as this nurse." });
    if (!res.ok) { setBusy(false); toast.error(res.error); return; }
    window.location.href = "/nurse/dashboard";
  };

  const list = (nurses ?? [])
    .filter((n) => filter === "ALL" || n.nurseProfile?.status === filter)
    .filter((n) => {
      const q = search.trim().toLowerCase();
      return !q || n.name.toLowerCase().includes(q) || n.mobile.includes(q) || (n.nurseProfile?.councilRegNo ?? "").toLowerCase().includes(q);
    });
  const open = nurses?.find((n) => n.id === openId) ?? null;
  const op = open?.nurseProfile ?? null;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2"><HeartPulse className="w-6 h-6 text-rose-500" />Nurses</h1>
        <p className="text-slate-500 text-sm mt-1">Review registrations, documents and services. Only approved nurses can be booked.</p>
      </div>
      {notice && !open && (
        <div className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">{notice}</div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {FILTERS.map((f) => {
          const count = f === "ALL" ? nurses?.length ?? 0 : (nurses ?? []).filter((n) => n.nurseProfile?.status === f).length;
          return (
            <button key={f} onClick={() => setFilter(f)} className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border", filter === f ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200")}>
              {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()} ({count})
            </button>
          );
        })}
        <div className="relative ml-auto">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="input-field pl-9 py-2 text-sm w-64" placeholder="Name, mobile or council no." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {loadError && <LoadError error={loadError} onRetry={reload} retrying={reloading} hasData={!!nurses} />}

      {loading ? (
        <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
      ) : !nurses ? null : list.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-sm text-slate-400">No nurses here yet.</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-50">
          {list.map((n) => {
            const p = n.nurseProfile;
            const check = p ? nurseChecklist({ ...p, serviceCount: p.services.length }) : null;
            return (
              <button key={n.id} onClick={() => { impact.clearError(); setOpenId(n.id); }} className="w-full text-left px-5 py-4 hover:bg-slate-50 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                    {n.name}{p?.isVerified && <BadgeCheck className="w-4 h-4 text-blue-500" />}
                  </p>
                  <p className="text-xs text-slate-400">{n.mobile} · {p?.qualification ?? "No qualification"} · {p?.councilRegNo ?? "No council no."}</p>
                </div>
                <div className="hidden sm:block text-xs text-slate-500 w-32">Profile {check?.percent ?? 0}%</div>
                <div className="hidden sm:block text-xs text-slate-500 w-24">{n._count.asDoctor} visits</div>
                <span className={STATUS_BADGE[p?.status ?? "PENDING"] ?? "badge badge-gray"}>{p?.status ?? "—"}</span>
              </button>
            );
          })}
        </div>
      )}

      {open && op && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setOpenId(null)} />
          <div className="fixed right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl z-50 overflow-y-auto">
            <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">{open.name}</h2>
                <span className={STATUS_BADGE[op.status] ?? "badge badge-gray"}>{op.status}</span>
              </div>
              <button onClick={() => setOpenId(null)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-6 space-y-6">
              {impact.error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex items-center gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" />{impact.error}</div>}
              {notice && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">{notice}</div>}
              <div className="flex flex-wrap gap-2">
                {op.status !== "APPROVED" && (
                  <button
                    disabled={busy || !approval?.ready}
                    onClick={() => update(open, { status: "APPROVED" })}
                    title={approval?.ready ? undefined : "Every approval requirement below has to be met first"}
                    className="btn-primary py-2 px-4 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  ><CheckCircle2 className="w-4 h-4" /> Approve</button>
                )}
                {op.status === "PENDING" && (
                  <button disabled={busy} onClick={() => setConfirm({ nurse: open, status: "REJECTED" })} className="btn-secondary py-2 px-4 text-sm"><XCircle className="w-4 h-4" /> Reject</button>
                )}
                {op.status === "APPROVED" && (
                  <button disabled={busy} onClick={() => setConfirm({ nurse: open, status: "SUSPENDED" })} className="btn-secondary py-2 px-4 text-sm text-red-600"><Ban className="w-4 h-4" /> Suspend</button>
                )}
                {(op.status === "REJECTED" || op.status === "SUSPENDED") && (
                  <button disabled={busy} onClick={() => update(open, { status: "PENDING" })} className="btn-secondary py-2 px-4 text-sm"><RotateCcw className="w-4 h-4" /> Back to review</button>
                )}
                <button disabled={busy} onClick={() => update(open, { isVerified: !op.isVerified })} className="btn-secondary py-2 px-4 text-sm">
                  <BadgeCheck className="w-4 h-4" /> {op.isVerified ? "Remove verified badge" : "Mark credentials verified"}
                </button>
                <button disabled={busy} onClick={() => impersonate(open.id)} className="btn-secondary py-2 px-4 text-sm"><LogIn className="w-4 h-4" /> Log in as</button>
                <button disabled={busy} onClick={() => setConfirm({ nurse: open, status: "DELETE" })} className="btn-secondary py-2 px-4 text-sm text-red-600"><Trash2 className="w-4 h-4" /> Delete</button>
              </div>

              <section>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Approval requirements</h3>
                {detail.error && !approval ? (
                  <LoadError error={detail.error} onRetry={detail.reload} retrying={detail.reloading} />
                ) : !approval ? (
                  <p className="text-sm text-slate-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Checking documents…</p>
                ) : (
                  <>
                    <ul className="space-y-1.5">
                      {approval.items.map((i) => (
                        <li key={i.key} className="text-sm flex items-start gap-2">
                          {i.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" /> : <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />}
                          <span>
                            <span className={i.ok ? "text-slate-600" : "text-slate-800 font-semibold"}>{i.label}</span>
                            {i.problem && <span className="block text-xs text-red-600">{i.problem}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {!approval.ready && op.status !== "APPROVED" && (
                      <p className="text-xs text-slate-500 mt-2">Approve unlocks once every item above is met.</p>
                    )}
                  </>
                )}
              </section>

              <section>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Profile completeness</h3>
                <ul className="space-y-1.5">
                  {nurseChecklist({ ...op, serviceCount: op.services.length }).items.map((i) => (
                    <li key={i.key} className="text-sm flex items-center gap-2">
                      {i.done ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Circle className="w-4 h-4 text-slate-300" />}
                      <span className={i.done ? "text-slate-600" : "text-slate-400"}>{i.label}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="text-sm text-slate-600 space-y-1">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Details</h3>
                <p className="flex items-center gap-2"><Phone className="w-4 h-4 text-slate-400" />{open.mobile}</p>
                {open.email && <p className="flex items-center gap-2"><Mail className="w-4 h-4 text-slate-400" />{open.email}</p>}
                <p>Qualification: <strong>{op.qualification ?? "—"}</strong> · Experience: <strong>{op.experience} yrs</strong> · Gender: <strong>{op.gender ?? "—"}</strong></p>
                <p>Council no.: <strong>{op.councilRegNo ?? "—"}</strong>{op.councilState ? ` (${op.councilState})` : ""}</p>
                <p>Languages: {op.languages}</p>
                {op.address && <p className="flex items-start gap-2"><MapPin className="w-4 h-4 text-slate-400 mt-0.5" />{op.address} · travels {op.radius} km</p>}
                {op.bio && <p className="text-slate-500">{op.bio}</p>}
                <p>Fees: registration {op.registrationFeePaid ? "paid" : "not paid"} · subscription {op.subscriptionPaidUntil ? `until ${new Date(op.subscriptionPaidUntil).toLocaleDateString("en-IN")}` : "none"}</p>
                {op.totalReviews > 0 && <p>Rating: {op.avgRating.toFixed(1)} ({op.totalReviews} reviews)</p>}
              </section>

              <section>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Documents</h3>
                <div className="grid grid-cols-2 gap-2">
                  {DOCS.map((d) => {
                    const url = op[d.key] as string | null;
                    return url ? (
                      <a key={d.key} href={url} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-slate-100 px-3 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 flex items-center gap-1.5"><FileText className="w-4 h-4" />{d.label}</a>
                    ) : (
                      <span key={d.key} className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-sm text-slate-400">{d.label} — missing</span>
                    );
                  })}
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Services</h3>
                {op.services.length === 0 ? <p className="text-sm text-slate-400">No services selected.</p> : (
                  <ul className="text-sm divide-y divide-slate-50 border border-slate-100 rounded-xl">
                    {op.services.map((s) => (
                      <li key={s.service.name} className="px-3 py-2 flex justify-between"><span>{s.service.name}</span><strong>₹{s.price}</strong></li>
                    ))}
                  </ul>
                )}
              </section>

              {op.bankDetails && (
                <section>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Bank details</h3>
                  <p className="text-sm text-slate-600 whitespace-pre-line">{op.bankDetails}</p>
                </section>
              )}
            </div>
          </div>
        </>
      )}

      {confirm && (
        <ConfirmDialog
          icon={confirm.status === "DELETE" ? Trash2 : confirm.status === "SUSPENDED" ? Ban : XCircle}
          tone="danger"
          title={confirm.status === "DELETE" ? `Delete ${confirm.nurse.name}'s account?` : confirm.status === "SUSPENDED" ? `Suspend ${confirm.nurse.name}?` : `Reject ${confirm.nurse.name}?`}
          message={confirm.status === "DELETE"
            ? "She'll be permanently blocked from logging in and her mobile number freed for a new registration. Past visits and earnings history are kept. This cannot be undone."
            : confirm.status === "SUSPENDED" ? "They'll be hidden from patients and locked out of their dashboard." : "They'll be told their application wasn't approved."}
          confirmLabel={confirm.status === "DELETE" ? "Delete account" : confirm.status === "SUSPENDED" ? "Suspend" : "Reject"}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const { nurse, status } = confirm;
            setConfirm(null);
            const done = status === "DELETE" ? await send(nurse, "DELETE", {}) : await update(nurse, { status });
            if (done && status === "DELETE") setOpenId(null);
          }}
        />
      )}

      {impact.dialog}
    </div>
  );
}
