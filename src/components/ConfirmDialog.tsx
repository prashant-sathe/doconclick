"use client";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Shared confirmation modal for admin actions that are risky to fire by
// accident (status changes, impersonation, settlements, sends) — matches the
// look of the delete-confirmation modals already used across admin pages.
export type ConfirmTone = "danger" | "warning" | "primary" | "success";

const TONE_BUTTON: Record<ConfirmTone, string> = {
  danger: "bg-red-600 hover:bg-red-700",
  warning: "bg-amber-500 hover:bg-amber-600",
  primary: "bg-blue-600 hover:bg-blue-700",
  success: "bg-emerald-600 hover:bg-emerald-700",
};

const TONE_ICON: Record<ConfirmTone, string> = {
  danger: "text-red-600",
  warning: "text-amber-600",
  primary: "text-blue-600",
  success: "text-emerald-600",
};

export default function ConfirmDialog({
  icon: Icon,
  title,
  message,
  confirmLabel,
  busyLabel,
  cancelLabel = "Cancel",
  tone = "primary",
  busy = false,
  onConfirm,
  onCancel,
}: {
  icon: React.ElementType;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
        <div className="flex items-center gap-2 mb-3">
          <Icon className={cn("w-5 h-5", TONE_ICON[tone])} />
          <h3 className="font-bold text-slate-800">{title}</h3>
        </div>
        <div className="text-sm text-slate-500 mb-5">{message}</div>
        <div className="flex gap-3">
          <button onClick={onCancel} disabled={busy} className="btn-secondary flex-1 disabled:opacity-60 disabled:cursor-not-allowed">
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              "flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed",
              TONE_BUTTON[tone]
            )}
          >
            {busy ? (busyLabel ?? "Working…") : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
