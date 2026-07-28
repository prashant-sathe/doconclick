"use client";
import { Settings, Info } from "lucide-react";

export default function AdminSettings() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-slate-900">Platform Settings</h1>
        <p className="text-slate-500 text-sm mt-1">General configuration for DocOnClick.</p>
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 max-w-lg">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center">
            <Settings className="w-5 h-5" />
          </div>
          <h2 className="font-bold text-slate-800">General Info</h2>
        </div>
        <div className="flex items-start gap-3 text-sm text-slate-600 bg-blue-50 border border-blue-100 rounded-xl p-4">
          <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p>Commission settings are managed in the <a href="/admin/finance" className="text-blue-600 font-semibold underline">Finance section</a>.</p>
            <p className="mt-1">Notification templates, branding and advanced settings will be available in future releases.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
