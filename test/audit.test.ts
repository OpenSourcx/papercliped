import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assessHealth } from "../src/public-api/health.js";
import { PaperclipClient } from "../src/client.js";
import { proxyHopsWarning, readHttpConfig, type BridgeConfig } from "../src/config.js";
import { executeTool } from "../src/execute.js";
import { MemoryStore } from "../src/oauth/store.js";
import { createHttpServer, routeGroup } from "../src/server.js";
import { AuditRecorder, NodeReporter, SystemSampler, toRow } from "../src/telemetry/recorder.js";
import { unionMs } from "../src/telemetry/timing.js";
import type { AuditEvent, AuditRow } from "../src/telemetry/types.js";

const CID = "11111111-1111-1111-1111-111111111111";
let mock: Server, mockUrl: string;
let delayMs = 0;
let upstreamStatus = 200;

beforeAll(async () => {
  mock = createServer(async (req, res) => {
    for await (const _ of req);
    await new Promise((r) => setTimeout(r, delayMs));
    const p = new URL(req.url!, "http://x").pathname;
    const send = (s: number, b: unknown) => (res.writeHead(s, { "Content-Type": "application/json" }), res.end(JSON.stringify(b)));
    if (upstreamStatus !== 200) return send(upstreamStatus, { error: "boom" });
    if (p.endsWith("/agents")) return send(200, [{ id: "a1", name: "CEO", status: "idle" }]);
    if (p.endsWith("/dashboard")) return send(200, { agents: {}, tasks: {}, costs: {}, budgets: {} });
    if (p.endsWith("/live-runs")) return send(200, []);
    if (p.endsWith("/approvals")) return send(200, []);
    send(404, { error: "nope" });
  });
  await new Promise<void>((r) => mock.listen(0, "127.0.0.1", r));
  mockUrl = `http://127.0.0.1:${(mock.address() as AddressInfo).port}`;
});
afterAll(() => mock.close());

const cfg = (over: Partial<BridgeConfig> = {}): BridgeConfig => ({ apiUrl: `${mockUrl}/api`, apiKey: "k", companyId: CID, readOnly: false, timeoutMs: 3000, ...over });
const run = async (name: string, input: unknown = {}, over: Partial<BridgeConfig> = {}, opts: Parameters<typeof executeTool>[3] = {}) => {
  const events: AuditEvent[] = [];
  const out = await executeTool(new PaperclipClient(cfg(over)), name, input, { ...opts, audit: (e) => events.push(e) });
  return { out, ev: events[0] };
};

describe("timing", () => {
  it("unions overlapping intervals so parallel upstream calls are not double-counted", () => {
    expect(unionMs([])).toBe(0);
    expect(unionMs([[0, 100]])).toBe(100);
    expect(unionMs([[0, 100], [50, 150]])).toBe(150);
    expect(unionMs([[0, 100], [200, 250]])).toBe(150);
    expect(unionMs([[0, 100], [10, 20], [90, 120]])).toBe(120);
  });

  it("splits a tool call into total, upstream wait and call count", async () => {
    delayMs = 60;
    upstreamStatus = 200;
    // sync_snapshot fans out 3 requests in parallel: wall ≈ 60 ms, not 180 ms
    const { out, ev } = await run("paperclip_sync_snapshot");
    delayMs = 0;
    expect(out.ok).toBe(true);
    expect(ev).toMatchObject({ kind: "tool", tool: "paperclip_sync_snapshot", ok: true, upstreamCalls: 3, scope: "paperclip:read", actor: "stdio" });
    expect(ev.upstreamMs!).toBeGreaterThanOrEqual(55);
    expect(ev.upstreamMs!).toBeLessThan(150);
    expect(ev.totalMs!).toBeGreaterThanOrEqual(ev.upstreamMs!);
    expect(ev.totalMs! - ev.upstreamMs!).toBeLessThan(80); // bridge overhead is small
  });

  it("a call that never reaches Paperclip has zero upstream time", async () => {
    const { ev } = await run("paperclip_pause_agent", { agentId: "a1" }, { readOnly: true });
    expect(ev).toMatchObject({ ok: false, upstreamCalls: 0, upstreamMs: 0 });
  });
});

describe("error classes separate caller mistakes from system faults", () => {
  const cases: [string, () => ReturnType<typeof run>, number, string][] = [
    ["validation", () => run("paperclip_pause_agent", {}), 400, "invalid_input"],
    ["unknown tool", () => run("nope"), 404, "invalid_input"],
    ["missing confirm", () => run("paperclip_api_request", { method: "DELETE", path: "/x" }), 400, "invalid_input"],
    ["no company id", () => run("paperclip_list_agents", {}, { companyId: null }), 400, "invalid_input"],
    ["bad cursor", () => run("paperclip_sync_changes", { cursor: "yesterday" }), 400, "invalid_input"],
    ["read-only", () => run("paperclip_pause_agent", { agentId: "a1" }, { readOnly: true }), 403, "read_only"],
    ["missing scope", () => run("paperclip_pause_agent", { agentId: "a1" }, {}, { scopes: ["paperclip:read"] }), 403, "insufficient_scope"],
  ];
  it.each(cases)("%s", async (_n, f, status, klass) => {
    const { out, ev } = await f();
    expect(out).toMatchObject({ ok: false, status });
    expect(ev.errorClass).toBe(klass);
  });

  it("classifies upstream outcomes", async () => {
    upstreamStatus = 502;
    expect((await run("paperclip_list_agents")).ev).toMatchObject({ errorClass: "upstream_5xx", status: 502 });
    upstreamStatus = 404;
    expect((await run("paperclip_list_agents")).ev).toMatchObject({ errorClass: "upstream_4xx", status: 404 });
    upstreamStatus = 200;
    const dead = await run("paperclip_list_agents", {}, { apiUrl: "http://127.0.0.1:1/api" });
    expect(dead.out).toMatchObject({ ok: false, status: 502 });
    expect(dead.ev.errorClass).toBe("upstream_unreachable");
  });

  it("success events carry no error fields and no payload", async () => {
    const { ev } = await run("paperclip_list_agents");
    expect(ev.errorClass).toBeUndefined();
    expect(JSON.stringify(ev)).not.toMatch(/agent-of|CEO|"k"|Bearer/);
  });
});

describe("AuditRecorder", () => {
  const ev = (o: Partial<AuditEvent> = {}): AuditEvent => ({ ts: new Date().toISOString(), tool: "t", kind: "tool", mutation: false, ok: true, actor: "pcb_g_abc", totalMs: 12, upstreamMs: 5, upstreamCalls: 1, ...o });

  it("maps events to bounded rows (grant id only for OAuth callers, long strings clipped)", () => {
    const r = toRow(ev({ client: "x".repeat(500), instance: "h".repeat(500), userId: "u".repeat(500) }), "n1");
    expect(r.client).toHaveLength(100);
    expect(r.instance).toHaveLength(255);
    expect(r.userId).toHaveLength(200);
    expect(r.grantId).toBe("pcb_g_abc");
    expect(toRow(ev({ actor: "static-token" }), "n").grantId).toBeNull();
    expect(toRow(ev({ actor: "stdio" }), "n").grantId).toBeNull();
  });

  it("writes in batches off the request path", async () => {
    const store = new MemoryStore();
    const rec = new AuditRecorder(store, { node: "n1", maxBatch: 1000 });
    for (let i = 0; i < 25; i++) rec.record(ev({ totalMs: i }));
    expect(rec.stats()).toMatchObject({ buffered: 25, flushed: 0 });
    expect((await store.auditRecent(0, 100)).length).toBe(0);
    await rec.flush();
    expect(rec.stats()).toMatchObject({ buffered: 0, flushed: 25, dropped: 0 });
    expect((await store.auditRecent(0, 100)).length).toBe(25);
  });

  it("flushes automatically when a batch fills", async () => {
    const store = new MemoryStore();
    const rec = new AuditRecorder(store, { node: "n", maxBatch: 5 });
    for (let i = 0; i < 5; i++) rec.record(ev());
    await rec.flush();
    expect((await store.auditRecent(0, 100)).length).toBe(5);
  });

  it("never throws or blocks when the database is down; retries; drops oldest past the cap", async () => {
    let down = true;
    const calls: AuditRow[][] = [];
    const store = new MemoryStore();
    const flaky = Object.assign(Object.create(store), {
      insertAudit: async (rows: AuditRow[]) => {
        if (down) throw new Error("db down");
        calls.push(rows);
        await store.insertAudit(rows);
      },
    });
    const rec = new AuditRecorder(flaky, { node: "n", maxBatch: 1_000_000, maxBuffer: 10 });
    for (let i = 0; i < 15; i++) expect(() => rec.record(ev({ totalMs: i }))).not.toThrow();
    expect(rec.stats()).toMatchObject({ buffered: 10, dropped: 5 });
    await rec.flush();
    expect(rec.stats()).toMatchObject({ buffered: 10, lastError: "db down" });
    down = false;
    await rec.flush();
    expect(rec.stats()).toMatchObject({ buffered: 0, flushed: 10, lastError: null });
    expect(calls[0].map((r) => r.totalMs)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14]); // oldest five were dropped
  });

  it("optionally mirrors each event to stderr as one JSON line", () => {
    const lines: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    (process.stderr as any).write = (s: string) => (lines.push(String(s)), true);
    try {
      new AuditRecorder(new MemoryStore(), { stderr: true }).record(ev());
    } finally {
      (process.stderr as any).write = orig;
    }
    expect(JSON.parse(lines[0]).audit.tool).toBe("t");
  });
});

describe("SystemSampler", () => {
  it("measures database round-trip, loop lag and memory, and survives a failing database", async () => {
    let fail = false;
    const s = new SystemSampler({ ping: async () => { await new Promise((r) => setTimeout(r, 5)); if (fail) throw new Error("x"); } }, 1000);
    await s.sample();
    await s.sample();
    let snap = s.snapshot();
    expect(snap.dbPingMs).toBeGreaterThanOrEqual(4);
    expect(snap.rssMb).toBeGreaterThan(10);
    expect(snap.recentPing).toHaveLength(2);
    fail = true;
    await s.sample();
    snap = s.snapshot();
    expect(snap).toMatchObject({ dbPingMs: null, dbFailures: 1 });
    expect(snap.recentPing.at(-1)).toBeNull();
    s.stop();
  });
});

describe("health assessment", () => {
  const base = { count: 100, faults: 0, p95: 200, dbPingMs: 10, dbFailures: 0, loopLagP99Ms: 5, slowMs: 1500, recentDbFailed: false, bridgeSilentMs: 5000 };
  it("healthy / idle", () => {
    expect(assessHealth(base).state).toBe("healthy");
    expect(assessHealth({ ...base, count: 0 })).toMatchObject({ state: "idle" });
  });
  it("degrades on slow p95, faults, slow DB, loop lag; critical at higher thresholds", () => {
    expect(assessHealth({ ...base, p95: 1600 }).state).toBe("degraded");
    expect(assessHealth({ ...base, p95: 5000 }).state).toBe("critical");
    expect(assessHealth({ ...base, faults: 3 }).state).toBe("degraded");
    expect(assessHealth({ ...base, faults: 12 }).state).toBe("critical");
    expect(assessHealth({ ...base, dbPingMs: 400 }).state).toBe("degraded");
    expect(assessHealth({ ...base, dbPingMs: 1500 }).state).toBe("critical");
    expect(assessHealth({ ...base, recentDbFailed: true }).state).toBe("critical");
    expect(assessHealth({ ...base, loopLagP99Ms: 150 }).state).toBe("degraded");
    expect(assessHealth({ ...base, loopLagP99Ms: 900 }).state).toBe("critical");
  });
  it("a handful of calls is not enough to judge latency or fault rate", () => {
    expect(assessHealth({ ...base, count: 3, faults: 3, p95: 9000 }).state).toBe("healthy");
  });
  it("flags a bridge that stopped reporting (asleep or down) and one that never reported", () => {
    expect(assessHealth({ ...base, bridgeSilentMs: 200_000 })).toMatchObject({ state: "critical" });
    expect(assessHealth({ ...base, bridgeSilentMs: 200_000 }).reasons.join(" ")).toMatch(/asleep, down/);
    expect(assessHealth({ ...base, bridgeSilentMs: null }).state).toBe("degraded");
  });
  it("explains itself", () => {
    expect(assessHealth({ ...base, p95: 1600, faults: 3 }).reasons.join(" ")).toMatch(/p95 latency 1600 ms.*|.*system fault/);
  });
});

describe("routeGroup", () => {
  it("groups measurable endpoints and ignores the rest", () => {
    expect(routeGroup("/token")).toBe("oauth.token");
    expect(routeGroup("/authorize/decision")).toBe("oauth.authorize");
    expect(routeGroup("/mcp")).toBe("mcp");
    expect(routeGroup("/actions/paperclip_list_agents")).toBe("actions");
    for (const p of ["/healthz", "/readyz", "/openapi.json", "/admin", "/admin/api/summary", "/.well-known/oauth-authorization-server", "/nope"]) expect(routeGroup(p)).toBeNull();
  });
});

// ───────────── end to end: the bridge writes, the SEPARATE panel reads ─────────────
describe("bridge configuration", () => {
  it("audit settings", () => {
    expect(readHttpConfig({ BRIDGE_AUDIT_RETENTION_DAYS: "7", BRIDGE_AUDIT_STDERR: "0", BRIDGE_TOKEN: "t".repeat(32) } as any).audit).toEqual({ retentionDays: 7, stderr: false });
    expect(readHttpConfig({} as any).audit).toEqual({ retentionDays: 30, stderr: true });
  });
});

describe("proxy hops startup warning (ERR-MCP-004)", () => {
  it("warns only when PORT is set and hops is 0", () => {
    expect(proxyHopsWarning({ PORT: "10000" }, 0)).toMatch(/BRIDGE_PROXY_HOPS/);
    expect(proxyHopsWarning({ PORT: "10000" }, 1)).toBeNull();
    expect(proxyHopsWarning({}, 0)).toBeNull();
  });
});
