import { useMemo, useState } from "react";
import tools from "../generated/tools.json";
import { cx } from "./cx";
import { Badge } from "./ui";

type Level = "paperclip:read" | "paperclip:control";
const RANK: Record<Level, number> = { "paperclip:read": 1, "paperclip:control": 2 };
const LEVELS: { id: Level; label: string; note: string }[] = [
  { id: "paperclip:read", label: "Read only", note: "The default. Reports, sync and lists. Nothing can change." },
  { id: "paperclip:control", label: "Full control", note: "Every tool: run agents, issues, goals, approvals and budgets from anywhere." },
];

/** Pick a level and see which of the real tools the AI could use. Generated from src/tools.ts, so it can't drift. */
export function Playground() {
  const [level, setLevel] = useState<Level>("paperclip:read");
  const [all, setAll] = useState(false); // phones show the first 8 until expanded
  const allowed = useMemo(() => tools.filter((t) => RANK[t.scope as Level] <= RANK[level]).length, [level]);
  return (
    <div className="rounded-xl border border-line bg-surface p-4 sm:p-6">
      <div role="radiogroup" aria-label="Access level" className="grid gap-2 sm:grid-cols-2">
        {LEVELS.map((l) => (
          <label key={l.id} className={cx("cursor-pointer rounded-lg border p-3 transition-all duration-150", level === l.id ? "border-accent bg-bg shadow-md" : "border-line")}>
            <input type="radio" name="pcl-level" value={l.id} checked={level === l.id} onChange={() => setLevel(l.id)} className="sr-only" />
            <span className="flex items-center gap-2 font-semibold">
              <span aria-hidden="true" className={cx("inline-block h-3 w-3 rounded-full border-2 border-accent", level === l.id && "bg-accent")} />
              {l.label}
            </span>
            <span className="mt-1 block text-sm text-muted">{l.note}</span>
          </label>
        ))}
      </div>
      <p className="mt-4 text-sm font-medium" aria-live="polite">
        <span className="font-display text-2xl font-bold tabular-nums">{allowed}</span> of {tools.length} tools available at this level
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((t, n) => {
          const ok = RANK[t.scope as Level] <= RANK[level];
          return (
            <li key={t.name} className={cx(!all && n >= 8 && "max-sm:hidden", "flex items-start gap-2 rounded-xl border px-3 py-2 text-sm transition-all duration-200", ok ? "border-line bg-bg" : "border-dashed border-line opacity-60")}>
              <span aria-hidden="true" key={`${t.name}-${ok}`} className="animate-pop mt-0.5 font-bold">{ok ? "✓" : "✕"}</span>
              <span className="min-w-0">
                <span className="font-medium">{t.title}</span>
                <span className="sr-only">{ok ? " (allowed)" : " (not allowed)"}</span>
                {t.access === "destructive" && <Badge tone="outline" className="ml-2">can't undo</Badge>}
                <span className="block truncate font-mono text-xs text-muted">{t.name}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {!all && <button type="button" onClick={() => setAll(true)} className="mt-3 w-full rounded-xl border border-field py-2 text-sm font-semibold sm:hidden">Show all {tools.length} tools</button>}
      <p className="mt-3 text-xs text-muted">Raw API calls (<code className="font-mono">paperclip_api_request</code>) need Read only for GET and Full control for anything else.</p>
    </div>
  );
}
