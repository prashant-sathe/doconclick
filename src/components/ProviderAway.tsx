"use client";
import { useCallback, useEffect, useState } from "react";
import { CalendarOff, Loader2, Power, Trash2, AlertTriangle, Plus } from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { addDaysYmd } from "@/lib/istDate";
import { cn } from "@/lib/utils";

// A doctor's or nurse's own controls for being away as a whole
// (src/lib/timeOff.ts): "Go offline for today" and time off over a date
// range. Both list the live bookings they'd cancel first; confirming
// cancels them, refunds the patients and tells them.

type Booking = { id: string; patientName: string; scheduledAt: string; paid: boolean; refund: number; consultType: string; serviceName: string | null };
type Pending = { bookings: Booking[]; kept: number; send: (ids: string[]) => Promise<void>; title: string };
type TimeOff = { id: string; startDate: string; endDate: string; reason: string | null };

const todayIst = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const day = (ymd: string) =>
  new Date(`${ymd}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" });
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const TYPE: Record<string, string> = { CLINIC: "Clinic", HOME: "Home visit", VIDEO: "Video" };

/** POSTs, and when the server lists bookings to cancel, asks before sending them back. */
function useAwayRequest() {
  const toast = useToast();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (url: string, body: Record<string, unknown>, title: string, onDone: (data: Record<string, unknown>) => void) => {
    const send = async (confirmBookingIds?: string[]) => {
      setBusy(true);
      try {
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, confirmBookingIds }) });
        const data = await res.json().catch(() => ({}));
        if (res.status === 409 && data.code === "AWAY_HAS_BOOKINGS") {
          setPending({ bookings: data.bookings, kept: data.kept ?? 0, title, send: (ids) => send(ids) });
          return;
        }
        if (!res.ok) { toast.error(data.error ?? "Something went wrong. Please try again."); setPending(null); return; }
        setPending(null);
        const n = Number(data.cancelledBookings ?? 0);
        if (n > 0) toast.success(`${n} booking${n === 1 ? "" : "s"} cancelled${Number(data.refundTotal) > 0 ? ` — ₹${data.refundTotal} refunded to patients` : ""}. Patients were notified.`);
        onDone(data);
      } catch {
        toast.error("Network error — check your connection and try again.");
      } finally {
        setBusy(false);
      }
    };
    await send();
  }, [toast]);

  const dialog = pending && (
    <ConfirmDialog
      icon={AlertTriangle}
      tone="danger"
      title={pending.title}
      confirmLabel={`Cancel ${pending.bookings.length} & refund`}
      busyLabel="Cancelling…"
      busy={busy}
      onCancel={() => setPending(null)}
      onConfirm={() => pending.send(pending.bookings.map((b) => b.id))}
      message={
        <div>
          <p className="mb-2">These bookings will be cancelled. Paid ones are refunded to the patient&apos;s wallet, and everyone is notified:</p>
          <ul className="max-h-56 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl">
            {pending.bookings.map((b) => (
              <li key={b.id} className="px-3 py-2">
                <p className="font-semibold text-slate-800">{b.patientName}</p>
                <p className="text-xs text-slate-500">
                  {when(b.scheduledAt)} · {b.serviceName ?? TYPE[b.consultType] ?? b.consultType}
                  {b.paid ? ` · refund ₹${b.refund}` : " · unpaid"}
                </p>
              </li>
            ))}
          </ul>
          {pending.kept > 0 && (
            <p className="text-xs text-slate-500 mt-2">{pending.kept} visit{pending.kept === 1 ? " that's" : "s that are"} already under way stay{pending.kept === 1 ? "s" : ""} — finish {pending.kept === 1 ? "it" : "them"} as usual.</p>
          )}
        </div>
      }
    />
  );
  return { run, busy, dialog };
}

function useAwayState() {
  const [state, setState] = useState<{ timeOff: TimeOff[]; offlineUntil: string | null } | null>(null);
  const load = useCallback(async () => {
    const res = await fetch("/api/provider/time-off", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setState(await res.json());
  }, []);
  useEffect(() => {
    // Loading on mount: it only sets state after its first await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  return { state, setState, load };
}

/** Dashboard card: online / offline-for-today, plus today's leave if any. */
export function OfflineToggle({ timeOffHref, onChanged }: { timeOffHref: string; onChanged?: () => void }) {
  const { state, load } = useAwayState();
  const { run, busy, dialog } = useAwayRequest();
  if (!state) return null;
  const today = todayIst();
  const leaveToday = state.timeOff.find((t) => t.startDate <= today && t.endDate >= today);
  const offline = !!state.offlineUntil;

  const toggle = () =>
    run("/api/provider/offline", { offline: !offline }, "Go offline for today?", () => { void load(); onChanged?.(); });

  return (
    <div className={cn(
      "rounded-2xl border p-4 mb-6 flex flex-col sm:flex-row sm:items-center gap-3",
      leaveToday || offline ? "bg-amber-50 border-amber-200" : "bg-white border-slate-100 shadow-sm"
    )}>
      <div className="flex items-start gap-3 min-w-0 flex-1">
      <span className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5", leaveToday || offline ? "bg-amber-500" : "bg-emerald-500")} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-800">
          {leaveToday ? `On time off until ${day(leaveToday.endDate)}` : offline ? "Offline for the rest of today" : "Online — taking bookings"}
        </p>
        <p className="text-xs text-slate-500">
          {leaveToday
            ? "No new bookings until then. Remove the time off if you're back early."
            : offline
              ? "No new bookings today. You're back online automatically tomorrow."
              : "Not available today? Go offline — today's bookings are cancelled and refunded."}
        </p>
      </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 pl-5 sm:pl-0">
        {!leaveToday && (
          <button onClick={toggle} disabled={busy} className={cn("py-2 px-3 text-xs", offline ? "btn-primary" : "btn-secondary text-amber-700 border-amber-200")}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />} {offline ? "Go online" : "Go offline"}
          </button>
        )}
        <a href={timeOffHref} className="btn-secondary py-2 px-3 text-xs"><CalendarOff className="w-3.5 h-3.5" /> Time off</a>
      </div>
      {dialog}
    </div>
  );
}

/** Profile section: plan time off over a date range; see and remove upcoming ones. */
export function TimeOffManager() {
  const toast = useToast();
  const { state, load } = useAwayState();
  const { run, busy, dialog } = useAwayRequest();
  const today = todayIst();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState("");

  const add = () => {
    setError("");
    if (!startDate) { setError("Pick a start date."); return; }
    if (endDate && endDate < startDate) { setError("The end date is before the start date."); return; }
    const label = startDate === (endDate || startDate) ? day(startDate) : `${day(startDate)} – ${day(endDate)}`;
    void run("/api/provider/time-off", { startDate, endDate: endDate || startDate, reason }, `Time off ${label}?`, () => {
      toast.success(`Time off added: ${label}.`);
      setReason("");
      void load();
    });
  };

  const remove = async (id: string) => {
    setRemoving(id);
    const res = await fetch(`/api/provider/time-off/${id}`, { method: "DELETE" }).catch(() => null);
    setRemoving(null);
    if (!res?.ok) { toast.error((await res?.json().catch(() => ({})))?.error ?? "Couldn't remove it."); return; }
    toast.success("Time off removed — those days are open for booking again.");
    void load();
  };

  return (
    <div>
      <p className="text-xs text-slate-500 mb-4">
        For every clinic, video and home visit at once. Patients can&apos;t book these days; bookings already on them are cancelled and refunded once you confirm.
      </p>

      {state && state.timeOff.length > 0 && (
        <ul className="space-y-2 mb-5">
          {state.timeOff.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">{t.startDate === t.endDate ? day(t.startDate) : `${day(t.startDate)} – ${day(t.endDate)}`}</p>
                {t.reason && <p className="text-xs text-slate-500 truncate">{t.reason}</p>}
              </div>
              <button onClick={() => remove(t.id)} disabled={removing === t.id} className="w-9 h-9 rounded-lg border border-slate-100 bg-white flex items-center justify-center text-red-500 hover:bg-red-50 flex-shrink-0" aria-label="Remove time off">
                {removing === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="input-label" htmlFor="to-start">From</label>
          <input id="to-start" type="date" className="input-field w-full" min={today} max={addDaysYmd(today, 365)} value={startDate}
            onChange={(e) => { setStartDate(e.target.value); if (!endDate || endDate < e.target.value) setEndDate(e.target.value); }} />
        </div>
        <div>
          <label className="input-label" htmlFor="to-end">To (incl.)</label>
          <input id="to-end" type="date" className="input-field w-full" min={startDate || today} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>
      <input className="input-field w-full mt-2.5" maxLength={200} placeholder="Reason (optional, only you see it)" value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      <button onClick={add} disabled={busy} className="btn-primary mt-3 py-2.5 px-4 text-sm">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add time off
      </button>
      {dialog}
    </div>
  );
}
