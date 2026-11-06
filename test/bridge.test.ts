import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { PaperclipClient } from "../src/client.js";
import { executeTool } from "../src/execute.js";
import { createHttpServer } from "../src/server.js";
import { buildOpenApi } from "../src/openapi.js";
import { tools } from "../src/tools.js";

const CID = "11111111-1111-1111-1111-111111111111";
const calls: { method: string; url: string; auth?: string; body?: any }[] = [];
let agentStatus = "running";

function mockPaperclip(): Server {
  return createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    calls.push({ method: req.method!, url: req.url!, auth: req.headers.authorization, body: raw ? JSON.parse(raw) : undefined });
    const send = (s: number, b: unknown) => (res.writeHead(s, { "Content-Type": "application/json" }), res.end(JSON.stringify(b)));
    const u = new URL(req.url!, "http://x");
    const p = u.pathname;
    if (p === `/api/companies/${CID}/dashboard`)
      return send(200, {
        agents: { active: 2, running: 1, paused: 1, error: 0 },
        tasks: { open: 5, inProgress: 2, blocked: 1, done: 9 },
        costs: { monthSpendCents: 1234, monthBudgetCents: 10000, monthUtilizationPercent: 12.34 },
        budgets: { activeIncidents: 0 },
      });
    if (p === `/api/companies/${CID}/agents`)
      return send(200, [
        { id: "a1", name: "CEO", role: "ceo", status: "running", budgetMonthlyCents: 5000 },
        { id: "a2", name: "Dev", role: "engineer", status: "paused", budgetMonthlyCents: 3000 },
      ]);
    if (p === `/api/companies/${CID}/approvals`) return send(200, [{ id: "ap1", status: "pending" }]);
    if (p === `/api/companies/${CID}/live-runs`) return send(200, [{ id: "r1", agentId: "a1" }]);
    if (p === `/api/companies/${CID}/issues` && req.method === "GET")
      return send(200, [
        { id: "i1", assigneeAgentId: "a1", status: "done" },
        { id: "i2", assigneeAgentId: "a1", status: "done" },
        { id: "i3", assigneeAgentId: "a2", status: "blocked" },
      ]);
    if (p === `/api/companies/${CID}/costs/summary`) return send(200, { spendCents: 1234, budgetCents: 10000, utilizationPercent: 12.34 });
    if (p === `/api/companies/${CID}/costs/by-agent`) return send(200, [{ agentId: "a1", agentName: "CEO", costCents: 1000, inputTokens: 5, outputTokens: 6 }]);
    if (p === `/api/companies/${CID}/costs/by-project`) return send(200, []);
    if (p === `/api/companies/${CID}/activity`)
      return send(200, [
        { action: "issue.updated", createdAt: "2026-01-01T00:00:00Z" },
        { action: "agent.paused", createdAt: "2026-01-02T00:00:00Z" },
        { action: "issue.created", createdAt: "2026-01-03T00:00:00Z" },
      ]);
    if (p === "/api/agents/a2/pause") return send(200, { id: "a2", status: "paused" });
    if (p === "/api/agents/a1") return send(200, { id: "a1", status: agentStatus });
    if (p === "/api/agents/a1/wakeup") return (agentStatus = "idle", send(202, { queued: true }));
    if (p === "/api/agents/nope/pause") return send(404, { error: "Agent not found" });
    send(404, { error: "no route" });
  });
}

let paperclip: Server, bridge: Server, paperclipUrl: string, bridgeUrl: string;
const config = () => ({ apiUrl: `${paperclipUrl}/api`, apiKey: "board-token", companyId: CID, readOnly: false, timeoutMs: 5000 });

beforeAll(async () => {
  paperclip = mockPaperclip();
  await new Promise<void>((r) => paperclip.listen(0, "127.0.0.1", r));
  paperclipUrl = `http://127.0.0.1:${(paperclip.address() as AddressInfo).port}`;
  bridge = createHttpServer(config(), { host: "127.0.0.1", port: 0, bridgeToken: "secret", publicUrl: null, oauth: null }, { audit: () => {} });
  await new Promise<void>((r) => bridge.listen(0, "127.0.0.1", r));
  bridgeUrl = `http://127.0.0.1:${(bridge.address() as AddressInfo).port}`;
});
afterAll(() => {
  paperclip.close();
  bridge.close();
});

describe("tool execution", () => {
  const client = () => new PaperclipClient(config());

  it("sends the board token and resolves the default company", async () => {
    const out = await executeTool(client(), "paperclip_list_agents", {});
    expect(out.ok).toBe(true);
    expect(calls.at(-1)).toMatchObject({ method: "GET", url: `/api/companies/${CID}/agents`, auth: "Bearer board-token" });
  });

  it("controls agents via the documented endpoints", async () => {
    const out = await executeTool(client(), "paperclip_pause_agent", { agentId: "a2" });
    expect(out).toMatchObject({ ok: true, result: { status: "paused" } });
    expect(calls.at(-1)).toMatchObject({ method: "POST", url: "/api/agents/a2/pause" });
  });

  it("surfaces Paperclip errors with status", async () => {
    const out = await executeTool(client(), "paperclip_pause_agent", { agentId: "nope" });
    expect(out).toMatchObject({ ok: false, status: 404 });
  });

  it("refuses terminate without confirm=true and never calls Paperclip", async () => {
    const before = calls.length;
    const out = await executeTool(client(), "paperclip_terminate_agent", { agentId: "a1" });
    expect(out).toMatchObject({ ok: false, status: 400 });
    expect(calls.length).toBe(before);
  });

  it("read-only mode blocks writes and non-GET raw requests but allows reads", async () => {
    const ro = new PaperclipClient({ ...config(), readOnly: true });
    const before = calls.length;
    expect(await executeTool(ro, "paperclip_pause_agent", { agentId: "a2" })).toMatchObject({ ok: false, status: 403 });
    expect(await executeTool(ro, "paperclip_api_request", { method: "POST", path: "/x", confirm: true })).toMatchObject({ ok: false, status: 403 });
    expect(calls.length).toBe(before);
    expect(await executeTool(ro, "paperclip_api_request", { method: "GET", path: "/companies" })).toMatchObject({ ok: false, status: 404 }); // reached Paperclip
    expect((await executeTool(ro, "paperclip_list_agents", {})).ok).toBe(true);
  });

  it("raw API requires confirm for non-GET and rejects traversal", async () => {
    expect(await executeTool(client(), "paperclip_api_request", { method: "DELETE", path: "/agents/a1" })).toMatchObject({ ok: false, status: 400 });
    expect(await executeTool(client(), "paperclip_api_request", { method: "GET", path: "/../admin" })).toMatchObject({ ok: false });
  });

  it("sync_changes returns only entries after the cursor and advances it", async () => {
    const out: any = await executeTool(client(), "paperclip_sync_changes", { cursor: "2026-01-01T12:00:00Z" });
    expect(out.result.count).toBe(2);
    expect(out.result.cursor).toBe("2026-01-03T00:00:00Z");
    const next: any = await executeTool(client(), "paperclip_sync_changes", { cursor: out.result.cursor });
    expect(next.result.count).toBe(0);
    expect(next.result.cursor).toBe("2026-01-03T00:00:00Z");
  });

  it("wait_for_agent follows a woken agent to idle", async () => {
    agentStatus = "running";
    await executeTool(client(), "paperclip_wake_agent", { agentId: "a1" });
    const out: any = await executeTool(client(), "paperclip_wait_for_agent", { agentId: "a1", timeoutSeconds: 5, pollSeconds: 1 });
    expect(out.result).toMatchObject({ reached: true, status: "idle" });
  });

  it("builds the reports", async () => {
    const status: any = await executeTool(client(), "paperclip_report_status", {});
    expect(status.result.markdown).toContain("$12.34 of $100.00 (12.3%)");
    expect(status.result.data.pendingApprovals).toBe(1);
    expect(status.result.data.attention).toEqual([{ id: "a2", name: "Dev", status: "paused" }]);
    const perf: any = await executeTool(client(), "paperclip_report_agent_performance", {});
    expect(perf.result.data.agents[0]).toMatchObject({ name: "CEO", done: 2, costPerDoneCents: 500 });
    const cost: any = await executeTool(client(), "paperclip_report_costs", {});
    expect(cost.result.markdown).toContain("CEO");
    const act: any = await executeTool(client(), "paperclip_report_activity", { since: "2026-01-02T00:00:00Z" });
    expect(act.result.data.count).toBe(2);
  });
});

describe("HTTP surface", () => {
  const auth = { Authorization: "Bearer secret", "Content-Type": "application/json" };

  it("rejects unauthenticated and wrongly-authenticated callers", async () => {
    expect((await fetch(`${bridgeUrl}/actions/paperclip_list_agents`, { method: "POST", body: "{}" })).status).toBe(401);
    expect((await fetch(`${bridgeUrl}/actions/paperclip_list_agents`, { method: "POST", headers: { Authorization: "Bearer nope" }, body: "{}" })).status).toBe(401);
    expect((await fetch(`${bridgeUrl}/mcp`, { method: "POST", body: "{}" })).status).toBe(401);
  });

  it("serves a ChatGPT action", async () => {
    const res = await fetch(`${bridgeUrl}/actions/paperclip_list_agents`, { method: "POST", headers: auth, body: "{}" });
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(2);
    const bad = await fetch(`${bridgeUrl}/actions/paperclip_terminate_agent`, { method: "POST", headers: auth, body: JSON.stringify({ agentId: "a1" }) });
    expect(bad.status).toBe(400);
  });

  it("serves OpenAPI that satisfies ChatGPT Actions limits", async () => {
    const spec: any = await (await fetch(`${bridgeUrl}/openapi.json`)).json();
    expect(spec.openapi).toBe("3.1.0");
    expect(Object.keys(spec.paths)).toHaveLength(tools.length);
    expect(tools.length).toBeLessThanOrEqual(30); // ChatGPT Actions caps operations per GPT
    for (const p of Object.values<any>(spec.paths)) {
      expect(p.post.description.length).toBeLessThanOrEqual(300);
      expect(p.post.operationId).toMatch(/^[a-z_]+$/);
    }
    expect(spec.paths["/actions/paperclip_terminate_agent"].post["x-openai-isConsequential"]).toBe(true);
    expect(spec.paths["/actions/paperclip_list_agents"].post["x-openai-isConsequential"]).toBe(false);
    expect(buildOpenApi("https://x").servers[0].url).toBe("https://x");
  });

  it("speaks MCP over Streamable HTTP end to end", async () => {
    const client = new Client({ name: "test", version: "0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${bridgeUrl}/mcp`), { requestInit: { headers: { Authorization: "Bearer secret" } } }));
    const listed = await client.listTools();
    expect(listed.tools.map((t) => t.name)).toEqual(tools.map((t) => t.name));
    expect(listed.tools.find((t) => t.name === "paperclip_terminate_agent")?.annotations?.destructiveHint).toBe(true);
    const report: any = await client.callTool({ name: "paperclip_report_status", arguments: {} });
    expect(report.content[0].text).toContain("# Paperclip status");
    const err: any = await client.callTool({ name: "paperclip_pause_agent", arguments: { agentId: "nope" } });
    expect(err.isError).toBe(true);
    await client.close();
  });
});
