"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Search, Wallet as WalletIcon, Eye, X, Phone, Mail, RefreshCw,
  ArrowDownCircle, ArrowUpCircle, ShieldCheck, PlusCircle, MinusCircle, AlertTriangle,
} from "lucide-react";
import { formatDoctorName } from "@/lib/utils";

interface WalletRow {
  userId: string;
  name: string;
  mobile: string;
  email: string | null;
  balance: number;
}

interface WalletTxn {
  id: string;
  type: string;
  status: string;
  amount: number;
  balanceAfter: number | null;
  note: string | null;
  createdAt: string;
  admin: { name: string } | null;
  appointment: { id: string; doctor: { name: string } } | null;
}

interface WalletDetail {
  user: { id: string; name: string; mobile: string; email: string | null };
  balance: number;
  transactions: WalletTxn[];
}

const TYPE_LABEL: Record<string, string> = {
  TOPUP: "Top-up",
  BOOKING_PAYMENT: "Appointment payment",
  ADMIN_CREDIT: "Admin credit",
  ADMIN_DEBIT: "Admin debit",
};

const CREDIT_TYPES = new Set(["TOPUP", "ADMIN_CREDIT"]);

// ── Wallet Detail Drawer ─────────────────────────────────────
function WalletDrawer({ userId, onClose, onAdjusted }: { userId: string; onClose: () => void; onAdjusted: () => void }) {
  const [data, setData] = useState<WalletDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [direction, setDirection] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmNegative, setConfirmNegative] = useState<{ currentBalance: number; resultingBalance: number } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/wallets/${userId}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); });
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const submit = async (acknowledgeNegative = false) => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { setError("Enter a valid amount."); return; }
    setSubmitting(true);
    setError("");
    const res = await fetch(`/api/admin/wallets/${userId}/adjust`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction, amount: amt, note, acknowledgeNegative }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 409 && body.requiresAcknowledgement) {
      setSubmitting(false);
      setConfirmNegative({ currentBalance: body.currentBalance, resultingBalance: body.resultingBalance });
      return;
    }
    if (!res.ok) {
      setSubmitting(false);
      setError(body.error ?? "Could not apply adjustment.");
      return;
    }
    setSubmitting(false);
    setConfirmNegative(null);
    setAmount("");
    setNote("");
    load();
    onAdjusted();
  };

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col animate-slide-in overflow-hidden">

        <div className="px-6 py-6 flex items-start justify-between flex-shrink-0"
          style={{ background: "linear-gradient(135deg, hsl(160,84%,32%) 0%, hsl(172,76%,40%) 100%)" }}>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-white text-2xl font-extrabold border border-white/30">
              {data?.user?.name?.charAt(0) ?? "P"}
            </div>
            <div>
              <div className="text-xl font-extrabold text-white">{data?.user?.name ?? "Loading…"}</div>
              <div className="text-emerald-100 text-sm mt-0.5">{data?.user?.mobile ?? ""}</div>
              <div className="text-white text-2xl font-extrabold mt-2">
                {data ? `₹${data.balance.toLocaleString("en-IN")}` : "—"}
              </div>
            </div>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 space-y-4">
              {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-10 rounded-xl" />)}
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Contact */}
              <div>
                <h3 className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                  <Phone className="w-3.5 h-3.5" /> Contact
                </h3>
                <div className="bg-slate-50 rounded-xl divide-y divide-slate-100 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 gap-4">
                    <div className="flex items-center gap-2 text-slate-500 text-sm"><Phone className="w-3.5 h-3.5" /> Mobile</div>
                    <span className="text-sm text-slate-800">{data?.user?.mobile ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 gap-4">
                    <div className="flex items-center gap-2 text-slate-500 text-sm"><Mail className="w-3.5 h-3.5" /> Email</div>
                    <span className="text-sm text-slate-800">{data?.user?.email ?? "Not provided"}</span>
                  </div>
                </div>
              </div>

              {/* Adjust balance */}
              <div>
                <h3 className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                  <ShieldCheck className="w-3.5 h-3.5" /> Adjust Balance
                </h3>
                <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDirection("CREDIT")}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                        direction === "CREDIT" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-200"
                      }`}
                    >
                      <PlusCircle className="w-4 h-4" /> Credit
                    </button>
                    <button
                      onClick={() => setDirection("DEBIT")}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                        direction === "DEBIT" ? "bg-red-600 text-white border-red-600" : "bg-white text-slate-600 border-slate-200"
                      }`}
                    >
                      <MinusCircle className="w-4 h-4" /> Debit
                    </button>
                  </div>
                  <input
                    type="number"
                    min={1}
                    placeholder="Amount (₹)"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="input-field w-full"
                  />
                  <input
                    type="text"
                    placeholder="Reason / note (optional)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="input-field w-full"
                  />
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <button
                    onClick={() => submit(false)}
                    disabled={submitting}
                    className="btn-primary w-full justify-center disabled:opacity-60"
                  >
                    {submitting ? "Applying…" : `Apply ${direction === "CREDIT" ? "Credit" : "Debit"}`}
                  </button>
                </div>
              </div>

              {/* Transaction History */}
              <div>
                <h3 className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                  <WalletIcon className="w-3.5 h-3.5" /> Transaction History
                </h3>
                {(data?.transactions.length ?? 0) === 0 ? (
                  <div className="px-4 py-6 text-sm text-slate-400 text-center bg-slate-50 rounded-xl">No transactions yet</div>
                ) : (
                  <div className="bg-slate-50 rounded-xl divide-y divide-slate-100 overflow-hidden">
                    {data?.transactions.map((t) => {
                      const isCredit = CREDIT_TYPES.has(t.type);
                      const Icon = isCredit ? ArrowDownCircle : ArrowUpCircle;
                      return (
                        <div key={t.id} className="flex items-center justify-between px-4 py-3 gap-4">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Icon className={`w-4 h-4 flex-shrink-0 ${isCredit ? "text-emerald-500" : "text-slate-400"}`} />
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-slate-800">{TYPE_LABEL[t.type] ?? t.type}</div>
                              <div className="text-xs text-slate-400 truncate">
                                {new Date(t.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                                {t.status !== "SUCCESS" && ` · ${t.status}`}
                                {t.appointment && ` · Dr. ${formatDoctorName(t.appointment.doctor.name)}`}
                                {t.admin && ` · by ${t.admin.name}`}
                                {t.note && ` · ${t.note}`}
                              </div>
                            </div>
                          </div>
                          <span className={`text-sm font-bold flex-shrink-0 ${t.status === "FAILED" ? "text-slate-300 line-through" : isCredit ? "text-emerald-600" : "text-slate-700"}`}>
                            {isCredit ? "+" : "−"}₹{t.amount}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 border-t border-slate-100 px-6 py-4 bg-slate-50">
          <p className="text-xs text-slate-400 text-center">
            Patient ID: <span className="font-mono">{userId.slice(0, 20)}…</span>
          </p>
        </div>
      </div>

      {/* Negative-balance acknowledgement */}
      {confirmNegative && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <h3 className="font-bold text-slate-800">This will take the wallet negative</h3>
            </div>
            <p className="text-sm text-slate-500 mb-5">
              Current balance ₹{confirmNegative.currentBalance.toLocaleString("en-IN")} → resulting balance ₹{confirmNegative.resultingBalance.toLocaleString("en-IN")}. Continue anyway?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmNegative(null)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => submit(true)}
                disabled={submitting}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-60"
              >
                {submitting ? "Applying…" : "Confirm Debit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Main page ──────────────────────────────────────────────────
export default function AdminWallets() {
  const [rows, setRows] = useState<WalletRow[]>([]);
  const [totalLiability, setTotalLiability] = useState(0);
  const [walletedCount, setWalletedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewId, setViewId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/wallets")
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rows);
        setTotalLiability(d.totalLiability);
        setWalletedCount(d.walletedCount);
        setLoading(false);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(
    (r) => r.name.toLowerCase().includes(search.toLowerCase()) || r.mobile.includes(search)
  );

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Patient Wallets</h1>
          <p className="text-slate-500 text-sm mt-1">View balances and manage credit/debit adjustments across all patients.</p>
        </div>
        <button onClick={load} className="btn-ghost gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 gap-4 mb-6">
        <div className="stat-card">
          <div className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Total Wallet Liability</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">₹{totalLiability.toLocaleString("en-IN")}</div>
        </div>
        <div className="stat-card">
          <div className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Active Wallets</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">{walletedCount}</div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-6">
        <div className="relative max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Search by name or mobile…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-10" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Mobile</th>
                  <th>Balance</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-12 text-slate-400">
                    <WalletIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No patients found.
                  </td></tr>
                ) : filtered.map((r) => (
                  <tr key={r.userId}>
                    <td>
                      <div className="font-semibold text-slate-900">{r.name}</div>
                      <div className="text-xs text-slate-400">{r.email ?? "No email"}</div>
                    </td>
                    <td className="font-mono text-xs">{r.mobile}</td>
                    <td>
                      <span className={r.balance < 0 ? "badge badge-danger" : "badge badge-success"}>
                        ₹{r.balance.toLocaleString("en-IN")}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => setViewId(r.userId)}
                        title="View & Adjust Wallet"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-5 py-3.5 border-t border-slate-100 text-xs text-slate-400">
          Showing {filtered.length} of {rows.length} patients
        </div>
      </div>

      {viewId && (
        <WalletDrawer userId={viewId} onClose={() => setViewId(null)} onAdjusted={load} />
      )}
    </div>
  );
}
