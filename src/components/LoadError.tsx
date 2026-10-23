"use client";
import { AlertTriangle, Loader2, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";

// A page/section whose data failed to load, with Retry. Two shapes:
// - stale data on screen (`hasData`): a slim banner above it — the last good
//   copy stays visible;
// - nothing loaded yet: a full empty-state card in place of the content.
export default function LoadError({
  error,
  onRetry,
  retrying = false,
  hasData = false,
}: {
  error: string;
  onRetry: () => void;
  retrying?: boolean;
  hasData?: boolean;
}) {
  const t = useTranslations("shared.loadError");
  const retry = (
    <button
      type="button"
      onClick={onRetry}
      disabled={retrying}
      className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
    >
      {retrying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
      {t("retry")}
    </button>
  );

  if (hasData) {
    return (
      <div role="alert" className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1">{error} {t("showingLast")}</span>
        {retry}
      </div>
    );
  }
  return (
    <div role="alert" className="rounded-2xl border border-red-100 bg-white p-8 text-center text-red-700">
      <AlertTriangle className="w-7 h-7 mx-auto mb-2 text-red-400" />
      <p className="text-sm font-semibold">{error}</p>
      <div className="mt-4 flex justify-center">{retry}</div>
    </div>
  );
}
