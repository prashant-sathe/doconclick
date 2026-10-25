"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pill, Check, Clock, CalendarPlus, Loader2, Plus, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import ProfileSubShell from "@/components/patient/ProfileSubShell";
import { cn } from "@/lib/utils";
import { RELATIONS } from "@/lib/relations";
import { formattingLocale } from "@/lib/appLanguage";
import { DOSE_SLOTS, MAX_COURSE_DAYS, MAX_DOSES_PER_DAY, isAllowedDoseTime, type DoseSlot } from "@/lib/medicineSchedule";
import { useLocale, useTranslations } from "next-intl";

type Person = { name: string; relation: string } | null;
type Reminder = {
  id: string; name: string; dosage: string; frequency: string; duration: string; instructions: string | null;
  timesOfDay: string[]; startDate: string; endDate: string | null; enabled: boolean; needsSetup: boolean;
  startsLater: boolean; takenToday: string[]; person: Person; doctorName: string;
};
type Refill = { appointmentId: string; doctorName: string; person: Person; endDate: string; ended: boolean; href: string };
type View = { enabled: boolean; today: string; reminders: Reminder[]; refills: Refill[] };

const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

// Medicine reminders (FP1-22): today's doses with a "Taken" tick, every
// current medicine with its own switch and a time/day picker (for ones whose
// prescription couldn't be read), a master switch, and "see the doctor
// again" cards when a course is ending.
export default function MedicineRemindersPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const t = useTranslations("patientAccount.medicines");
  const tc = useTranslations("booking.common");
  const locale = formattingLocale(useLocale());
  const [view, setView] = useState<View | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?next=/patient/profile/medicines");
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    const res = await fetch("/api/patients/me/medicine-reminders").catch(() => null);
    if (!res?.ok) { setLoadFailed(true); return; }
    setLoadFailed(false);
    setView(await res.json());
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [user?.id, load]);

  const send = async (key: string, url: string, method: string, body: unknown) => {
    setBusy(key);
    setError("");
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(null);
    if (!res?.ok) { setError(data.error || t("saveFailed")); return false; }
    await load();
    return true;
  };

  const relationLabel = (r: string) => ((RELATIONS as readonly string[]).includes(r) ? tc(`relation.${r as (typeof RELATIONS)[number]}`) : r);
  const personLabel = (p: Person) => (p ? t("forPerson", { name: p.name, relation: relationLabel(p.relation) }) : null);
  const timeLabel = (hhmm: string) =>
    new Date(`2026-01-01T${hhmm}:00+05:30`).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  const dateLabel = (ymd: string) =>
    new Date(`${ymd}T12:00:00+05:30`).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

  // Today's doses of the medicines that remind today, by time.
  const todayDoses = view
    ? view.reminders
        .filter((r) => r.enabled && !r.needsSetup && !r.startsLater)
        .flatMap((r) => r.timesOfDay.map((time) => ({ r, time, taken: r.takenToday.includes(time) })))
        .sort((a, b) => a.time.localeCompare(b.time))
    : [];

  return (
    <ProfileSubShell
      title={t("title")}
      description={t("description")}
      icon={<Pill className="w-5 h-5" />}
      tint="bg-teal-50 text-teal-600"
      loading={!view && !loadFailed}
      error={error || (loadFailed ? t("loadFailed") : "")}
      footer={view && (
        <>
          {view.refills.map((c) => (
            <section key={c.appointmentId} className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-bold text-amber-900">{t("refillTitle")}</p>
              <p className="text-xs text-amber-800 mt-1">
                {t("refillBody", { ended: c.ended ? "yes" : "no", doctor: c.doctorName, date: dateLabel(c.endDate) })}
                {c.person && <> · {personLabel(c.person)}</>}
              </p>
              <Link href={c.href} className="btn-primary mt-3 min-h-11 justify-center w-full sm:w-auto">
                <CalendarPlus className="w-4 h-4" /> {t("rebook")}
              </Link>
            </section>
          ))}

          <section className="mt-5">
            <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-1.5">{t("todayTitle")}</h2>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-50">
              {todayDoses.length === 0 && <p className="px-4 py-4 text-sm text-slate-500">{t("noDosesToday")}</p>}
              {todayDoses.map(({ r, time, taken }) => {
                const key = `${r.id}|${time}`;
                return (
                  <div key={key} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-16 flex-shrink-0 text-xs font-bold text-slate-500">{timeLabel(time)}</span>
                    <span className="flex-1 min-w-0">
                      <span className={cn("block text-sm font-semibold truncate", taken ? "text-slate-400 line-through" : "text-slate-800")}>
                        {r.name}{r.dosage ? ` · ${r.dosage}` : ""}
                      </span>
                      {r.person && <span className="block text-xs text-slate-400 truncate">{personLabel(r.person)}</span>}
                    </span>
                    <button
                      type="button"
                      aria-pressed={taken}
                      disabled={busy === key}
                      onClick={() => send(key, `/api/patients/me/medicine-reminders/${r.id}/doses`, "POST", { time, taken: !taken })}
                      className={cn(
                        "min-h-11 min-w-[5.5rem] px-3 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1.5 border flex-shrink-0",
                        taken ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50",
                      )}
                    >
                      {busy === key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {t("taken")}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="mt-5">
            <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-1.5">{t("medicinesTitle")}</h2>
            {view.reminders.length === 0 && (
              <p className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-4 text-sm text-slate-500">{t("empty")}</p>
            )}
            <div className="space-y-3">
              {view.reminders.map((r) => (
                <MedicineCard
                  key={r.id}
                  r={r}
                  today={view.today}
                  person={personLabel(r.person)}
                  timeLabel={timeLabel}
                  dateLabel={dateLabel}
                  busy={busy === r.id}
                  editing={editing === r.id}
                  onEdit={(on) => setEditing(on ? r.id : null)}
                  onToggle={(enabled) => send(r.id, `/api/patients/me/medicine-reminders/${r.id}`, "PATCH", { enabled })}
                  onSave={async (timesOfDay, days) => {
                    if (await send(r.id, `/api/patients/me/medicine-reminders/${r.id}`, "PATCH", { timesOfDay, days })) setEditing(null);
                  }}
                />
              ))}
            </div>
          </section>
        </>
      )}
    >
      {view && (
        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <span className="min-w-0">
            <span className="block text-sm font-bold text-slate-800">{t("masterTitle")}</span>
            <span className="block text-xs text-slate-500 mt-0.5">{view.enabled ? t("masterOn") : t("masterOff")}</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={view.enabled}
            disabled={busy === "master"}
            onChange={(e) => send("master", "/api/patients/me/medicine-reminders", "PATCH", { enabled: e.target.checked })}
            className="sr-only peer"
          />
          <span className="w-10 h-6 rounded-full bg-slate-200 peer-checked:bg-teal-500 relative flex-shrink-0 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-[18px]" />
        </label>
      )}
    </ProfileSubShell>
  );
}

function MedicineCard({ r, today, person, timeLabel, dateLabel, busy, editing, onEdit, onToggle, onSave }: {
  r: Reminder; today: string; person: string | null;
  timeLabel: (hhmm: string) => string; dateLabel: (ymd: string) => string;
  busy: boolean; editing: boolean;
  onEdit: (on: boolean) => void; onToggle: (enabled: boolean) => void; onSave: (times: string[], days: number) => void;
}) {
  const t = useTranslations("patientAccount.medicines");
  const daysLeft = r.endDate ? daysBetween(today, r.endDate) : null;
  return (
    <div className={cn("bg-white rounded-2xl border border-slate-100 shadow-sm p-4", !r.enabled && "opacity-70")}>
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center flex-shrink-0"><Pill className="w-4 h-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 break-words">{r.name}{r.dosage ? ` · ${r.dosage}` : ""}</p>
          {person && <p className="text-xs text-slate-500">{person}</p>}
          <p className="text-xs text-slate-500">{t("byDoctor", { doctor: r.doctorName })}</p>
          {(r.frequency || r.duration) && (
            <p className="text-xs text-slate-400">{t("prescribed", { text: [r.frequency, r.duration].filter(Boolean).join(" · ") })}</p>
          )}
          {r.instructions && <p className="text-xs text-slate-400 break-words">{r.instructions}</p>}
        </div>
        <label className="flex items-center cursor-pointer min-h-11 flex-shrink-0">
          <input type="checkbox" role="switch" aria-label={t("toggleAria", { name: r.name })} checked={r.enabled} disabled={busy}
            onChange={(e) => onToggle(e.target.checked)} className="sr-only peer" />
          <span className="w-10 h-6 rounded-full bg-slate-200 peer-checked:bg-teal-500 relative transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-[18px]" />
        </label>
      </div>

      {r.needsSetup ? (
        <p className="mt-3 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">{t("needsSetup")}</p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          {r.timesOfDay.map((time) => (
            <span key={time} className="text-xs font-semibold text-slate-700 bg-slate-100 rounded-full px-2.5 py-1">{timeLabel(time)}</span>
          ))}
          <span className="text-xs text-slate-400 ml-1">
            {r.startsLater ? t("startsOn", { date: dateLabel(r.startDate) }) : t("daysLeft", { count: Math.max(0, daysLeft ?? 0) })}
          </span>
        </div>
      )}

      {editing ? (
        <ScheduleEditor r={r} busy={busy} timeLabel={timeLabel} onCancel={() => onEdit(false)} onSave={onSave} />
      ) : (
        <button type="button" onClick={() => onEdit(true)} className="btn-ghost min-h-11 text-sm mt-2 -ml-2">
          {r.needsSetup ? t("setTimes") : t("changeTimes")}
        </button>
      )}
    </div>
  );
}

const SLOT_KEYS = Object.keys(DOSE_SLOTS) as DoseSlot[];

function ScheduleEditor({ r, busy, timeLabel, onCancel, onSave }: {
  r: Reminder; busy: boolean; timeLabel: (hhmm: string) => string;
  onCancel: () => void; onSave: (times: string[], days: number) => void;
}) {
  const t = useTranslations("patientAccount.medicines");
  const [times, setTimes] = useState<string[]>(r.timesOfDay);
  const [custom, setCustom] = useState("");
  const [days, setDays] = useState(r.endDate ? String(daysBetween(r.startDate, r.endDate) + 1) : "");
  const toggle = (time: string) => setTimes((prev) => (prev.includes(time) ? prev.filter((x) => x !== time) : [...prev, time].sort()));
  const addCustom = () => {
    if (!isAllowedDoseTime(custom) || times.includes(custom) || times.length >= MAX_DOSES_PER_DAY) return;
    setTimes((prev) => [...prev, custom].sort());
    setCustom("");
  };
  const dayCount = Number(days);
  const valid = times.length > 0 && times.length <= MAX_DOSES_PER_DAY && Number.isInteger(dayCount) && dayCount >= 1 && dayCount <= MAX_COURSE_DAYS;

  return (
    <div className="mt-3 border-t border-slate-100 pt-3 space-y-3">
      <div>
        <p className="text-xs font-bold text-slate-600 mb-1.5">{t("timesLabel")}</p>
        <div className="flex flex-wrap gap-2">
          {SLOT_KEYS.map((slot) => {
            const time = DOSE_SLOTS[slot];
            const on = times.includes(time);
            return (
              <button key={slot} type="button" aria-pressed={on} onClick={() => toggle(time)}
                className={cn("min-h-11 px-3 rounded-full text-xs font-semibold border", on ? "bg-teal-600 text-white border-teal-600" : "bg-white text-slate-600 border-slate-200")}>
                {t(`slot.${slot}`)} · {timeLabel(time)}
              </button>
            );
          })}
          {times.filter((time) => !Object.values(DOSE_SLOTS).includes(time as never)).map((time) => (
            <button key={time} type="button" onClick={() => toggle(time)} aria-label={t("removeTime", { time: timeLabel(time) })}
              className="min-h-11 px-3 rounded-full text-xs font-semibold border bg-teal-600 text-white border-teal-600 inline-flex items-center gap-1">
              {timeLabel(time)} <X className="w-3 h-3" />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <input type="time" min="06:00" max="21:59" value={custom} onChange={(e) => setCustom(e.target.value)}
            aria-label={t("otherTime")} className="input-field text-sm py-2 min-h-11 w-36" />
          <button type="button" onClick={addCustom} disabled={!isAllowedDoseTime(custom) || times.length >= MAX_DOSES_PER_DAY}
            className="btn-ghost min-h-11 text-sm disabled:opacity-50">
            <Plus className="w-4 h-4" /> {t("addTime")}
          </button>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">{t("quietHours")}</p>
      </div>
      <label className="block">
        <span className="text-xs font-bold text-slate-600">{t("daysLabel")}</span>
        <input type="number" inputMode="numeric" min={1} max={MAX_COURSE_DAYS} value={days} onChange={(e) => setDays(e.target.value)}
          className="input-field text-sm py-2 mt-1 w-28 block" />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={() => onSave(times, dayCount)} disabled={!valid || busy} className="btn-primary min-h-11 justify-center flex-1 disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {t("save")}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost min-h-11 justify-center flex-1">{t("cancel")}</button>
      </div>
    </div>
  );
}
