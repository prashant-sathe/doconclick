"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import ReportTable, { type SummaryCard } from "@/components/admin/reports/ReportTable";
import { getReportConfig, type ReportRow } from "../report-configs";

export default function ReportDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const config = getReportConfig(params.slug);

  const [rows, setRows] = useState<ReportRow[]>([]);
  const [summary, setSummary] = useState<ReportRow | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("ALL");

  const load = useCallback(() => {
    if (!config) return;
    setLoading(true);
    const qs = new URLSearchParams();
    if (config.dateFilter && from) qs.set("from", from);
    if (config.dateFilter && to) qs.set("to", to);
    if (config.statusFilter && status !== "ALL") qs.set(config.statusFilter.param, status);
    fetch(`${config.endpoint}${qs.toString() ? `?${qs}` : ""}`)
      .then((r) => r.json())
      .then((data) => {
        if (config.responseIsArray) {
          setRows(Array.isArray(data) ? data : []);
          setSummary(undefined);
        } else {
          setRows(Array.isArray(data?.rows) ? data.rows : []);
          setSummary(data?.summary);
        }
        setLoading(false);
      });
  }, [config, from, to, status]);

  useEffect(() => { load(); }, [load]);

  if (!config) {
    return (
      <div className="p-8">
        <p className="text-slate-500">Unknown report.</p>
        <button onClick={() => router.push("/admin/reports")} className="btn-ghost gap-2 mt-4">
          <ArrowLeft className="w-4 h-4" /> Back to Reports
        </button>
      </div>
    );
  }

  const summaryCards: SummaryCard[] | undefined = config.summaryCards?.({ summary }, rows);

  return (
    <div className="p-8">
      <button onClick={() => router.push("/admin/reports")} className="btn-ghost gap-2 mb-4 text-sm">
        <ArrowLeft className="w-4 h-4" /> Back to Reports
      </button>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900">{config.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{config.description}</p>
      </div>

      {(config.dateFilter || config.statusFilter) && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-6 flex flex-wrap items-end gap-4">
          {config.dateFilter && (
            <>
              <div className="form-group">
                <label className="input-label">From</label>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input-field" />
              </div>
              <div className="form-group">
                <label className="input-label">To</label>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input-field" />
              </div>
            </>
          )}
          {config.statusFilter && (
            <div className="form-group">
              <label className="input-label">{config.statusFilter.label}</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-field">
                {config.statusFilter.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <ReportTable
        columns={config.columns}
        rows={rows}
        loading={loading}
        summaryCards={summaryCards}
        exportFilename={`${config.slug}-${new Date().toISOString().slice(0, 10)}.csv`}
      />
    </div>
  );
}
