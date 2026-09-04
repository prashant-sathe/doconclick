"use client";
import Link from "next/link";
import { ChevronLeft, Loader2, Check, Save } from "lucide-react";
import PatientHeader from "@/components/patient/PatientHeader";
import PatientMobileNav from "@/components/patient/PatientMobileNav";

// Shared chrome for a single profile-settings screen: a "‹ Profile" back link,
// a title, the section's card, and a Save button.
export default function ProfileSubShell({
  title,
  description,
  loading,
  saving,
  saved,
  dirty,
  error,
  onSave,
  children,
}: {
  title: string;
  description?: string;
  loading?: boolean;
  saving?: boolean;
  saved?: boolean;
  dirty?: boolean;
  error?: string;
  onSave?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
      <PatientHeader />
      <PatientMobileNav />

      <div className="max-w-xl mx-auto py-6 px-4 sm:px-6">
        <Link href="/patient/profile" className="btn-ghost gap-1 text-sm -ml-2 mb-2">
          <ChevronLeft className="w-4 h-4" /> Profile
        </Link>
        <h1 className="text-2xl font-extrabold text-slate-900">{title}</h1>
        {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-7 h-7 animate-spin text-blue-400" />
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 sm:p-6 mt-5 space-y-4">
            {children}
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 mt-4">{error}</p>
        )}

        {!loading && onSave && (
          <button
            type="button"
            onClick={onSave}
            disabled={saving || dirty === false}
            className="btn-primary w-full justify-center py-3.5 text-base mt-5 disabled:opacity-60"
          >
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              : saved && dirty === false
                ? <><Check className="w-4 h-4" /> Saved</>
                : <><Save className="w-4 h-4" /> Save</>}
          </button>
        )}
      </div>
    </div>
  );
}
