"use client";
import { useState, useMemo, useRef } from "react";
import { IndianRupee, TrendingUp, Save, Wallet, BadgeCheck, XCircle } from "lucide-react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams, ValueFormatterParams } from "ag-grid-community";
import { formatProviderName } from "@/lib/utils";

// Nurses are settled here too (same Appointment/Settlement rows) — never "Dr." them.
const providerName = (name: string, role?: string | null) => formatProviderName(name, role === "NURSE" ? "NURSE" : "DOCTOR");
import { brandGridTheme } from "@/lib/agGridTheme";
import ConfirmDialog from "@/components/ConfirmDialog";
import LoadError from "@/components/LoadError";
import DuesReviewPanel from "@/components/admin/DuesReviewPanel";
import { useToast } from "@/components/Toast";
import { useLoad } from "@/lib/apiClient";
import { istDayKey } from "@/lib/istDate";

interface Analytics {
  totalRevenue: number;
  totalPlatformFee: number;
  totalCouponDiscounts: number;
  totalPlatformEarnings: number;
  totalAppointments: number;
}
interface CommissionSettings {
  clinicCommissionPercent: number;
  videoCommissionPercent: number;
  homeCommissionPercent: number;
}
interface PendingSettlement {
  doctorId: string;
  doctorName: string;
  providerRole?: string;
  doctorMobile: string | null;
  bankDetails: string | null;
  cashCount: number;
  onlineCount: number;
  cashFeeOwed: number;
  onlinePayoutOwed: number;
  netAmount: number;
  payoutRequestId: string | null;
  payoutRequestedAt: string | null;
  payoutRequestedAmount: number | null;
}
interface SettlementRecord {
  id: string;
  doctor: { name: string; role?: string };
  settledByAdmin: { name: string } | null;
  cashCount: number;
  onlineCount: number;
  cashFeeOwed: number;
  onlinePayoutOwed: number;
  netAmount: number;
  createdAt: string;
  // PREPARED → (Mark paid) → PAID; NO_PAYOUT when net ≤ 0; null = settled before payout tracking
  status: string | null;
  payoutReference: string | null;
  paidAt: string | null;
  payoutNote: string | null;
  paidByAdmin: { name: string } | null;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  PREPARED: { label: "Prepared — not paid", className: "badge badge-warning" },
  PAID: { label: "Paid", className: "badge badge-success" },
  NO_PAYOUT: { label: "No payout", className: "badge badge-gray" },
};

// crypto.randomUUID only exists on secure origins; an admin page served over
// plain HTTP (e.g. straight to an EC2 IP) still has getRandomValues.
function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

export default function AdminFinance() {
  const toast = useToast();
  // Each section loads on its own, so one failing endpoint doesn't hide the rest.
  const analyticsLoad = useLoad<Analytics>("/api/admin/analytics", { fallback: "Couldn't load revenue figures." });
  const settingsLoad = useLoad<CommissionSettings>("/api/admin/settings", { fallback: "Couldn't load commission settings." });
  const pendingLoad = useLoad<PendingSettlement[]>("/api/admin/finance/settlements", { fallback: "Couldn't load pending settlements." });
  const historyLoad = useLoad<SettlementRecord[]>("/api/admin/finance/settlements/history", { fallback: "Couldn't load settlement history." });
  const analytics = analyticsLoad.data;
  const pending = useMemo(() => (Array.isArray(pendingLoad.data) ? pendingLoad.data : []), [pendingLoad.data]);
  const history = useMemo(() => (Array.isArray(historyLoad.data) ? historyLoad.data : []), [historyLoad.data]);
  // A field shows the saved rate until the admin edits it (null = untouched).
  // Until the settings load there's nothing to show — and saving is blocked,
  // so placeholder values can never overwrite the real rates.
  const [clinicEdit, setClinicCommission] = useState<string | null>(null);
  const [videoEdit, setVideoCommission] = useState<string | null>(null);
  const [homeEdit, setHomeCommission] = useState<string | null>(null);
  const savedRates = settingsLoad.data;
  const clinicCommission = clinicEdit ?? (savedRates ? String(savedRates.clinicCommissionPercent) : "");
  const videoCommission = videoEdit ?? (savedRates ? String(savedRates.videoCommissionPercent) : "");
  const homeCommission = homeEdit ?? (savedRates ? String(savedRates.homeCommissionPercent) : "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [confirmNegative, setConfirmNegative] = useState<PendingSettlement | null>(null);
  const [settleTarget, setSettleTarget] = useState<PendingSettlement | null>(null);
  const [settleError, setSettleError] = useState("");
  // One idempotency key per "settle this doctor" intent — reused for the
  // negative-net acknowledgement and any retry (incl. after a lost response),
  // so the API returns the same settlement instead of creating a second one.
  const settleKeys = useRef<Record<string, string>>({});
  // Synchronous guard: state updates land a render later, a double-click doesn't.
  const settleInFlight = useRef(false);
  const [confirmSaveSettings, setConfirmSaveSettings] = useState(false);
  // Mark paid (UTR + date + admin-only note) and dismiss-request dialogs.
  const [payTarget, setPayTarget] = useState<SettlementRecord | null>(null);
  const [payRef, setPayRef] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payError, setPayError] = useState("");
  const [payDuplicate, setPayDuplicate] = useState(false);
  const [paying, setPaying] = useState(false);
  const [dismissTarget, setDismissTarget] = useState<PendingSettlement | null>(null);
  const [dismissReason, setDismissReason] = useState("");
  const [dismissError, setDismissError] = useState("");
  const [dismissing, setDismissing] = useState(false);
  // Synchronous guard for both, like settleInFlight.
  const actionInFlight = useRef(false);

  const loadSettlements = () => {
    void pendingLoad.reload();
    void historyLoad.reload();
  };

  // A blank or out-of-range field must never be sent — the API would reject
  // it, and before that it used to silently become 0%.
  const parseCommissions = () => {
    const values = [clinicCommission, videoCommission, homeCommission].map((v) => (v.trim() === "" ? NaN : Number(v)));
    return values.every((v) => Number.isFinite(v) && v >= 0 && v <= 100) ? values : null;
  };

  const requestSaveSettings = () => {
    setSaved(false);
    if (!settingsLoad.data) return;
    if (!parseCommissions()) {
      setSettingsError("Enter every commission as a number between 0 and 100.");
      return;
    }
    setSettingsError("");
    setConfirmSaveSettings(true);
  };

  const saveSettings = async () => {
    const values = parseCommissions();
    if (!values) {
      setSettingsError("Enter every commission as a number between 0 and 100.");
      return;
    }
    const [clinic, video, home] = values;
    setSaving(true);
    setSaved(false);
    setSettingsError("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinicCommissionPercent: clinic,
          videoCommissionPercent: video,
          homeCommissionPercent: home,
        }),
      });
      if (!res.ok) {
        setSettingsError((await res.json().catch(() => ({}))).error ?? "Could not save commission settings.");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      void settingsLoad.reload();
    } catch {
      setSettingsError("Network error — commission settings were not saved.");
    } finally {
      setSaving(false);
    }
  };

  // Resolves true once the settle went through or moved on to the
  // negative-net acknowledgement; false if it failed (the dialog stays open).
  const settleDoctor = async (doctorId: string, acknowledgeNegative = false): Promise<boolean> => {
    if (settleInFlight.current) return false;
    settleInFlight.current = true;
    setSettlingId(doctorId);
    setSettleError("");
    const idempotencyKey = (settleKeys.current[doctorId] ??= newIdempotencyKey());
    try {
      const res = await fetch("/api/admin/finance/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorId, acknowledgeNegative, idempotencyKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.requiresAcknowledgement) {
        const row = pending.find((p) => p.doctorId === doctorId);
        const doctorName = row?.doctorName ?? "This doctor";
        const providerRole = row?.providerRole;
        setConfirmNegative({ doctorId, doctorName, providerRole, ...data });
        return true;
      }
      if (!res.ok) {
        const message = data.error ?? "Could not settle. Please try again.";
        setSettleError(message);
        toast.error(message);
        return false;
      }
      delete settleKeys.current[doctorId];
      setConfirmNegative(null);
      loadSettlements();
      return true;
    } catch {
      // Safe to retry: the same key returns the settlement if this one actually went through.
      setSettleError("Network error — please try again.");
      toast.error("Network error — the settlement may not have gone through. Please try again.");
      return false;
    } finally {
      settleInFlight.current = false;
      setSettlingId(null);
    }
  };

  const openMarkPaid = (row: SettlementRecord) => {
    setPayTarget(row);
    setPayRef("");
    setPayDate(istDayKey(new Date()));
    setPayNote("");
    setPayError("");
    setPayDuplicate(false);
  };

  // The server re-checks everything: PREPARED → PAID is a conditional claim
  // (409 on a double click), and a UTR already used elsewhere needs a second confirm.
  const markPaid = async () => {
    if (!payTarget || actionInFlight.current) return;
    actionInFlight.current = true;
    setPaying(true);
    setPayError("");
    try {
      const res = await fetch(`/api/admin/finance/settlements/${payTarget.id}/paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: payRef, paidOn: payDate, note: payNote, confirmDuplicate: payDuplicate }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.code === "DUPLICATE_REFERENCE") {
        setPayDuplicate(true);
        const others = (data.duplicates ?? []) as { doctor?: { name: string; role?: string } }[];
        setPayError(`${data.error} (${others.map((d) => providerName(d.doctor?.name ?? "", d.doctor?.role)).join(", ")}). Check it, then press Mark paid again to record it anyway.`);
        return;
      }
      if (!res.ok) {
        setPayError(data.error ?? "Could not mark this settlement paid.");
        if (res.status === 409) void historyLoad.reload();
        return;
      }
      toast.success("Payout marked paid.");
      setPayTarget(null);
      void historyLoad.reload();
    } catch {
      setPayError("Network error — refresh to check whether it was recorded before trying again.");
    } finally {
      actionInFlight.current = false;
      setPaying(false);
    }
  };

  const dismissRequest = async () => {
    if (!dismissTarget?.payoutRequestId || actionInFlight.current) return;
    actionInFlight.current = true;
    setDismissing(true);
    setDismissError("");
    try {
      const res = await fetch(`/api/admin/finance/payout-requests/${dismissTarget.payoutRequestId}/dismiss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: dismissReason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDismissError(data.error ?? "Could not dismiss the request.");
        if (res.status === 409) void pendingLoad.reload();
        return;
      }
      toast.success("Payout request dismissed — the provider has been notified.");
      setDismissTarget(null);
      void pendingLoad.reload();
    } catch {
      setDismissError("Network error — please try again.");
    } finally {
      actionInFlight.current = false;
      setDismissing(false);
    }
  };

  const pendingColumnDefs = useMemo<ColDef<PendingSettlement>[]>(() => [
    {
      headerName: "Doctor",
      field: "doctorName",
      minWidth: 220,
      flex: 1.3,
      // Wraps and grows, so the bank line and Dismiss stay visible (incl. at 390px).
      autoHeight: true,
      cellClass: "!whitespace-normal",
      cellRenderer: (p: ICellRendererParams<PendingSettlement>) => {
        const row = p.data;
        if (!row) return null;
        return (
          <div className="leading-tight py-1">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              {providerName(row.doctorName, row.providerRole)}
              {row.payoutRequestedAt && (
                <span className="badge badge-warning text-[10px]" title={`Requested ${new Date(row.payoutRequestedAt).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })}${row.payoutRequestedAmount != null && row.payoutRequestedAmount !== row.netAmount ? ` (₹${row.payoutRequestedAmount.toLocaleString("en-IN")} then; settling pays ₹${row.netAmount.toLocaleString("en-IN")}, what's owed now)` : ""}`}>
                  Requested
                </span>
              )}
            </div>
            {row.bankDetails ? (
              <div className="text-[11px] text-slate-400">{row.bankDetails}</div>
            ) : (
              <div className="text-[11px] text-red-500">No bank details on file{row.doctorMobile ? ` · ${row.doctorMobile}` : ""}</div>
            )}
            {row.payoutRequestId && (
              <button
                onClick={() => { setDismissTarget(row); setDismissReason(""); setDismissError(""); }}
                className="text-[11px] font-semibold text-slate-500 hover:text-red-600 underline mt-0.5"
              >
                Dismiss request
              </button>
            )}
          </div>
        );
      },
    },
    {
      headerName: "Cash Fee Owed",
      field: "cashFeeOwed",
      minWidth: 170,
      flex: 1,
      cellRenderer: (p: ICellRendererParams<PendingSettlement>) => (
        <span className="text-amber-600">₹{(p.value ?? 0).toLocaleString("en-IN")} <span className="text-slate-400">({p.data?.cashCount})</span></span>
      ),
    },
    {
      headerName: "Online Payout Owed",
      field: "onlinePayoutOwed",
      minWidth: 190,
      flex: 1,
      cellRenderer: (p: ICellRendererParams<PendingSettlement>) => (
        <span className="text-purple-600">₹{(p.value ?? 0).toLocaleString("en-IN")} <span className="text-slate-400">({p.data?.onlineCount})</span></span>
      ),
    },
    {
      headerName: "Net",
      field: "netAmount",
      width: 140,
      cellRenderer: (p: ICellRendererParams<PendingSettlement>) => {
        const v = p.value ?? 0;
        return (
          <span className={`font-bold ${v < 0 ? "text-red-600" : "text-emerald-600"}`}>
            {v < 0 ? "−" : ""}₹{Math.abs(v).toLocaleString("en-IN")}
          </span>
        );
      },
    },
    {
      headerName: "",
      field: "doctorId",
      width: 140,
      sortable: false,
      filter: false,
      // A row only there for its open request (nothing unsettled) has nothing to settle.
      cellRenderer: (p: ICellRendererParams<PendingSettlement>) => p.data && p.data.cashCount + p.data.onlineCount === 0 ? (
        <span className="text-xs text-slate-400">Nothing to settle</span>
      ) : (
        <button
          onClick={() => p.data && setSettleTarget(p.data)}
          disabled={settlingId !== null}
          className="btn-primary text-xs py-1.5 px-3"
        >
          {settlingId === p.data?.doctorId ? "Settling…" : "Settle Now"}
        </button>
      ),
    },
  ], [settlingId]);

  const historyColumnDefs = useMemo<ColDef<SettlementRecord>[]>(() => [
    {
      // Doctor + payout status + Mark paid stacked in the first column, so the
      // required step is on screen without scrolling the grid (incl. at 390px).
      headerName: "Doctor / Payout",
      field: "doctor.name",
      minWidth: 240,
      flex: 1.6,
      autoHeight: true,
      cellClass: "!whitespace-normal",
      valueFormatter: (p: ValueFormatterParams<SettlementRecord>) => providerName(p.value ?? "", p.data?.doctor.role),
      cellRenderer: (p: ICellRendererParams<SettlementRecord>) => {
        const row = p.data;
        if (!row) return null;
        const badge = row.status ? STATUS_BADGE[row.status] : null;
        return (
          <div className="leading-tight py-1.5 space-y-1">
            <div className="font-semibold text-slate-800">{providerName(row.doctor.name, row.doctor.role)}</div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`${badge?.className ?? "badge badge-gray"} text-[10px] whitespace-normal`}>{badge?.label ?? "Settled (no reference)"}</span>
              {row.status === "PREPARED" && (
                <button onClick={() => openMarkPaid(row)} className="btn-primary text-xs py-1 px-3">
                  Mark paid
                </button>
              )}
            </div>
            {row.status === "PAID" && (
              <div className="text-[11px] text-slate-500 [overflow-wrap:anywhere]" title={row.payoutNote ?? undefined}>
                UTR {row.payoutReference} · {row.paidAt ? new Date(row.paidAt).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }) : ""}
                {row.paidByAdmin ? ` · ${row.paidByAdmin.name}` : ""}
                {row.payoutNote ? " · note" : ""}
              </div>
            )}
          </div>
        );
      },
    },
    {
      headerName: "Date",
      field: "createdAt",
      width: 140,
      valueGetter: (p) => (p.data ? new Date(p.data.createdAt) : null),
      valueFormatter: (p) => (p.value instanceof Date ? p.value.toLocaleDateString("en-IN", { dateStyle: "medium" }) : ""),
      cellClass: "text-xs text-slate-500",
      sort: "desc",
    },
    { headerName: "Cash", field: "cashCount", width: 100 },
    { headerName: "Online", field: "onlineCount", width: 100 },
    {
      headerName: "Settled By",
      field: "settledByAdmin.name",
      minWidth: 140,
      flex: 1,
      valueFormatter: (p: ValueFormatterParams<SettlementRecord>) => p.value ?? "—",
      cellClass: "text-xs text-slate-500",
    },
    {
      headerName: "Net",
      field: "netAmount",
      width: 140,
      cellRenderer: (p: ICellRendererParams<SettlementRecord>) => {
        const v = p.value ?? 0;
        return (
          <span className={`font-bold ${v < 0 ? "text-red-600" : "text-emerald-600"}`}>
            {v < 0 ? "−" : ""}₹{Math.abs(v).toLocaleString("en-IN")}
          </span>
        );
      },
    },
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, resizable: true, filter: true }), []);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-slate-900">Finance & Commission</h1>
        <p className="text-slate-500 text-sm mt-1">Manage platform earnings and commission settings.</p>
      </div>

      {/* Revenue Cards */}
      {analyticsLoad.error && (
        <div className="mb-8">
          <LoadError error={analyticsLoad.error} onRetry={analyticsLoad.reload} retrying={analyticsLoad.reloading} hasData={!!analytics} />
        </div>
      )}
      {!(analyticsLoad.error && !analytics) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          <div className="stat-card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Gross Revenue</p>
                <p className="text-3xl font-extrabold text-slate-900">₹{analytics?.totalRevenue.toLocaleString() ?? "—"}</p>
                <p className="text-xs text-slate-400 mt-1">From completed consultations</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center">
                <IndianRupee className="w-6 h-6" />
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Platform Earnings</p>
                <p className="text-3xl font-extrabold text-emerald-600">₹{analytics?.totalPlatformEarnings.toLocaleString() ?? "—"}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {analytics && analytics.totalCouponDiscounts > 0
                    ? `₹${analytics.totalPlatformFee.toLocaleString()} commission − ₹${analytics.totalCouponDiscounts.toLocaleString()} coupons`
                    : "Varies by visit type"}
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center">
                <TrendingUp className="w-6 h-6" />
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Doctor Payouts</p>
                <p className="text-3xl font-extrabold text-purple-600">
                  ₹{((analytics?.totalRevenue ?? 0) - (analytics?.totalPlatformFee ?? 0)).toLocaleString()}
                </p>
                <p className="text-xs text-slate-400 mt-1">Net to doctors</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-500 flex items-center justify-center">
                <IndianRupee className="w-6 h-6" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Commission Settings */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 max-w-lg">
        <h2 className="font-bold text-slate-800 mb-1 text-lg">Commission Settings</h2>
        <p className="text-xs text-slate-400 mb-5">
          Set a different platform commission per visit type. Applies to future appointments only — already-booked appointments keep the rate they were charged at.
        </p>
        {settingsLoad.error && (
          <LoadError error={settingsLoad.error} onRetry={settingsLoad.reload} retrying={settingsLoad.reloading} hasData={!!settingsLoad.data} />
        )}
        {settingsLoad.error && !settingsLoad.data ? null : (
          <>
          <div className="form-group mb-4">
            <label className="input-label">Clinic Visit Commission (%)</label>
            <div className="relative">
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={clinicCommission}
                onChange={(e) => setClinicCommission(e.target.value)}
                className="input-field pr-16"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">% fee</span>
            </div>
          </div>
          <div className="form-group mb-4">
            <label className="input-label">Video Consultation Commission (%)</label>
            <div className="relative">
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={videoCommission}
                onChange={(e) => setVideoCommission(e.target.value)}
                className="input-field pr-16"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">% fee</span>
            </div>
          </div>
          <div className="form-group mb-5">
            <label className="input-label">Home Visit Commission (%)</label>
            <div className="relative">
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={homeCommission}
                onChange={(e) => setHomeCommission(e.target.value)}
                className="input-field pr-16"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">% fee</span>
            </div>
          </div>
          <button
            onClick={requestSaveSettings}
            disabled={saving || !settingsLoad.data}
            className="btn-primary gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : saved ? "✓ Saved!" : "Save Settings"}
          </button>
          {settingsError && <p className="text-sm text-red-600 mt-3">{settingsError}</p>}
          </>
        )}
      </div>

      <DuesReviewPanel />

      {/* Pending Settlements */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mt-8">
        <h2 className="font-bold text-slate-800 mb-1 text-lg">Pending Settlements</h2>
        {settleError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 my-3">{settleError}</p>}
        <p className="text-xs text-slate-400 mb-5">
          Cash fee owed = commission the doctor collected in cash and owes the platform. Online payout owed = money the platform holds and owes the doctor.
        </p>
        {pendingLoad.error && (
          <LoadError error={pendingLoad.error} onRetry={pendingLoad.reload} retrying={pendingLoad.reloading} hasData={!!pendingLoad.data} />
        )}
        {pendingLoad.loading ? (
          <div className="skeleton h-24 rounded-xl" />
        ) : !pendingLoad.data ? null : pending.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">Nothing to settle right now.</p>
        ) : (
          <AgGridReact<PendingSettlement>
            theme={brandGridTheme}
            rowData={pending}
            columnDefs={pendingColumnDefs}
            defaultColDef={defaultColDef}
            domLayout="autoHeight"
            animateRows
          />
        )}
      </div>

      {/* Settlement History */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mt-6">
        <h2 className="font-bold text-slate-800 mb-5 text-lg">Settlement History</h2>
        {historyLoad.error && (
          <LoadError error={historyLoad.error} onRetry={historyLoad.reload} retrying={historyLoad.reloading} hasData={!!historyLoad.data} />
        )}
        {historyLoad.loading ? (
          <div className="skeleton h-24 rounded-xl" />
        ) : !historyLoad.data ? null : history.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No settlements recorded yet.</p>
        ) : (
          <AgGridReact<SettlementRecord>
            theme={brandGridTheme}
            rowData={history}
            columnDefs={historyColumnDefs}
            defaultColDef={defaultColDef}
            domLayout="autoHeight"
            pagination
            paginationPageSize={10}
            paginationPageSizeSelector={[10, 20, 50, 100]}
            animateRows
          />
        )}
      </div>

      {/* Negative-net confirmation */}
      {confirmNegative && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-2 mb-3">
              <Wallet className="w-5 h-5 text-red-600" />
              <h3 className="font-bold text-slate-800">Doctor owes the platform</h3>
            </div>
            <p className="text-sm text-slate-500 mb-5">
              {providerName(confirmNegative.doctorName, confirmNegative.providerRole)} owes the platform ₹{Math.abs(confirmNegative.netAmount).toLocaleString("en-IN")} net
              (₹{confirmNegative.cashFeeOwed.toLocaleString("en-IN")} cash fee vs ₹{confirmNegative.onlinePayoutOwed.toLocaleString("en-IN")} online payout).
              Settling will record this as a net amount owed by the doctor. Continue?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { delete settleKeys.current[confirmNegative.doctorId]; setConfirmNegative(null); }}
                disabled={settlingId === confirmNegative.doctorId}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={() => settleDoctor(confirmNegative.doctorId, true)}
                disabled={settlingId === confirmNegative.doctorId}
                className="btn-primary flex-1 disabled:opacity-60"
              >
                {settlingId === confirmNegative.doctorId ? "Settling…" : "Confirm Settle"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settle Now confirmation */}
      {settleTarget && (
        <ConfirmDialog
          icon={Wallet}
          title={`Settle with ${providerName(settleTarget.doctorName, settleTarget.providerRole)}?`}
          message={
            <>
              This prepares a settlement for their {settleTarget.cashCount} cash and {settleTarget.onlineCount} online due{settleTarget.cashCount + settleTarget.onlineCount === 1 ? "" : "s"} — net{" "}
              <span className={settleTarget.netAmount < 0 ? "font-semibold text-red-600" : "font-semibold text-emerald-600"}>
                {settleTarget.netAmount < 0 ? "−" : ""}₹{Math.abs(settleTarget.netAmount).toLocaleString("en-IN")}
              </span>
              . It is recorded permanently and cannot be undone.{settleTarget.netAmount > 0 ? " After you send the money, use Mark paid in Settlement History to record the UTR." : ""}
            </>
          }
          confirmLabel="Settle Now"
          busyLabel="Settling…"
          tone="primary"
          busy={settlingId === settleTarget.doctorId}
          onCancel={() => setSettleTarget(null)}
          onConfirm={async () => {
            if (await settleDoctor(settleTarget.doctorId)) setSettleTarget(null);
          }}
        />
      )}

      {/* Mark paid */}
      {payTarget && (
        <ConfirmDialog
          icon={BadgeCheck}
          title={`Mark ₹${payTarget.netAmount.toLocaleString("en-IN")} paid to ${providerName(payTarget.doctor.name, payTarget.doctor.role)}?`}
          message={
            <div className="space-y-3">
              <div>
                <label className="input-label">UTR / bank reference</label>
                <input
                  value={payRef}
                  onChange={(e) => { setPayRef(e.target.value); setPayDuplicate(false); }}
                  maxLength={40}
                  className="input-field font-mono uppercase"
                  placeholder="e.g. 412345678901"
                  autoFocus
                />
              </div>
              <div>
                <label className="input-label">Date sent</label>
                <input type="date" value={payDate} max={istDayKey(new Date())} onChange={(e) => setPayDate(e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="input-label">Note (admin only — not shown to the provider)</label>
                <textarea value={payNote} onChange={(e) => setPayNote(e.target.value)} maxLength={500} rows={2} className="input-field" />
              </div>
              {payError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">{payError}</p>}
            </div>
          }
          confirmLabel={payDuplicate ? "Record anyway" : "Mark paid"}
          busyLabel="Saving…"
          tone="success"
          busy={paying}
          confirmDisabled={payRef.trim().length < 6 || !payDate}
          onCancel={() => setPayTarget(null)}
          onConfirm={markPaid}
        />
      )}

      {/* Dismiss payout request */}
      {dismissTarget && (
        <ConfirmDialog
          icon={XCircle}
          title={`Dismiss ${providerName(dismissTarget.doctorName, dismissTarget.providerRole)}'s payout request?`}
          message={
            <div className="space-y-3">
              <p>Nothing is settled or paid. The provider is notified with this reason and can request again.</p>
              <div>
                <label className="input-label">Reason (shown to the provider)</label>
                <textarea value={dismissReason} onChange={(e) => setDismissReason(e.target.value)} maxLength={300} rows={3} className="input-field" autoFocus />
              </div>
              {dismissError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">{dismissError}</p>}
            </div>
          }
          confirmLabel="Dismiss request"
          busyLabel="Dismissing…"
          tone="danger"
          busy={dismissing}
          confirmDisabled={dismissReason.trim().length < 5}
          onCancel={() => setDismissTarget(null)}
          onConfirm={dismissRequest}
        />
      )}

      {/* Save commission settings confirmation */}
      {confirmSaveSettings && (
        <ConfirmDialog
          icon={Save}
          title="Update commission rates?"
          message={
            <>
              New rates — Clinic {clinicCommission}%, Video {videoCommission}%, Home {homeCommission}% — apply to every appointment booked from now on. Appointments already booked keep their original rate.
            </>
          }
          confirmLabel="Save Settings"
          busyLabel="Saving…"
          tone="primary"
          busy={saving}
          onCancel={() => setConfirmSaveSettings(false)}
          onConfirm={async () => {
            await saveSettings();
            setConfirmSaveSettings(false);
          }}
        />
      )}
    </div>
  );
}
