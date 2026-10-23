"use client";
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Activity } from "lucide-react";
import { classifyVitals, cToF, type VitalsInput } from "@/lib/vitals";
import { useLocale, useTranslations } from "next-intl";
import { formattingLocale } from "@/lib/appLanguage";

// Vitals trends as small multiples — one chart per measure (never two
// y-scales on one plot). Built to the dataviz rules: 2px lines, ≥8px dots
// with a 2px surface ring, hairline recessive grid, a gray "normal range"
// band, crosshair + tooltip on hover/keyboard, legend only for the two-line
// BP chart, readings that tripped an alert drawn in the reserved status red
// (always with its label in the tooltip/table — never colour alone).
// Light mode only (the app has no dark theme).

export type VitalReadingRow = VitalsInput & {
  id: string;
  recordedAt: string;
  alertLevel: string;
  alerts: string | null;
  notes?: string | null;
  recordedBy?: { name: string } | null;
  appointment?: { serviceName: string | null } | null;
};

const C = {
  surface: "#fcfcfb",
  ink: "#0b0b0b",
  ink2: "#52514e",
  muted: "#898781",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  band: "#efeee9",
  s1: "#2a78d6", // categorical slot 1
  s2: "#eb6834", // categorical slot 2
  critical: "#d03b3b",
  warning: "#fab219",
  good: "#0ca30c",
};

// Titles/labels are message keys (patientAccount.vitalsCharts.metric / .series).
type Series = { key: "sys" | "dia" | "spo2" | "pulse" | "temp" | "sugar"; color: string; get: (r: VitalReadingRow) => number | null };
type Metric = {
  id: "bp" | "spo2" | "pulse" | "temp" | "sugar";
  unit: string;
  series: Series[];
  normal: [number, number] | null; // band
  fmt: (n: number) => string;
};

const METRICS: Metric[] = [
  {
    id: "bp", unit: "mmHg", normal: [60, 140], fmt: (n) => String(Math.round(n)),
    series: [
      { key: "sys", color: C.s1, get: (r) => r.systolic ?? null },
      { key: "dia", color: C.s2, get: (r) => r.diastolic ?? null },
    ],
  },
  { id: "spo2", unit: "%", normal: [95, 100], fmt: (n) => `${Math.round(n)}`, series: [{ key: "spo2", color: C.s1, get: (r) => r.spo2 ?? null }] },
  { id: "pulse", unit: "bpm", normal: [55, 100], fmt: (n) => `${Math.round(n)}`, series: [{ key: "pulse", color: C.s1, get: (r) => r.pulse ?? null }] },
  { id: "temp", unit: "°F", normal: [97, 100.4], fmt: (n) => n.toFixed(1), series: [{ key: "temp", color: C.s1, get: (r) => (r.temperatureC != null ? cToF(r.temperatureC) : null) }] },
  { id: "sugar", unit: "mg/dL", normal: [70, 180], fmt: (n) => `${Math.round(n)}`, series: [{ key: "sugar", color: C.s1, get: (r) => r.sugarMgDl ?? null }] },
];

function useFormatters() {
  const locale = formattingLocale(useLocale());
  return {
    fmtDate: (iso: string) => new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" }),
    fmtDateTime: (iso: string) => new Date(iso).toLocaleString(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }),
  };
}

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

/** The per-measure alert for one reading (status colour + label). */
function pointAlert(metric: Metric, r: VitalReadingRow): "CRITICAL" | "WARNING" | null {
  const pick: VitalsInput =
    metric.id === "bp" ? { systolic: r.systolic, diastolic: r.diastolic }
      : metric.id === "spo2" ? { spo2: r.spo2 }
        : metric.id === "pulse" ? { pulse: r.pulse }
          : metric.id === "temp" ? { temperatureC: r.temperatureC }
            : { sugarMgDl: r.sugarMgDl, sugarType: r.sugarType };
  const { level } = classifyVitals(pick);
  return level === "NORMAL" ? null : level;
}

function MetricChart({ metric, readings }: { metric: Metric; readings: VitalReadingRow[] }) {
  const t = useTranslations("patientAccount.vitalsCharts");
  const { fmtDate, fmtDateTime } = useFormatters();
  const title = t(`metric.${metric.id}`);
  const rows = readings.filter((r) => metric.series.some((s) => s.get(r) != null));
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const W = 340, H = 150, padL = 34, padR = 44, padT = 10, padB = 22;

  const geo = useMemo(() => {
    const values = rows.flatMap((r) => metric.series.map((s) => s.get(r)).filter((v): v is number => v != null));
    const lo = Math.min(...values, metric.normal?.[0] ?? Infinity);
    const hi = Math.max(...values, metric.normal?.[1] ?? -Infinity);
    const ticks = niceTicks(lo, hi);
    const yMin = ticks[0], yMax = ticks[ticks.length - 1];
    const x = (i: number) => (rows.length === 1 ? padL + (W - padL - padR) / 2 : padL + (i * (W - padL - padR)) / (rows.length - 1));
    const y = (v: number) => padT + ((yMax - v) / (yMax - yMin || 1)) * (H - padT - padB);
    return { ticks, x, y };
  }, [rows, metric]);

  if (rows.length === 0) return null;
  const latest = rows[rows.length - 1];
  const active = hover != null ? rows[hover] : null;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return;
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    rows.forEach((_, i) => { if (Math.abs(geo.x(i) - px) < Math.abs(geo.x(best) - px)) best = i; });
    setHover(best);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); setHover((h) => Math.min(rows.length - 1, (h ?? -1) + 1)); }
    if (e.key === "ArrowLeft") { e.preventDefault(); setHover((h) => Math.max(0, (h ?? rows.length) - 1)); }
    if (e.key === "Escape") setHover(null);
  };

  return (
    <figure className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <figcaption className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-sm font-semibold" style={{ color: C.ink }}>{title}</span>
        <span className="text-[11px]" style={{ color: C.muted }}>{metric.unit} · {t("readings", { count: rows.length })}</span>
      </figcaption>
      {metric.series.length > 1 && (
        <div className="flex gap-3 mb-1" aria-hidden>
          {metric.series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-[11px]" style={{ color: C.ink2 }}>
              <span className="inline-block w-3 h-[2px] rounded" style={{ background: s.color }} />{t(`series.${s.key}`)}
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded"
          role="img"
          aria-label={t("chartAria", { title, values: metric.series.map((s) => `${t(`series.${s.key}`)} ${s.get(latest) ?? "—"}`).join(", "), unit: metric.unit })}
          tabIndex={0}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
        >
          {metric.normal && (
            <>
              <rect x={padL} width={W - padL - padR} y={geo.y(Math.min(metric.normal[1], geo.ticks[geo.ticks.length - 1]))}
                height={Math.max(0, geo.y(Math.max(metric.normal[0], geo.ticks[0])) - geo.y(Math.min(metric.normal[1], geo.ticks[geo.ticks.length - 1])))}
                fill={C.band} />
              <text x={W - padR + 4} y={geo.y(Math.min(metric.normal[1], geo.ticks[geo.ticks.length - 1])) + 9} fontSize="9" fill={C.muted}>{t("normalBand")}</text>
            </>
          )}
          {geo.ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={geo.y(t)} y2={geo.y(t)} stroke={C.grid} strokeWidth={1} />
              <text x={padL - 6} y={geo.y(t) + 3} fontSize="9" textAnchor="end" fill={C.muted} style={{ fontVariantNumeric: "tabular-nums" }}>{metric.fmt(t)}</text>
            </g>
          ))}
          {rows.length > 1 && [0, rows.length - 1].map((i) => (
            <text key={i} x={geo.x(i)} y={H - 6} fontSize="9" textAnchor={i === 0 ? "start" : "end"} fill={C.muted}>{fmtDate(rows[i].recordedAt)}</text>
          ))}
          {active && <line x1={geo.x(hover!)} x2={geo.x(hover!)} y1={padT} y2={H - padB} stroke={C.axis} strokeWidth={1} />}
          {metric.series.map((s) => {
            const pts = rows.map((r, i) => ({ i, v: s.get(r) })).filter((p): p is { i: number; v: number } => p.v != null);
            const d = pts.map((p, k) => `${k ? "L" : "M"}${geo.x(p.i)},${geo.y(p.v)}`).join(" ");
            const last = pts[pts.length - 1];
            return (
              <g key={s.key}>
                {pts.length > 1 && <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
                {pts.map((p) => {
                  const alert = pointAlert(metric, rows[p.i]);
                  return (
                    <circle key={p.i} cx={geo.x(p.i)} cy={geo.y(p.v)} r={hover === p.i ? 5.5 : 4}
                      fill={alert === "CRITICAL" ? C.critical : s.color} stroke={C.surface} strokeWidth={2} />
                  );
                })}
                {/* Direct label at the line's end — the value the reader came for. */}
                {last && (
                  <text x={geo.x(last.i) + 8} y={geo.y(last.v) + 3} fontSize="10" fontWeight={600} fill={C.ink}>{metric.fmt(last.v)}</text>
                )}
              </g>
            );
          })}
        </svg>
        {active && (
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-lg border bg-white px-2.5 py-1.5 shadow-md text-xs"
            style={{ borderColor: C.grid, left: `${Math.min(70, Math.max(0, (geo.x(hover!) / W) * 100 - 15))}%` }}
          >
            <div style={{ color: C.muted }}>{fmtDateTime(active.recordedAt)}</div>
            {metric.series.map((s) => s.get(active) != null && (
              <div key={s.key} className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-[2px] rounded" style={{ background: s.color }} />
                <strong style={{ color: C.ink }}>{metric.fmt(s.get(active)!)} {metric.unit}</strong>
                {metric.series.length > 1 && <span style={{ color: C.ink2 }}>{t(`series.${s.key}`)}</span>}
              </div>
            ))}
            {pointAlert(metric, active) && (
              <div className="flex items-center gap-1 mt-0.5 font-semibold" style={{ color: pointAlert(metric, active) === "CRITICAL" ? C.critical : C.ink2 }}>
                <AlertTriangle className="w-3 h-3" style={{ color: pointAlert(metric, active) === "CRITICAL" ? C.critical : C.warning }} />
                {pointAlert(metric, active) === "CRITICAL" ? t("critical") : t("outOfRange")}
              </div>
            )}
          </div>
        )}
      </div>
    </figure>
  );
}

/** Latest-value stat tiles + one trend chart per measure + the readings table. */
export default function VitalsCharts({ readings, emptyText }: { readings: VitalReadingRow[]; emptyText?: string }) {
  const t = useTranslations("patientAccount.vitalsCharts");
  const { fmtDateTime } = useFormatters();
  const chrono = useMemo(() => [...readings].sort((a, b) => +new Date(a.recordedAt) - +new Date(b.recordedAt)), [readings]);
  if (readings.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-sm text-slate-400">
        <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />{emptyText ?? t("emptyDefault")}
      </div>
    );
  }
  const latest = chrono[chrono.length - 1];
  const latestLevel = latest.alertLevel;

  const tiles = [
    { label: t("tile.bp"), value: latest.systolic != null ? `${latest.systolic}/${latest.diastolic}` : null, unit: "mmHg" },
    { label: t("tile.spo2"), value: latest.spo2 != null ? `${latest.spo2}` : null, unit: "%" },
    { label: t("tile.pulse"), value: latest.pulse != null ? `${latest.pulse}` : null, unit: "bpm" },
    { label: t("tile.temp"), value: latest.temperatureC != null ? `${cToF(latest.temperatureC)}` : null, unit: "°F" },
    { label: t("tile.sugar"), value: latest.sugarMgDl != null ? `${latest.sugarMgDl}` : null, unit: "mg/dL" },
  ].filter((tile) => tile.value != null);

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="text-sm font-semibold text-slate-800">{t("latest", { when: fmtDateTime(latest.recordedAt) })}</p>
          {latestLevel === "NORMAL" ? (
            <span className="text-xs font-semibold flex items-center gap-1" style={{ color: "#006300" }}><CheckCircle2 className="w-3.5 h-3.5" style={{ color: C.good }} />{t("allInRange")}</span>
          ) : (
            <span className="text-xs font-semibold flex items-center gap-1" style={{ color: latestLevel === "CRITICAL" ? C.critical : C.ink2 }}>
              <AlertTriangle className="w-3.5 h-3.5" style={{ color: latestLevel === "CRITICAL" ? C.critical : C.warning }} />
              {latestLevel === "CRITICAL" ? t("criticalNeedsDoctor") : t("outOfRange")}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {tiles.map((tile) => (
            <div key={tile.label}>
              <p className="text-[11px] text-slate-500">{tile.label}</p>
              <p className="text-lg font-semibold text-slate-900">{tile.value} <span className="text-[11px] font-normal text-slate-400">{tile.unit}</span></p>
            </div>
          ))}
        </div>
        {latest.alerts && <p className="text-xs mt-2" style={{ color: latestLevel === "CRITICAL" ? C.critical : C.ink2 }}>{latest.alerts}</p>}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {METRICS.map((m) => <MetricChart key={m.id} metric={m} readings={chrono} />)}
      </div>

      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <p className="px-4 pt-3 pb-2 text-sm font-semibold text-slate-800">{t("allReadings")}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="px-4 py-2 font-medium">{t("col.when")}</th>
                <th className="px-2 py-2 font-medium">{t("col.bp")}</th>
                <th className="px-2 py-2 font-medium">{t("col.spo2")}</th>
                <th className="px-2 py-2 font-medium">{t("col.pulse")}</th>
                <th className="px-2 py-2 font-medium">{t("col.temp")}</th>
                <th className="px-2 py-2 font-medium">{t("col.sugar")}</th>
                <th className="px-4 py-2 font-medium">{t("col.status")}</th>
              </tr>
            </thead>
            <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
              {[...chrono].reverse().map((r) => (
                <tr key={r.id} className="border-b border-slate-50 align-top">
                  <td className="px-4 py-2 text-slate-600 whitespace-nowrap">
                    {fmtDateTime(r.recordedAt)}
                    {r.recordedBy && <div className="text-[10px] text-slate-400">{t("recordedBy", { name: r.recordedBy.name })}{r.appointment?.serviceName ? ` · ${r.appointment.serviceName}` : ""}</div>}
                  </td>
                  <td className="px-2 py-2 text-slate-800">{r.systolic != null ? `${r.systolic}/${r.diastolic}` : "—"}</td>
                  <td className="px-2 py-2 text-slate-800">{r.spo2 ?? "—"}</td>
                  <td className="px-2 py-2 text-slate-800">{r.pulse ?? "—"}</td>
                  <td className="px-2 py-2 text-slate-800">{r.temperatureC != null ? cToF(r.temperatureC) : "—"}</td>
                  <td className="px-2 py-2 text-slate-800">{r.sugarMgDl ?? "—"}{r.sugarMgDl != null && r.sugarType ? <span className="text-slate-400"> {r.sugarType === "FASTING" ? "F" : r.sugarType === "POST_MEAL" ? "PP" : "R"}</span> : null}</td>
                  <td className="px-4 py-2">
                    {r.alertLevel === "NORMAL" ? <span className="text-slate-500">{t("normal")}</span> : (
                      <span className="flex items-start gap-1" style={{ color: r.alertLevel === "CRITICAL" ? C.critical : C.ink2 }}>
                        <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: r.alertLevel === "CRITICAL" ? C.critical : C.warning }} />
                        <span>{r.alertLevel === "CRITICAL" ? t("critical") : t("outOfRange")}{r.alerts ? `: ${r.alerts}` : ""}</span>
                      </span>
                    )}
                    {r.notes && <div className="text-[10px] text-slate-400 mt-0.5">{r.notes}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
