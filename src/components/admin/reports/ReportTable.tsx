"use client";
import { useMemo } from "react";
import { Download, FileQuestion } from "lucide-react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams, ValueFormatterParams } from "ag-grid-community";
import { cn } from "@/lib/utils";
import { brandGridTheme } from "@/lib/agGridTheme";
import { downloadCSV, toCSV, type CsvColumn } from "@/lib/csv";

export interface ReportColumn<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  csvValue?: (row: T) => string | number | null | undefined;
  align?: "left" | "right";
}

export interface SummaryCard {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger" | "purple";
}

const TONE_CLASS: Record<NonNullable<SummaryCard["tone"]>, string> = {
  default: "text-slate-900",
  success: "text-emerald-600",
  warning: "text-amber-600",
  danger: "text-red-600",
  purple: "text-purple-600",
};

export default function ReportTable<T extends Record<string, unknown>>({
  columns,
  rows,
  loading,
  summaryCards,
  exportFilename,
  emptyLabel = "No data for the selected filters.",
}: {
  columns: ReportColumn<T>[];
  rows: T[];
  loading: boolean;
  summaryCards?: SummaryCard[];
  exportFilename: string;
  emptyLabel?: string;
}) {
  const handleExport = () => {
    const csvColumns: CsvColumn<T>[] = columns.map((c) => ({
      key: c.key,
      label: c.label,
      value: c.csvValue,
    }));
    downloadCSV(exportFilename, toCSV(rows, csvColumns));
  };

  const columnDefs = useMemo<ColDef<T>[]>(() => columns.map((c) => ({
    colId: c.key,
    headerName: c.label,
    flex: 1,
    minWidth: 130,
    cellClass: c.align === "right" ? "text-right" : undefined,
    valueGetter: (p) => (p.data ? p.data[c.key] : undefined),
    ...(c.render
      ? { cellRenderer: (p: ICellRendererParams<T>) => (p.data ? c.render!(p.data) : null) }
      : { valueFormatter: (p: ValueFormatterParams<T>) => (p.value === null || p.value === undefined || p.value === "" ? "—" : String(p.value)) }),
  })), [columns]);

  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, resizable: true, filter: true }), []);

  return (
    <div>
      {summaryCards && summaryCards.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {summaryCards.map((c) => (
            <div key={c.label} className="stat-card">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{c.label}</p>
              <p className={cn("text-2xl font-extrabold", TONE_CLASS[c.tone ?? "default"])}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <p className="text-xs text-slate-400">{loading ? "Loading…" : `${rows.length} row${rows.length === 1 ? "" : "s"}`}</p>
          <button onClick={handleExport} disabled={loading || rows.length === 0} className="btn-ghost gap-2 text-xs disabled:opacity-40">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>

        {loading ? (
          <div className="p-8 space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <FileQuestion className="w-8 h-8 mx-auto mb-2 opacity-30" />
            {emptyLabel}
          </div>
        ) : (
          <AgGridReact<T>
            theme={brandGridTheme}
            rowData={rows}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            domLayout="autoHeight"
            pagination
            paginationPageSize={10}
            paginationPageSizeSelector={[10, 20, 50, 100]}
            animateRows
          />
        )}
      </div>
    </div>
  );
}
