// Vitals a nurse records at a visit. Client-safe — the nurse's form, the
// patient's charts, the doctor's view and the API all classify readings with
// these same rules.
//
// ⚠ The alert thresholds below are common adult reference ranges, chosen to
// flag "tell the doctor now" situations — not a diagnosis. They should be
// reviewed by a doctor before relying on them clinically.

export type VitalsInput = {
  systolic?: number | null;
  diastolic?: number | null;
  pulse?: number | null;
  spo2?: number | null;
  temperatureC?: number | null;
  sugarMgDl?: number | null;
  sugarType?: string | null; // FASTING, RANDOM, POST_MEAL
};

export type AlertLevel = "NORMAL" | "WARNING" | "CRITICAL";
export type VitalAlert = { level: Exclude<AlertLevel, "NORMAL">; message: string };

export const SUGAR_TYPES = [
  { id: "FASTING", label: "Fasting" },
  { id: "RANDOM", label: "Random" },
  { id: "POST_MEAL", label: "After meal" },
] as const;

// Physically plausible input ranges — anything outside is a typo.
export const VITAL_RANGES = {
  systolic: [60, 260],
  diastolic: [30, 160],
  pulse: [30, 220],
  spo2: [50, 100],
  temperatureC: [33, 43],
  sugarMgDl: [20, 600],
} as const;

export const cToF = (c: number) => Math.round((c * 9) / 5 * 10 + 320) / 10;
export const fToC = (f: number) => Math.round(((f - 32) * 5) / 9 * 10) / 10;

export function classifyVitals(v: VitalsInput): { level: AlertLevel; alerts: VitalAlert[] } {
  const alerts: VitalAlert[] = [];
  const crit = (message: string) => alerts.push({ level: "CRITICAL", message });
  const warn = (message: string) => alerts.push({ level: "WARNING", message });

  const { systolic: sys, diastolic: dia } = v;
  if (sys != null || dia != null) {
    const bp = `BP ${sys ?? "?"}/${dia ?? "?"}`;
    if ((sys ?? 0) >= 180 || (dia ?? 0) >= 110) crit(`${bp} — very high (hypertensive crisis range)`);
    else if ((sys != null && sys < 90) || (dia != null && dia < 60)) {
      if ((sys != null && sys < 80) || (dia != null && dia < 50)) crit(`${bp} — very low`);
      else warn(`${bp} — low`);
    } else if ((sys ?? 0) >= 140 || (dia ?? 0) >= 90) warn(`${bp} — high`);
  }
  if (v.spo2 != null) {
    if (v.spo2 < 92) crit(`SpO2 ${v.spo2}% — low oxygen`);
    else if (v.spo2 < 95) warn(`SpO2 ${v.spo2}% — slightly low`);
  }
  if (v.pulse != null) {
    if (v.pulse < 45 || v.pulse > 130) crit(`Pulse ${v.pulse} — ${v.pulse < 45 ? "very slow" : "very fast"}`);
    else if (v.pulse < 55 || v.pulse > 100) warn(`Pulse ${v.pulse} — ${v.pulse < 55 ? "slow" : "fast"}`);
  }
  if (v.temperatureC != null) {
    const t = `${v.temperatureC}°C (${cToF(v.temperatureC)}°F)`;
    if (v.temperatureC >= 39.5) crit(`Temperature ${t} — high fever`);
    else if (v.temperatureC < 35) crit(`Temperature ${t} — too low`);
    else if (v.temperatureC >= 38) warn(`Temperature ${t} — fever`);
  }
  if (v.sugarMgDl != null) {
    const s = `Sugar ${v.sugarMgDl} mg/dL`;
    if (v.sugarMgDl < 70) crit(`${s} — low (hypoglycaemia)`);
    else if (v.sugarMgDl > 300) crit(`${s} — very high`);
    else if (v.sugarType === "FASTING" ? v.sugarMgDl > 125 : v.sugarMgDl > 180) warn(`${s} — high`);
  }

  const level: AlertLevel = alerts.some((a) => a.level === "CRITICAL") ? "CRITICAL" : alerts.length ? "WARNING" : "NORMAL";
  return { level, alerts };
}

/** Validates the nurse's form → cleaned values, or an error. */
export function parseVitals(body: Record<string, unknown>):
  | { error: string }
  | { data: Required<VitalsInput> & { notes: string | null } } {
  const num = (k: string, int = true) => {
    const raw = body[k];
    if (raw === undefined || raw === null || raw === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return NaN;
    return int ? Math.round(n) : Math.round(n * 10) / 10;
  };
  const data = {
    systolic: num("systolic"),
    diastolic: num("diastolic"),
    pulse: num("pulse"),
    spo2: num("spo2"),
    temperatureC: num("temperatureC", false),
    sugarMgDl: num("sugarMgDl"),
    sugarType: null as string | null,
    notes: null as string | null,
  };
  const labels: Record<keyof typeof VITAL_RANGES, string> = {
    systolic: "BP (upper)", diastolic: "BP (lower)", pulse: "Pulse", spo2: "SpO2", temperatureC: "Temperature", sugarMgDl: "Sugar",
  };
  for (const k of Object.keys(VITAL_RANGES) as (keyof typeof VITAL_RANGES)[]) {
    const v = data[k];
    if (v === null) continue;
    const [lo, hi] = VITAL_RANGES[k];
    if (Number.isNaN(v) || v < lo || v > hi) return { error: `${labels[k]} looks wrong — please check the number.` };
  }
  if ((data.systolic == null) !== (data.diastolic == null)) return { error: "Enter both BP numbers (upper and lower)." };
  if (data.systolic != null && data.diastolic != null && data.diastolic >= data.systolic) {
    return { error: "BP lower number must be less than the upper number." };
  }
  if (data.sugarMgDl != null) {
    const t = String(body.sugarType ?? "RANDOM");
    if (!SUGAR_TYPES.some((s) => s.id === t)) return { error: "Choose when the sugar was checked." };
    data.sugarType = t;
  }
  if (Object.entries(data).every(([k, v]) => v === null || k === "notes" || k === "sugarType")) {
    return { error: "Enter at least one reading." };
  }
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 500) : "";
  data.notes = notes || null;
  return { data: data as Required<VitalsInput> & { notes: string | null } };
}

/** One-line summary for cards and push notifications. */
export function vitalsSummary(v: VitalsInput): string {
  const parts: string[] = [];
  if (v.systolic != null && v.diastolic != null) parts.push(`BP ${v.systolic}/${v.diastolic}`);
  if (v.pulse != null) parts.push(`Pulse ${v.pulse}`);
  if (v.spo2 != null) parts.push(`SpO2 ${v.spo2}%`);
  if (v.temperatureC != null) parts.push(`${cToF(v.temperatureC)}°F`);
  if (v.sugarMgDl != null) parts.push(`Sugar ${v.sugarMgDl}`);
  return parts.join(" · ");
}
