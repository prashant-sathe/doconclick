"use client";
import { useEffect, useState, useMemo } from "react";
import { IndianRupee, TrendingUp, Save, Wallet } from "lucide-react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams, ValueFormatterParams } from "ag-grid-community";
import { formatDoctorName } from "@/lib/utils";
import { brandGridTheme } from "@/lib/agGridTheme";

interface Analytics {
  totalRevenue: number;
  totalPlatformFee: number;
  totalAppointments: number;
}
interface PendingSettlement {
  doctorId: string;
  doctorName: string;
  doctorMobile: string | null;
  bankDetails: string | null;
  cashCount: number;
  onlineCount: number;
  cashFeeOwed: number;
  onlinePayoutOwed: number;
  netAmount: number;
}
interface SettlementRecord {
  id: string;
  doctor: { name: string };
  settledByAdmin: { name: string } | null;
  cashCount: number;
  onlineCount: number;
  cashFeeOwed: number;
  onlinePayoutOwed: number;
  netAmount: number;
  createdAt: string;
}

export default function AdminFinance() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [clinicCommission, setClinicCommission] = useState("10");
  const [videoCommission, setVideoCommission] = useState("10");
  const [homeCommission, setHomeCommission] = useState("10");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState<PendingSettlement[]>([]);
  const [history, setHistory] = useState<SettlementRecord[]>([]);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [confirmNegative, setConfirmNegative] = useState<PendingSettlement | null>(null);

  const loadSettlements = () => {
    fetch("/api/admin/finance/settlements").then((r) => r.json()).then(setPending);
    fetch("/api/admin/finance/settlements/history").then((r) => r.json()).then(setHistory);
  };

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/settings").then((r) => r.json()),
      fetch("/api/admin/analytics").then((r) => r.json()),
    ]).then(([s, a]) => {
      setClinicCommission(String(s.clinicCommissionPercent));
      setVideoCommission(String(s.videoCommissionPercent));
      setHomeCommission(String(s.homeCommissionPercent));
      setAnalytics(a);
    });
    loadSettlements();
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clinicCommissionPercent: parseFloat(clinicCommission),
        videoCommissionPercent: parseFloat(videoCommission),
        homeCommissionPercent: parseFloat(homeCommission),
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const settleDoctor = async (doctorId: string, acknowledgeNegative = false) => {
    setSettlingId(doctorId);
    const res = await fetch("/api/admin/finance/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doctorId, acknowledgeNegative }),
    });
    if (res.status === 409) {
      const data = await res.json();
      const doctorName = pending.find((p) => p.doctorId === doctorId)?.doctorName ?? "This doctor";
      setSettlingId(null);
      setConfirmNegative({ doctorId, doctorName, ...data });
      return;
    }
    setSettlingId(null);
    setConfirmNegative(null);
    loadSettlements();
  };

  const pendingColumnDefs = useMemo<ColDef<PendingSettlement>[]>(() => [
    {
      headerName: "Doctor",
      field: "doctorName",
      minWidth: 220,
      flex: 1.3,
      cellRenderer: (p: ICellRendererParams<PendingSettlement>) => {
        const row = p.data;
        if (!row) return null;
        return (
          <div className="leading-tight py-1">
            <div className="font-semibold text-slate-800">{formatDoctorName(row.doctorName)}</div>
            {row.bankDetails ? (
              <div className="text-[11px] text-slate-400">{row.bankDetails}</div>
            ) : (
              <div className="text-[11px] text-red-500">No bank details on file{row.doctorMobile ? ` · ${row.doctorMobile}` : ""}</div>
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
      cellRenderer: (p: ICellRendererParams<PendingSettlement>) => (
        <button
          onClick={() => p.data && settleDoctor(p.data.doctorId)}
          disabled={settlingId === p.data?.doctorId}
          className="btn-primary text-xs py-1.5 px-3"
        >
          {settlingId === p.data?.doctorId ? "Settling…" : "Settle Now"}
        </button>
      ),
    },
  ], [settlingId]);

  const historyColumnDefs = useMemo<ColDef<SettlementRecord>[]>(() => [
    {
      headerName: "Doctor",
      field: "doctor.name",
      minWidth: 180,
      flex: 1.2,
      valueFormatter: (p: ValueFormatterParams<SettlementRecord>) => formatDoctorName(p.value ?? ""),
      cellClass: "font-semibold text-slate-800",
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
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-slate-900">Finance & Commission</h1>
        <p className="text-slate-500 text-sm mt-1">Manage platform earnings and commission settings.</p>
      </div>

      {/* Revenue Cards */}
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
              <p className="text-3xl font-extrabold text-emerald-600">₹{analytics?.totalPlatformFee.toLocaleString() ?? "—"}</p>
              <p className="text-xs text-slate-400 mt-1">Varies by visit type</p>
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

      {/* Commission Settings */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 max-w-lg">
        <h2 className="font-bold text-slate-800 mb-1 text-lg">Commission Settings</h2>
        <p className="text-xs text-slate-400 mb-5">
          Set a different platform commission per visit type. Applies to future appointments only — already-booked appointments keep the rate they were charged at.
        </p>
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
          <label className="input-label">Video Call Commission (%)</label>
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
          onClick={saveSettings}
          disabled={saving}
          className="btn-primary gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving…" : saved ? "✓ Saved!" : "Save Settings"}
        </button>
      </div>

      {/* Pending Settlements */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mt-8">
        <h2 className="font-bold text-slate-800 mb-1 text-lg">Pending Settlements</h2>
        <p className="text-xs text-slate-400 mb-5">
          Cash fee owed = commission the doctor collected in cash and owes the platform. Online payout owed = money the platform holds and owes the doctor.
        </p>
        {pending.length === 0 ? (
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
        {history.length === 0 ? (
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
              {formatDoctorName(confirmNegative.doctorName)} owes the platform ₹{Math.abs(confirmNegative.netAmount).toLocaleString("en-IN")} net
              (₹{confirmNegative.cashFeeOwed.toLocaleString("en-IN")} cash fee vs ₹{confirmNegative.onlinePayoutOwed.toLocaleString("en-IN")} online payout).
              Settling will record this as a net amount owed by the doctor. Continue?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmNegative(null)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={() => settleDoctor(confirmNegative.doctorId, true)}
                className="btn-primary flex-1"
              >
                Confirm Settle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
