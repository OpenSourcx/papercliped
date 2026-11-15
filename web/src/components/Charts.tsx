import { useId, useState } from "react";
import { cx } from "./cx";

export interface Point {
  t: string; // ISO
  [series: string]: number | string;
}
export interface SeriesDef {
  key: string;
  label: string;
  /** Lines are told apart by style and markers, never by colour alone. */
  style: "solid" | "dashed";
}

const fmtTime = (iso: string, spanHours: number) => {
  const d = new Date(iso);
  return spanHours > 48 ? d.toLocaleDateString("en-US", { weekday: "short", hour: "2-digit", hour12: false, timeZone: "UTC" }) : d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
};

/**
 * A small accessible line/area chart in SVG. It has a text summary (figcaption), a "show as table" toggle, keyboard-focusable
 * points with labels, and it tells series apart by line style and markers as well as colour.
 */
export function LineChart({ title, summary, data, series, unit = "", height = 200 }: { title: string; summary: string; data: Point[]; series: SeriesDef[]; unit?: string; height?: number }) {
  const id = useId();
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = height, PAD = { l: unit ? 64 : 40, r: 12, t: 12, b: 26 };
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
  const nice = Math.ceil(max / 5) * 5 || 5;
  const x = (i: number) => PAD.l + (data.length <= 1 ? 0 : (i / (data.length - 1)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - v / nice) * (H - PAD.t - PAD.b);
  const spanHours = data.length > 1 ? (Date.parse(data[data.length - 1].t) - Date.parse(data[0].t)) / 3_600_000 : 0;
  const path = (k: string) => data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(Number(d[k]) || 0).toFixed(1)}`).join(" ");
  const first = series[0];
  return (
    <figure className="rounded-lg border border-line bg-surface p-4" aria-labelledby={`${id}-t`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id={`${id}-t`} className="font-sans text-base font-semibold">{title}</h3>
          <figcaption className="text-sm text-muted">{summary}</figcaption>
        </div>
        <button type="button" onClick={() => setTable((v) => !v)} aria-pressed={table} className="rounded-lg border border-field px-2 py-1 text-xs font-semibold transition-transform duration-150">{table ? "Show chart" : "Show as table"}</button>
      </div>
      <ul className="mt-2 flex flex-wrap gap-4 text-xs" aria-label="Legend">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <svg width="22" height="10" aria-hidden="true"><line x1="0" y1="5" x2="22" y2="5" className={s.style === "solid" ? "stroke-accent" : "stroke-ink"} strokeWidth="2" strokeDasharray={s.style === "dashed" ? "4 3" : undefined} />{s.style === "dashed" ? <rect x="8" y="2" width="6" height="6" className="fill-ink" /> : <circle cx="11" cy="5" r="3" className="fill-accent" />}</svg>
            {s.label}
          </li>
        ))}
      </ul>
      {table ? (
        <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="sticky top-0 bg-surface"><tr><th scope="col" className="px-3 py-1.5">Time (UTC)</th>{series.map((s) => <th key={s.key} scope="col" className="px-3 py-1.5">{s.label}</th>)}</tr></thead>
            <tbody>{data.map((d) => <tr key={d.t} className="border-t border-line"><td className="px-3 py-1">{fmtTime(d.t, spanHours)}</td>{series.map((s) => <td key={s.key} className="px-3 py-1 tabular-nums">{Number(d[s.key]).toLocaleString("en-US")}{unit}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div className="relative mt-2">
          {data.length === 0 && <p className="absolute inset-0 grid place-items-center text-sm text-muted">No data yet</p>}
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${title}. ${summary}`} onMouseLeave={() => setHover(null)}>
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(nice * f)} y2={y(nice * f)} className="stroke-line" strokeWidth="1" />
                <text x={PAD.l - 6} y={y(nice * f) + 4} textAnchor="end" className="fill-muted text-[11px]">{Number.isInteger(nice * f) ? nice * f : (nice * f).toFixed(1)}{unit}</text>
              </g>
            ))}
            {data.length > 0 && [0, Math.floor((data.length - 1) / 2), data.length - 1].map((i) => <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} className="fill-muted text-[11px]">{fmtTime(data[i].t, spanHours)}</text>)}
            {first && data.length > 0 && <path d={`${path(first.key)} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} className="fill-accent opacity-15" />}
            {data.length > 0 && series.map((s) => <path key={s.key} d={path(s.key)} fill="none" strokeWidth="2.5" strokeLinejoin="round" className={cx("chart-line", s.style === "solid" ? "stroke-accent" : "stroke-ink")} strokeDasharray={s.style === "dashed" ? "6 4" : undefined} />)}
            {data.map((d, i) => (
              <g key={d.t} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} role="img" aria-label={`${fmtTime(d.t, spanHours)}: ${series.map((s) => `${s.label} ${d[s.key]}${unit}`).join(", ")}`} className="outline-none">
                <rect x={x(i) - (W - PAD.l - PAD.r) / Math.max(1, data.length - 1) / 2} y={PAD.t} width={(W - PAD.l - PAD.r) / Math.max(1, data.length - 1)} height={H - PAD.t - PAD.b} fill="transparent" />
                {hover === i && <line x1={x(i)} x2={x(i)} y1={PAD.t} y2={H - PAD.b} className="stroke-field" strokeWidth="1" />}
                {series.map((s) => s.style === "dashed"
                  ? <rect key={s.key} x={x(i) - 2.5} y={y(Number(d[s.key]) || 0) - 2.5} width="5" height="5" className={cx("fill-ink", hover === i ? "opacity-100" : "opacity-0")} />
                  : <circle key={s.key} cx={x(i)} cy={y(Number(d[s.key]) || 0)} r={hover === i ? 4.5 : 0} className="fill-accent" />)}
              </g>
            ))}
          </svg>
          {hover != null && data[hover] && (
            <div className="pointer-events-none absolute right-2 top-2 rounded-lg border border-line bg-bg px-3 py-2 text-xs shadow-lg">
              <div className="font-semibold">{fmtTime(data[hover].t, spanHours)} UTC</div>
              {series.map((s) => <div key={s.key}>{s.label}: <span className="tabular-nums font-semibold">{Number(data[hover][s.key]).toLocaleString("en-US")}{unit}</span></div>)}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

/** Labelled horizontal bars: the number is always printed, so the bar length is never the only cue. */
export function BarList({ title, items, empty = "Nothing to show yet." }: { title: string; items: { label: string; value: number }[]; empty?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const shown = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  return (
    <figure className="rounded-lg border border-line bg-surface p-4">
      <h3 className="font-sans text-base font-semibold">{title}</h3>
      {shown.length ? (
        <ul className="mt-3 space-y-2">
          {shown.map((i) => (
            <li key={i.label} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] sm:grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3 text-sm">
              <span className="truncate font-mono text-xs" title={i.label}>{i.label}</span>
              <span className="h-3 overflow-hidden rounded-full bg-bg" aria-hidden="true"><span className="bar-grow block h-full rounded-full bg-accent" style={{ width: `${(i.value / max) * 100}%` }} /></span>
              <span className="tabular-nums font-semibold">{i.value.toLocaleString("en-US")}</span>
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-sm text-muted">{empty}</p>}
    </figure>
  );
}

/** A percentage with a meter. */
export function Meter({ label, value, hint }: { label: string; value: number | null; hint?: string }) {
  const pct = value == null ? null : Math.round(value * 1000) / 10;
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="font-display text-3xl font-bold tabular-nums">{pct == null ? "—" : `${pct}%`}</div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} aria-valuetext={pct == null ? "no data" : `${pct}%`}>
        <span className="bar-grow block h-full rounded-full bg-accent" style={{ width: `${pct ?? 0}%` }} />
      </div>
      {hint && <div className="mt-1 text-sm text-muted">{hint}</div>}
    </div>
  );
}
