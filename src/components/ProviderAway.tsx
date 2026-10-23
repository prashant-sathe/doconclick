"use client";
import { useCallback, useEffect, useState } from "react";
import { CalendarOff, Loader2, Power, Trash2, AlertTriangle, Plus } from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { addDaysYmd } from "@/lib/istDate";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";
import { formattingLocale } from "@/lib/appLanguage";

// A doctor's or nurse's own controls for being away as a whole
// (src/lib/timeOff.ts): "Go offline for today" and time off over a date
// range. Both list the live bookings they'd cancel first; confirming
// cancels them, refunds the patients and tells them.

type Booking = { id: string; patientName: string; scheduledAt: string; paid: boolean; refund: number; consultType: string; serviceName: string | null };
type Pending = { bookings: Booking[]; kept: number; send: (ids: string[]) => Promise<void>; title: string };
type TimeOff = { id: string; startDate: string; endDate: string; reason: string | null };

const todayIst = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const day = (ymd: string, locale: string) =>
  new Date(`${ymd}T00:00:00+05:30`).toLocaleDateString(locale, { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" });
const when = (iso: string, locale: string) =>
  new Date(iso).toLocaleString(locale, { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** POSTs, and when the server lists bookings to cancel, asks before sending them back. */
function useAwayRequest() {
  const toast = useToast();
  const t = useTranslations("doctor.away");
  const tc = useTranslations("doctor.common");
  const locale = formattingLocale(useLocale());
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
        if (!res.ok) { toast.error(data.error ?? t("somethingWrong")); setPending(null); return; }
        setPending(null);
        const n = Number(data.cancelledBookings ?? 0);
        if (n > 0) toast.success(Number(data.refundTotal) > 0 ? t("cancelledRefundToast", { count: n, refund: String(data.refundTotal) }) : t("cancelledToast", { count: n }));
        onDone(data);
      } catch {
        toast.error(tc("networkError"));
      } finally {
        setBusy(false);
      }
    };
    await send();
  }, [toast, t, tc]);

  const dialog = pending && (
    <ConfirmDialog
      icon={AlertTriangle}
      tone="danger"
      title={pending.title}
      confirmLabel={t("confirmCancel", { count: pending.bookings.length })}
      busyLabel={t("cancelling")}
      busy={busy}
      onCancel={() => setPending(null)}
      onConfirm={() => pending.send(pending.bookings.map((b) => b.id))}
      message={
        <div>
          <p className="mb-2">{t("listIntro")}</p>
          <ul className="max-h-56 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl">
            {pending.bookings.map((b) => (
              <li key={b.id} className="px-3 py-2">
                <p className="font-semibold text-slate-800">{b.patientName}</p>
                <p className="text-xs text-slate-500">
                  {when(b.scheduledAt, locale)} · {b.serviceName ?? t("type", { type: b.consultType })}
                  {" · "}{b.paid ? t("refund", { amount: b.refund }) : t("unpaid")}
                </p>
              </li>
            ))}
          </ul>
          {pending.kept > 0 && (
            <p className="text-xs text-slate-500 mt-2">{t("kept", { count: pending.kept })}</p>
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
  const t = useTranslations("doctor.away");
  const locale = formattingLocale(useLocale());
  const { state, load } = useAwayState();
  const { run, busy, dialog } = useAwayRequest();
  if (!state) return null;
  const today = todayIst();
  const leaveToday = state.timeOff.find((o) => o.startDate <= today && o.endDate >= today);
  const offline = !!state.offlineUntil;

  const toggle = () =>
    run("/api/provider/offline", { offline: !offline }, t("goOfflineTitle"), () => { void load(); onChanged?.(); });

  return (
    <div className={cn(
      "rounded-2xl border p-4 mb-6 flex flex-col sm:flex-row sm:items-center gap-3",
      leaveToday || offline ? "bg-amber-50 border-amber-200" : "bg-white border-slate-100 shadow-sm"
    )}>
      <div className="flex items-start gap-3 min-w-0 flex-1">
      <span className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5", leaveToday || offline ? "bg-amber-500" : "bg-emerald-500")} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-800">
          {leaveToday ? t("onTimeOff", { date: day(leaveToday.endDate, locale) }) : offline ? t("offlineToday") : t("online")}
        </p>
        <p className="text-xs text-slate-500">
          {leaveToday
            ? t("onTimeOffHint")
            : offline
              ? t("offlineHint")
              : t("onlineHint")}
        </p>
      </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 pl-5 sm:pl-0">
        {!leaveToday && (
          <button onClick={toggle} disabled={busy} className={cn("py-2 px-3 text-xs", offline ? "btn-primary" : "btn-secondary text-amber-700 border-amber-200")}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />} {offline ? t("goOnline") : t("goOffline")}
          </button>
        )}
        <a href={timeOffHref} className="btn-secondary py-2 px-3 text-xs"><CalendarOff className="w-3.5 h-3.5" /> {t("timeOff")}</a>
      </div>
      {dialog}
    </div>
  );
}

/** Profile section: plan time off over a date range; see and remove upcoming ones. */
export function TimeOffManager() {
  const toast = useToast();
  const t = useTranslations("doctor.away");
  const locale = formattingLocale(useLocale());
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
    if (!startDate) { setError(t("pickStart")); return; }
    if (endDate && endDate < startDate) { setError(t("endBeforeStart")); return; }
    const label = startDate === (endDate || startDate) ? day(startDate, locale) : `${day(startDate, locale)} – ${day(endDate, locale)}`;
    void run("/api/provider/time-off", { startDate, endDate: endDate || startDate, reason }, t("timeOffTitle", { range: label }), () => {
      toast.success(t("added", { range: label }));
      setReason("");
      void load();
    });
  };

  const remove = async (id: string) => {
    setRemoving(id);
    const res = await fetch(`/api/provider/time-off/${id}`, { method: "DELETE" }).catch(() => null);
    setRemoving(null);
    if (!res?.ok) { toast.error((await res?.json().catch(() => ({})))?.error ?? t("removeFailed")); return; }
    toast.success(t("removed"));
    void load();
  };

  return (
    <div>
      <p className="text-xs text-slate-500 mb-4">
        {t("intro")}
      </p>

      {state && state.timeOff.length > 0 && (
        <ul className="space-y-2 mb-5">
          {state.timeOff.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">{o.startDate === o.endDate ? day(o.startDate, locale) : `${day(o.startDate, locale)} – ${day(o.endDate, locale)}`}</p>
                {o.reason && <p className="text-xs text-slate-500 truncate">{o.reason}</p>}
              </div>
              <button onClick={() => remove(o.id)} disabled={removing === o.id} className="w-9 h-9 rounded-lg border border-slate-100 bg-white flex items-center justify-center text-red-500 hover:bg-red-50 flex-shrink-0" aria-label={t("removeTimeOff")}>
                {removing === o.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="input-label" htmlFor="to-start">{t("from")}</label>
          <input id="to-start" type="date" className="input-field w-full" min={today} max={addDaysYmd(today, 365)} value={startDate}
            onChange={(e) => { setStartDate(e.target.value); if (!endDate || endDate < e.target.value) setEndDate(e.target.value); }} />
        </div>
        <div>
          <label className="input-label" htmlFor="to-end">{t("to")}</label>
          <input id="to-end" type="date" className="input-field w-full" min={startDate || today} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>
      <input className="input-field w-full mt-2.5" maxLength={200} placeholder={t("reason")} value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      <button onClick={add} disabled={busy} className="btn-primary mt-3 py-2.5 px-4 text-sm">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} {t("add")}
      </button>
      {dialog}
    </div>
  );
}
