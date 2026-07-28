"use client";
import { useEffect, useState } from "react";
import { IndianRupee, TrendingUp, Save } from "lucide-react";

interface Settings { id: string; commissionPercent: number }
interface Analytics {
  totalRevenue: number;
  totalPlatformFee: number;
  totalAppointments: number;
}

export default function AdminFinance() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [commission, setCommission] = useState("10");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/settings").then((r) => r.json()),
      fetch("/api/admin/analytics").then((r) => r.json()),
    ]).then(([s, a]) => {
      setSettings(s);
      setCommission(String(s.commissionPercent));
      setAnalytics(a);
    });
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionPercent: parseFloat(commission) }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

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
              <p className="text-xs text-slate-400 mt-1">{settings?.commissionPercent ?? 10}% of gross</p>
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
        <h2 className="font-bold text-slate-800 mb-5 text-lg">Commission Settings</h2>
        <div className="form-group mb-5">
          <label className="input-label">Platform Commission (%)</label>
          <div className="relative">
            <input
              type="number"
              min={1}
              max={50}
              step={0.5}
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              className="input-field pr-16"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">% fee</span>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            This percentage is charged on each completed consultation. Applies to future appointments.
          </p>
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
    </div>
  );
}
