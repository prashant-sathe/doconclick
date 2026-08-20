"use client";
import Link from "next/link";
import { ChevronRight, FileBarChart } from "lucide-react";
import { REPORT_CONFIGS } from "./report-configs";

const CATEGORIES = ["Doctor Financials", "Platform Revenue & Bookings", "Payouts & Settlements"] as const;

export default function ReportsHub() {
  return (
    <div className="p-8">
      <div className="mb-8 flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
          <FileBarChart className="w-5.5 h-5.5" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Reports</h1>
          <p className="text-slate-500 text-sm mt-1">Financial and operational reports across doctors, bookings and payouts.</p>
        </div>
      </div>

      {CATEGORIES.map((category) => {
        const reports = REPORT_CONFIGS.filter((r) => r.category === category);
        if (reports.length === 0) return null;
        return (
          <div key={category} className="mb-8">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{category}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reports.map((r) => (
                <Link
                  key={r.slug}
                  href={`/admin/reports/${r.slug}`}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:border-blue-200 hover:shadow-md transition-all group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-slate-800 text-sm leading-snug">{r.title}</h3>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors flex-shrink-0 mt-0.5" />
                  </div>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">{r.description}</p>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
