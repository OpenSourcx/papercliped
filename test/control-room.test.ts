import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generateSecretKey, hashSecretKey, normalizeSecretKey } from "../src/accounts/secret.js";
import { usernameKey } from "../src/accounts/username.js";
import type { BridgeConfig, OAuthConfig } from "../src/config.js";
import { ManageRoutes } from "../src/manage/routes.js";
import { sha256Hex } from "../src/oauth/crypto.js";
import { OAuthProvider } from "../src/oauth/provider.js";
import { MemoryStore, type Grant } from "../src/oauth/store.js";
import { createHttpServer } from "../src/server.js";
import { AuditRecorder } from "../src/telemetry/recorder.js";
import { tools } from "../src/tools.js";

// A fake Paperclip with two agents, three issues and a cost table, so we can see exactly what the bridge sends and returns.
const AGENTS = [{ id: "a1", name: "Alpha", role: "engineer", status: "idle" }, { id: "a2", name: "Beta", role: "designer", status: "idle" }];
const ISSUES: Record<string, { id: string; title: string; assigneeAgentId: string | null }> = {
  i1: { id: "i1", title: "Beta's task", assigneeAgentId: "a2" },
  i2: { id: "i2", title: "Alpha's task", assigneeAgentId: "a1" },
  i3: { id: "i3", title: "Nobody's task", assigneeAgentId: null },
};
const upstream: { method: string; path: string }[] = [];
const fakePaperclip = (async (input: any, init: any = {}) => {
  const u = new URL(typeof input === "string" ? input : input.toString());
  const path = u.pathname.replace(/^\/api/, "");
  const method = init.method ?? "GET";
  upstream.push({ method, path });
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
  if (path === "/companies") return json([{ id: "c1", name: "Co" }]);
  if (path === "/companies/c1/agents") return json(AGENTS);
  if (path === "/companies/c1/org") return json({ agents: AGENTS });
  if (path === "/companies/c1/costs/by-agent") return json(AGENTS.map((a, i) => ({ agentId: a.id, agentName: a.name, spendCents: 100 * (i + 1) })));
  const issue = /^\/issues\/(i\d)$/.exec(path);
  if (issue) return json(ISSUES[issue[1]]);
  const agent = /^\/agents\/(a\d)(\/pause)?$/.exec(path);
  if (agent) return json({ ...AGENTS.find((a) => a.id === agent[1]), status: agent[2] ? "paused" : "idle" });
  return json({});
}) as typeof fetch;

let server: Server, base: string, store: MemoryStore, provider: OAuthProvider, recorder: AuditRecorder;
const config: BridgeConfig = { apiUrl: "http://unused.invalid/api", apiKey: null, companyId: null, readOnly: false, timeoutMs: 1000 };
let n = 0;

async function account(name: string) {
  const secret = generateSecretKey();
  const id = `acct_${name}`;
  await store.createAccount({ id, username: name, usernameKey: usernameKey(name), secretHash: await hashSecretKey(normalizeSecretKey(secret)!), createdAt: Date.now(), lastLoginAt: null, disabled: false, anonymous: false, alias: null });
  const sealed = (provider as any).keyring.seal("board-key");
  await store.putLink({ accountId: id, instanceUrl: "https://paperclip.example.com", paperclipUserId: `u_${name}`, sealedCredential: sealed, createdAt: Date.now(), connectedAt: Date.now(), lastUsedAt: Date.now(), instanceLabel: "paperclip.example.com" });
  return { id, secret };
}
/** A connected AI app: a live grant with its own access token. */
async function session(accountId: string, scopes = ["paperclip:control"], app = "Claude"): Promise<{ grant: Grant; token: string }> {
  const g: Grant = { id: `pcb_g_${++n}_${Math.random().toString(36).slice(2, 8)}`, clientId: "c", clientName: app, userId: null, scopes, resource: "r", instanceUrl: null, sealedCredential: null, accountId, username: accountId, createdAt: Date.now(), lastUsedAt: Date.now(), revoked: false };
  await store.putGrant(g);
  const token = `pcb_at_${g.id}`;
  await store.putAccess(sha256Hex(token), { grantId: g.id, expiresAt: Date.now() + 3600_000, consumed: false });
  return { grant: g, token };
}
const http = (method: string, path: string, body: unknown, token: string) =>
  fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
const tool = async (token: string, name: string, input: Record<string, unknown> = {}) => {
  const res = await http("POST", `/actions/${name}`, input, token);
  return { status: res.status, body: (await res.json()) as any };
};
/** The plugin's credential for the manage API. */
async function pluginToken(a: { id: string }) {
  const acct = (await store.getAccount(a.id))!;
  return (await provider.manageLinkPlugin(acct, { instanceHost: "paperclip.example.com", paperclipUserId: "u_1" })).token;
}
const reached = (method: string, path: string) => upstream.some((u) => u.method === method && u.path === path);

beforeAll(async () => {
  store = new MemoryStore();
  recorder = new AuditRecorder(store, { node: "test", flushMs: 60_000 });
  const oauth: OAuthConfig = {
    issuer: "http://localhost:1", secret: "s".repeat(40), previousSecrets: [], mode: "multi", accounts: true, login: "paperclip", dataFile: null, database: null,
    paperclipPublicUrl: null, accessTtlSec: 3600, refreshTtlSec: 86400 * 40, idleRevokeDays: 30, callsPerMinute: 1200, redirectHosts: ["claude.ai"], proxyHops: 0,
    instance: { allowedPorts: [443], denyHosts: ["localhost"], allowHosts: null },
  };
  provider = new OAuthProvider({ config, oauth, bridgeToken: null, store, safeFetch: fakePaperclip });
  server = createHttpServer(config, { host: "127.0.0.1", port: 0, bridgeToken: null, publicUrl: oauth.issuer, oauth } as any, { oauth: provider, manage: new ManageRoutes(provider), recorder });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());
beforeEach(() => void (upstream.length = 0));

describe("with no settings, nothing changes: Full for every agent and every session", () => {
  it("lets every kind of call through", async () => {
    const a = await account("default.user1");
    const { token } = await session(a.id);
    expect((await tool(token, "paperclip_list_agents", { companyId: "c1" })).body).toHaveLength(2);
    expect((await tool(token, "paperclip_pause_agent", { agentId: "a1" })).status).toBe(200);
    expect((await tool(token, "paperclip_create_issue", { companyId: "c1", title: "t", assigneeAgentId: "a1" })).status).toBe(200);
    expect(reached("POST", "/agents/a1/pause")).toBe(true);
  });
});

describe("the access switch", () => {
  it("Agent only: agents and reads work, direct control is refused before anything reaches Paperclip", async () => {
    const a = await account("switch.user1");
    const { token } = await session(a.id);
    const plugin = await pluginToken(a);
    expect((await http("POST", "/api/manage/policy", { mode: "agent" }, plugin)).status).toBe(200);
    const pause = await tool(token, "paperclip_pause_agent", { agentId: "a1" });
    expect(pause.status).toBe(403);
    expect(pause.body.error).toMatchObject({ policy: "mode_blocks" });
    expect(pause.body.error.message).toMatch(/Agent only/);
    expect(reached("POST", "/agents/a1/pause")).toBe(false); // never sent
    expect((await tool(token, "paperclip_create_issue", { companyId: "c1", title: "t", assigneeAgentId: "a1" })).status).toBe(200);
    expect((await tool(token, "paperclip_list_agents", { companyId: "c1" })).status).toBe(200);
    expect((await tool(token, "paperclip_api_request", { method: "POST", path: "/x", confirm: true })).status).toBe(403);
  });

  it("API only: control works, handing work to agents is refused", async () => {
    const a = await account("switch.user2");
    const { token } = await session(a.id);
    await http("POST", "/api/manage/policy", { mode: "api" }, await pluginToken(a));
    expect((await tool(token, "paperclip_pause_agent", { agentId: "a1" })).status).toBe(200);
    expect((await tool(token, "paperclip_create_issue", { companyId: "c1", title: "t", assigneeAgentId: "a1" })).body.error.policy).toBe("mode_blocks");
    expect((await tool(token, "paperclip_wake_agent", { agentId: "a1" })).status).toBe(403);
  });

  it("takes effect on the very next call, and switching back to Full restores everything", async () => {
    const a = await account("switch.user3");
    const { token } = await session(a.id);
    const plugin = await pluginToken(a);
    await http("POST", "/api/manage/policy", { mode: "agent" }, plugin);
    expect((await tool(token, "paperclip_resume_agent", { agentId: "a1" })).status).toBe(403);
    await http("POST", "/api/manage/policy", { mode: "full" }, plugin);
    expect((await tool(token, "paperclip_resume_agent", { agentId: "a1" })).status).toBe(200);
  });

  it("an agent set to Off disappears from lists and reports, and cannot be touched", async () => {
    const a = await account("switch.user4");
    const { token } = await session(a.id);
    await http("POST", "/api/manage/policy", { mode: "full", agents: { a2: "off" } }, await pluginToken(a));
    const list = (await tool(token, "paperclip_list_agents", { companyId: "c1" })).body;
    expect(list.map((x: any) => x.id)).toEqual(["a1"]);
    expect(JSON.stringify((await tool(token, "paperclip_org_chart", { companyId: "c1" })).body)).not.toContain("Beta");
    const costs = (await tool(token, "paperclip_report_costs", { companyId: "c1" })).body;
    expect(JSON.stringify(costs)).not.toContain("Beta");
    expect(JSON.stringify(costs)).toContain("Alpha");
    expect((await tool(token, "paperclip_get_agent", { agentId: "a2" })).body.error.policy).toBe("agent_off");
    expect((await tool(token, "paperclip_pause_agent", { agentId: "a2" })).status).toBe(403);
    expect(reached("POST", "/agents/a2/pause")).toBe(false);
    expect((await tool(token, "paperclip_pause_agent", { agentId: "a1" })).status).toBe(200);
  });

  it("an issue assigned to an Off agent is out of reach, one assigned to anyone else is not", async () => {
    const a = await account("switch.user5");
    const { token } = await session(a.id);
    await http("POST", "/api/manage/policy", { agents: { a2: "off" } }, await pluginToken(a));
    expect((await tool(token, "paperclip_get_issue", { issueId: "i1" })).body.error.policy).toBe("agent_off");
    expect((await tool(token, "paperclip_comment_issue", { issueId: "i1", body: "hi" })).status).toBe(403);
    expect((await tool(token, "paperclip_get_issue", { issueId: "i2" })).status).toBe(200);
    expect((await tool(token, "paperclip_get_issue", { issueId: "i3" })).status).toBe(200);
  });

  it("is one account's setting: another account is unaffected", async () => {
    const a = await account("switch.user6");
    const b = await account("switch.user7");
    await http("POST", "/api/manage/policy", { mode: "agent", agents: { a1: "off" } }, await pluginToken(a));
    const { token } = await session(b.id);
    expect((await tool(token, "paperclip_pause_agent", { agentId: "a1" })).status).toBe(200);
  });
});

describe("one session's limits", () => {
  it("a tool list: the others are refused and not shown to the AI", async () => {
    const a = await account("sess.user1");
    const s = await session(a.id);
    const plugin = await pluginToken(a);
    const set = await http("POST", `/api/manage/sessions/${s.grant.id}`, { label: "Read agents", tools: ["paperclip_list_agents"] }, plugin);
    expect(set.status).toBe(200);
    expect((await tool(s.token, "paperclip_list_agents", { companyId: "c1" })).status).toBe(200);
    const no = await tool(s.token, "paperclip_pause_agent", { agentId: "a1" });
    expect(no.status).toBe(403);
    expect(no.body.error.policy).toBe("tool_not_allowed");
    // the MCP server advertises only the allowed tool
    const mcp = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${s.token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    const text = await mcp.text();
    expect(text).toContain("paperclip_list_agents");
    expect(text).not.toContain("paperclip_pause_agent");
  });

  it("selected agents: only those are listed and touched, and whole-company views are refused", async () => {
    const a = await account("sess.user2");
    const s = await session(a.id);
    const other = await session(a.id, ["paperclip:control"], "ChatGPT");
    await http("POST", `/api/manage/sessions/${s.grant.id}`, { agents: ["a1"] }, await pluginToken(a));
    expect((await tool(s.token, "paperclip_list_agents", { companyId: "c1" })).body.map((x: any) => x.id)).toEqual(["a1"]);
    expect((await tool(s.token, "paperclip_pause_agent", { agentId: "a1" })).status).toBe(200);
    expect((await tool(s.token, "paperclip_pause_agent", { agentId: "a2" })).body.error.policy).toBe("agent_not_in_session");
    expect((await tool(s.token, "paperclip_org_chart", { companyId: "c1" })).body.error.policy).toBe("needs_all_agents");
    expect((await tool(s.token, "paperclip_get_issue", { issueId: "i1" })).body.error.policy).toBe("agent_not_in_session"); // Beta's issue
    expect((await tool(s.token, "paperclip_get_issue", { issueId: "i2" })).status).toBe(200); // Alpha's issue
    expect((await tool(s.token, "paperclip_get_issue", { issueId: "i3" })).body.error.policy).toBe("needs_all_agents"); // unassigned: can't tell whose
    // another session of the same account is not limited
    expect((await tool(other.token, "paperclip_pause_agent", { agentId: "a2" })).status).toBe(200);
  });

  it("the access level still applies: Read only stays read only whatever the tool list says", async () => {
    const a = await account("sess.user3");
    const s = await session(a.id, ["paperclip:read"]);
    await http("POST", `/api/manage/sessions/${s.grant.id}`, { tools: ["paperclip_pause_agent", "paperclip_list_agents"] }, await pluginToken(a));
    const r = await tool(s.token, "paperclip_pause_agent", { agentId: "a1" });
    expect(r.status).toBe(403);
    expect(r.body.error).toHaveProperty("insufficient_scope");
  });

  it("changing the level in the same request works", async () => {
    const a = await account("sess.user4");
    const s = await session(a.id, ["paperclip:read"]);
    expect((await tool(s.token, "paperclip_pause_agent", { agentId: "a1" })).status).toBe(403);
    expect((await http("POST", `/api/manage/sessions/${s.grant.id}`, { level: "control" }, await pluginToken(a))).status).toBe(200);
    expect((await tool(s.token, "paperclip_pause_agent", { agentId: "a1" })).status).toBe(200);
  });
});

describe("the management API", () => {
  it("lists sessions with their names, tools and agents", async () => {
    const a = await account("mgmt.user1");
    const s = await session(a.id, ["paperclip:control"], "Claude");
    const plugin = await pluginToken(a);
    await http("POST", `/api/manage/sessions/${s.grant.id}`, { label: "Work laptop", tools: ["paperclip_list_agents"], agents: ["a1"] }, plugin);
    const list = ((await (await http("GET", "/api/manage/sessions", undefined, plugin)).json()) as any).sessions;
    expect(list).toEqual([expect.objectContaining({ id: s.grant.id, app: "Claude", label: "Work laptop", level: "paperclip:control", tools: ["paperclip_list_agents"], agents: ["a1"] })]);
    // the old endpoint still answers, with the new fields
    expect(((await (await http("GET", "/api/manage/connections", undefined, plugin)).json()) as any).connections[0]).toHaveProperty("label", "Work laptop");
  });

  it("refuses bad input with a reason, and nothing is saved", async () => {
    const a = await account("mgmt.user2");
    const s = await session(a.id);
    const plugin = await pluginToken(a);
    for (const bad of [{ tools: ["rm_rf"] }, { tools: [] }, { agents: [] }, { label: 5 }, { level: "admin" }]) {
      expect((await http("POST", `/api/manage/sessions/${s.grant.id}`, bad, plugin)).status, JSON.stringify(bad)).toBe(400);
    }
    for (const bad of [{ mode: "everything" }, { agents: { a1: "maybe" } }, { agents: [1] }]) {
      expect((await http("POST", "/api/manage/policy", bad, plugin)).status, JSON.stringify(bad)).toBe(400);
    }
    const list = ((await (await http("GET", "/api/manage/sessions", undefined, plugin)).json()) as any).sessions;
    expect(list[0]).toMatchObject({ label: null, tools: null, agents: null });
    expect(await (await http("GET", "/api/manage/policy", undefined, plugin)).json()).toEqual({ mode: "full", agents: {} });
  });

  it("only touches the account's own sessions", async () => {
    const a = await account("mgmt.user3");
    const b = await account("mgmt.user4");
    const theirs = await session(b.id);
    const plugin = await pluginToken(a);
    expect((await http("POST", `/api/manage/sessions/${theirs.grant.id}`, { label: "mine now" }, plugin)).status).toBe(404);
    expect((await http("DELETE", `/api/manage/sessions/${theirs.grant.id}`, undefined, plugin)).status).toBe(404);
    expect((await store.getGrant(theirs.grant.id))?.policy ?? null).toBeNull();
    expect((await tool(theirs.token, "paperclip_list_agents", { companyId: "c1" })).status).toBe(200);
  });

  it("disconnecting a session ends it", async () => {
    const a = await account("mgmt.user5");
    const s = await session(a.id);
    expect((await http("DELETE", `/api/manage/sessions/${s.grant.id}`, undefined, await pluginToken(a))).status).toBe(200);
    expect((await tool(s.token, "paperclip_list_agents", { companyId: "c1" })).status).toBe(401);
  });

  it("lists every tool with what it does and which surface it is on", async () => {
    const a = await account("mgmt.user6");
    const list = ((await (await http("GET", "/api/manage/tools", undefined, await pluginToken(a))).json()) as any).tools as any[];
    expect(list).toHaveLength(tools.length);
    expect(list.find((t) => t.name === "paperclip_pause_agent")).toMatchObject({ surface: "api", access: "write" });
    expect(list.find((t) => t.name === "paperclip_create_issue")).toMatchObject({ surface: "agent" });
    expect(list.find((t) => t.name === "paperclip_list_agents")).toMatchObject({ surface: "read", access: "read" });
  });

  it("the activity shows calls by session, including the ones that were blocked, and never what was sent", async () => {
    const a = await account("mgmt.user7");
    const s = await session(a.id, ["paperclip:control"], "ChatGPT");
    const plugin = await pluginToken(a);
    await http("POST", "/api/manage/policy", { mode: "agent" }, plugin);
    await tool(s.token, "paperclip_list_agents", { companyId: "c1" });
    await tool(s.token, "paperclip_pause_agent", { agentId: "a1" });
    await recorder.flush();
    const calls = ((await (await http("GET", "/api/manage/activity?limit=20", undefined, plugin)).json()) as any).calls as any[];
    expect(calls.map((c) => [c.tool, c.ok, c.blocked])).toEqual([["paperclip_pause_agent", false, true], ["paperclip_list_agents", true, false]]);
    expect(calls[0]).toMatchObject({ app: "ChatGPT", session: s.grant.id, error: "policy_blocked", status: 403 });
    expect(JSON.stringify(calls)).not.toMatch(/a1|companyId|c1/);
    // one session only, and a malformed filter is refused
    expect(((await (await http("GET", `/api/manage/activity?session=${s.grant.id}`, undefined, plugin)).json()) as any).calls).toHaveLength(2);
    expect((await http("GET", "/api/manage/activity?session=bad%20id", undefined, plugin)).status).toBe(400);
    // another account sees none of it
    const b = await account("mgmt.user8");
    expect(((await (await http("GET", "/api/manage/activity", undefined, await pluginToken(b))).json()) as any).calls).toEqual([]);
  });

  it("every new endpoint needs a plugin token", async () => {
    for (const [m, p] of [["GET", "/sessions"], ["GET", "/policy"], ["POST", "/policy"], ["GET", "/tools"], ["GET", "/activity"], ["POST", "/sessions/pcb_g_x"]] as const) {
      expect((await fetch(`${base}/api/manage${p}`, { method: m })).status, `${m} ${p}`).toBe(401);
    }
  });
});
