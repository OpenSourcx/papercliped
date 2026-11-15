import { useState } from "react";
import { BarList, LineChart, Meter } from "../components/Charts";
import { CountUp } from "../components/CountUp";
import { cx } from "../components/cx";
import { Button, Stat, TextLink } from "../components/ui";
import { usePublicStatus, type PublicWindow } from "../lib/publicApi";
import { usePageTitle } from "./usePageTitle";

const WINDOWS: { id: PublicWindow; label: string }[] = [{ id: "1h", label: "Last hour" }, { id: "24h", label: "Last 24 hours" }, { id: "7d", label: "Last 7 days" }];
const STATUS_TEXT = { ok: { title: "All systems normal", icon: "✓" }, degraded: { title: "Degraded performance", icon: "!" }, down: { title: "Major problem", icon: "✕" } } as const;
const REASON: Record<string, string> = { bad_credentials: "wrong username or key", rate_limited: "rate limited", denied: "denied in Paperclip", expired: "timed out", unreachable: "Paperclip unreachable", invalid_instance: "invalid address", too_many_attempts: "too many attempts", other: "other" };

function uptime(s: number) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

/** Live, public, aggregate-only numbers from /api/public/v1. Nothing here identifies anyone. */
export function Status() {
  usePageTitle("Status");
  const [win, setWin] = useState<PublicWindow>("24h");
  const { status, stats, series, error, loading, updatedAt, reload } = usePublicStatus(win);
  const st = status?.status ?? null;
  const buckets = series?.buckets ?? [];
  const points = buckets as unknown as import("../components/Charts").Point[];
  const totalReq = buckets.reduce((a, b) => a + b.requests, 0);
  const peak = buckets.reduce((m, b) => (b.requests > m.requests ? b : m), buckets[0] ?? { requests: 0, t: "" });
  const winLabel = WINDOWS.find((w) => w.id === win)!.label.toLowerCase();
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold sm:text-5xl">Status</h1>
          <p className="mt-2 max-w-2xl text-muted">Live numbers for the hosted service at papercliped.co. Aggregate only: nothing here identifies anyone. Read them yourself through the <TextLink to="/docs/public-api">public API</TextLink>.</p>
        </div>
        <div role="group" aria-label="Time window" className="flex flex-wrap gap-2">
          {WINDOWS.map((w) => (
            <button key={w.id} type="button" aria-pressed={win === w.id} onClick={() => setWin(w.id)} className={cx("rounded-lg border px-3 py-1 text-sm font-medium transition-all duration-150", win === w.id ? "border-accent bg-accent text-accent-ink" : "border-field")}>{w.label}</button>
          ))}
        </div>
      </div>

      <section aria-live="polite" className={cx("mt-8 flex flex-wrap items-center gap-4 rounded-xl border p-5 sm:p-6", st === "ok" ? "border-line bg-surface" : st ? "border-accent bg-surface" : "border-line")}>
        <span aria-hidden="true" className={cx("grid h-12 w-12 place-items-center rounded-lg text-xl font-bold", st ? "bg-accent text-accent-ink" : "border border-field", st === "ok" && "animate-pulse-dot")}>{st ? STATUS_TEXT[st].icon : "…"}</span>
        <div className="flex-1">
          <h2 className="text-2xl font-semibold">{st ? STATUS_TEXT[st].title : error ? "Status unavailable" : "Checking…"}</h2>
          <p className="text-sm text-muted">
            {status ? <>Version {status.version} · up {uptime(status.uptimeSeconds)} · checked {new Date(status.checkedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</> : error ?? "Loading the latest numbers."}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void reload()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</Button>
        <span className="sr-only">{updatedAt ? "Updated" : ""}</span>
      </section>

      <section aria-labelledby="nums-h" className="mt-8">
        <h2 id="nums-h" className="sr-only">Key numbers ({winLabel})</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="People" value={<CountUp value={stats?.users.total ?? null} />} hint={stats ? `${stats.users.active} active, ${stats.users.new} new` : undefined} />
          <Stat label="Live connections" value={<CountUp value={stats?.connections.live ?? null} />} />
          <Meter label="Requests that succeeded" value={stats?.requests.successRate ?? null} hint={stats ? `${stats.requests.count.toLocaleString("en-US")} requests` : undefined} />
          <Meter label="Sign-ins that succeeded" value={stats?.auth.successRate ?? null} hint={stats ? `${stats.auth.flowsCompleted} of ${stats.auth.flowsStarted}` : undefined} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Latency p50" value={stats ? `${stats.requests.latencyMs.p50} ms` : "—"} />
          <Stat label="Latency p95" value={stats ? `${stats.requests.latencyMs.p95} ms` : "—"} />
          <Stat label="Latency p99" value={stats ? `${stats.requests.latencyMs.p99} ms` : "—"} />
          <Stat label="Database ping" value={stats?.load.dbPingMs != null ? `${stats.load.dbPingMs} ms` : "—"} hint={stats ? `${stats.load.bridgesReporting} bridge${stats.load.bridgesReporting === 1 ? "" : "s"} reporting` : undefined} />
        </div>
      </section>

      <section aria-labelledby="charts-h" className="mt-8 grid gap-4 lg:grid-cols-2">
        <h2 id="charts-h" className="sr-only">Charts ({winLabel})</h2>
        <LineChart title="Requests and errors" summary={buckets.length ? `${totalReq.toLocaleString("en-US")} requests ${winLabel}; busiest bucket ${peak.requests} requests. Errors shown dashed.` : "No data yet."} data={points} series={[{ key: "requests", label: "Requests", style: "solid" }, { key: "errors", label: "Errors", style: "dashed" }]} />
        <LineChart title="Response time (p95)" summary={stats ? `p95 ${stats.requests.latencyMs.p95} ms over the ${winLabel}.` : "No data yet."} data={points} series={[{ key: "p95Ms", label: "p95 latency", style: "solid" }]} unit=" ms" />
        <LineChart title="Sign-ins" summary={stats ? `${stats.auth.flowsCompleted} completed and ${stats.auth.flowsFailed} failed ${winLabel}.` : "No data yet."} data={points} series={[{ key: "authCompleted", label: "Completed", style: "solid" }, { key: "authFailed", label: "Failed", style: "dashed" }]} />
        <BarList title="Error mix" items={stats ? Object.entries(stats.errors.byClass).map(([label, value]) => ({ label, value })) : []} empty="No errors in this window." />
        <BarList title="Why sign-ins failed" items={stats ? Object.entries(stats.auth.failuresByReason).map(([k, value]) => ({ label: REASON[k] ?? k, value })) : []} empty="No failed sign-ins in this window." />
        <BarList title="Most used tools" items={stats ? Object.entries(stats.requests.byTool).map(([label, value]) => ({ label, value })).slice(0, 8) : []} empty="No tool calls in this window." />
      </section>
      <p className="mt-6 text-sm text-muted">Refreshes every 30 seconds. Times are UTC. Errors include caller mistakes (like a missing permission); faults are problems on our side.</p>
    </div>
  );
}
