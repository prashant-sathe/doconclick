"use client";
import { useState } from "react";
import { AlertTriangle, Loader2, Shuffle, Undo2, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

// The impact step before an admin suspends or deletes a doctor/nurse, or
// deletes a patient (src/lib/accountImpact.ts). The admin API answers the
// first request with 409 ACCOUNT_HAS_IMPACT + this summary; the admin picks
// what happens to the bookings and the same request is re-sent with
// { bookingAction, confirmBookingIds }.

export interface AccountImpact {
  count: number;
  refundTotal: number;
  walletBalance: number | null;
  canReassign: boolean;
  bookings: {
    id: string;
    patientName: string;
    providerName: string;
    scheduledAt: string;
    status: string;
    paid: boolean;
    refund: number;
    consultType: string;
  }[];
}

type ImpactBody = { bookingAction?: "CANCEL" | "REASSIGN"; confirmBookingIds?: string[] };
type Send = (extra: ImpactBody) => Promise<Response>;

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// "3 bookings cancelled, 2 reassigned · ₹900 refunded to wallets"
export function impactResultText(bookings?: { cancelled?: number; reassigned?: number; refundTotal?: number } | null) {
  if (!bookings) return "";
  const parts = [];
  if (bookings.reassigned) parts.push(`${bookings.reassigned} booking${bookings.reassigned === 1 ? "" : "s"} reassigned`);
  if (bookings.cancelled) parts.push(`${bookings.cancelled} booking${bookings.cancelled === 1 ? "" : "s"} cancelled`);
  if (parts.length === 0) return "";
  return parts.join(", ") + (bookings.refundTotal ? ` · ₹${bookings.refundTotal} refunded to wallets` : "") + " · patients notified.";
}

// Runs an admin action and, if the API asks for the impact step, holds what
// it needs to show the dialog and re-send. `run` resolves with the final
// response body once the action actually happened, or null if it's waiting
// on the dialog / failed (`error` is set then).
export function useAccountImpact() {
  const [pending, setPending] = useState<{
    impact: AccountImpact;
    title: string;
    actionLabel: string;
    send: Send;
    resolve: (body: Record<string, unknown> | null) => void;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // A network failure must surface as an error, not leave a promise (and
  // the caller's busy state) hanging forever.
  const NETWORK_ERROR = "Network error — check your connection and try again.";

  const run = (send: Send, { title, actionLabel }: { title: string; actionLabel: string }) =>
    new Promise<Record<string, unknown> | null>((resolve) => {
      setError("");
      void (async () => {
        let res: Response;
        try {
          res = await send({});
        } catch {
          setError(NETWORK_ERROR);
          resolve(null);
          return;
        }
        const body = await res.json().catch(() => ({}));
        if (res.status === 409 && body.code === "ACCOUNT_HAS_IMPACT") {
          setPending({ impact: body.impact, title, actionLabel, send, resolve });
          return;
        }
        if (!res.ok) {
          setError(body.error ?? "Something went wrong.");
          resolve(null);
          return;
        }
        resolve(body);
      })();
    });

  const confirm = async (action: "CANCEL" | "REASSIGN") => {
    if (!pending) return;
    setBusy(true);
    setError("");
    let res: Response;
    try {
      res = await pending.send({ bookingAction: action, confirmBookingIds: pending.impact.bookings.map((b) => b.id) });
    } catch {
      setBusy(false);
      setError(NETWORK_ERROR);
      return;
    }
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.status === 409 && body.code === "ACCOUNT_HAS_IMPACT") {
      // The bookings changed since the admin looked — show the fresh list.
      setPending({ ...pending, impact: body.impact });
      setError("The bookings changed since you opened this. Review the updated list.");
      return;
    }
    if (!res.ok) {
      setError(body.error ?? "Something went wrong.");
      return;
    }
    pending.resolve(body);
    setPending(null);
  };

  const cancel = () => {
    pending?.resolve(null);
    setPending(null);
    setError("");
  };

  const dialog = pending ? (
    <AccountImpactDialog
      impact={pending.impact}
      title={pending.title}
      actionLabel={pending.actionLabel}
      busy={busy}
      error={error}
      onConfirm={confirm}
      onCancel={cancel}
    />
  ) : null;

  return { run, dialog, error, clearError: () => setError("") };
}

export default function AccountImpactDialog({
  impact, title, actionLabel, busy, error, onConfirm, onCancel,
}: {
  impact: AccountImpact;
  title: string;
  actionLabel: string;
  busy: boolean;
  error: string;
  onConfirm: (action: "CANCEL" | "REASSIGN") => void;
  onCancel: () => void;
}) {
  const [action, setAction] = useState<"CANCEL" | "REASSIGN">(impact.canReassign ? "REASSIGN" : "CANCEL");
  const isPatient = impact.walletBalance !== null;
  // A patient's refunds land in their own wallet, on top of what's there.
  const walletAfter = isPatient ? (impact.walletBalance ?? 0) + impact.refundTotal : 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <h3 className="font-bold text-slate-800">{title}</h3>
        </div>

        <div className="text-sm text-slate-600 space-y-3">
          {impact.count > 0 ? (
            <>
              <p>
                <span className="font-semibold text-slate-800">
                  {impact.count} open booking{impact.count === 1 ? "" : "s"}
                </span>
                {impact.refundTotal > 0 && <> · ₹{impact.refundTotal} already paid</>}
              </p>
              <ul className="max-h-48 overflow-y-auto space-y-1.5">
                {impact.bookings.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                    <span className="font-semibold text-slate-700 truncate">{isPatient ? b.providerName : b.patientName}</span>
                    <span className="text-slate-500 flex-shrink-0">
                      {fmtWhen(b.scheduledAt)} · {b.consultType.toLowerCase()}
                      {b.status === "PENDING_APPROVAL" ? " · request" : ""}
                      {b.paid ? ` · ₹${b.refund}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>No open bookings.</p>
          )}

          {impact.count > 0 && impact.canReassign && (
            <div className="space-y-2">
              {([
                ["REASSIGN", Shuffle, "Reassign where possible", "Send each booking to the nearest free doctor with the same specialty; cancel and refund the rest. Paid amounts go to the patient's wallet, to pay the new doctor."],
                ["CANCEL", Undo2, "Cancel and refund all", "Cancel every booking and refund what was paid to the patients' wallets."],
              ] as const).map(([value, Icon, label, hint]) => (
                <label key={value} className={cn(
                  "flex items-start gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer",
                  action === value ? "border-blue-300 bg-blue-50" : "border-slate-200"
                )}>
                  <input type="radio" name="bookingAction" className="mt-1" checked={action === value} onChange={() => setAction(value)} />
                  <span>
                    <span className="flex items-center gap-1.5 font-semibold text-slate-800"><Icon className="w-3.5 h-3.5" /> {label}</span>
                    <span className="block text-xs text-slate-500 mt-0.5">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          {impact.count > 0 && !impact.canReassign && (
            <p className="text-xs">
              {isPatient
                ? "They'll be cancelled, paid amounts refunded to the patient's wallet, and each doctor or nurse notified."
                : "They'll be cancelled, paid amounts refunded to the patients' wallets, and each patient notified."}
            </p>
          )}

          {isPatient && walletAfter > 0 && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              <Wallet className="w-4 h-4 flex-shrink-0" />
              <span>
                Their wallet will hold ₹{walletAfter}
                {impact.refundTotal > 0 && impact.walletBalance ? ` (₹${impact.walletBalance} now + ₹${impact.refundTotal} refunds)` : ""}.
                It can&apos;t be used once the account is deleted — pay it out manually to their original payment method.
              </span>
            </p>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onCancel} disabled={busy} className="btn-secondary flex-1 disabled:opacity-60">Back</button>
          <button
            onClick={() => onConfirm(action)}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
