import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { readOAuthConfig, type BridgeConfig, type OAuthConfig } from "../src/config.js";
import type { AuditEvent } from "../src/execute.js";
import { OAuthProvider } from "../src/oauth/provider.js";
import { OAuthStore } from "../src/oauth/store.js";
import { SCOPES, requiredScope, scopeAllows } from "../src/oauth/scopes.js";
import { createHttpServer } from "../src/server.js";
import { tools } from "../src/tools.js";

const CID = "11111111-1111-1111-1111-111111111111";
const CLAUDE_CB = "https://claude.ai/api/mcp/auth_callback";

// ───────────── mock Paperclip incl. CLI-auth challenge API ─────────────
let challengeSeq = 0;
const challenges = new Map<string, { secret: string; token: string; status: string }>();
const seenAuth: (string | undefined)[] = [];
const revoked: string[] = [];
const challengeNames: string[] = [];
const paused: string[] = [];
// Board keys: what the key listing says about the sign-in key, and the keys made through /board-api-keys.
const KEY_ID = "00000000-0000-4000-9000-000000000001";
const keyState = { expiresAt: null as number | null, now: 0, posts: [] as { auth?: string; name: string }[] };

function mockPaperclip(): Server {
  return createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    const send = (s: number, b: unknown) => (res.writeHead(s, { "Content-Type": "application/json" }), res.end(JSON.stringify(b)));
    const u = new URL(req.url!, "http://x");
    const p = u.pathname;
    const auth = req.headers.authorization;
    if (p === "/api/cli-auth/challenges" && req.method === "POST") {
      const id = `00000000-0000-4000-8000-${String(++challengeSeq).padStart(12, "0")}`;
      challengeNames.push(JSON.parse(raw).clientName);
      const ch = { secret: `secret-${challengeSeq}`, token: `board-tok-${challengeSeq}`, status: "pending" };
      challenges.set(id, ch);
      return send(201, { id, token: ch.secret, boardApiToken: ch.token, approvalPath: `/cli-auth/${id}?token=${ch.secret}`, approvalUrl: null, pollPath: `/cli-auth/challenges/${id}`, expiresAt: new Date(Date.now() + 600_000).toISOString() });
    }
    const m = /^\/api\/cli-auth\/challenges\/([^/]+)$/.exec(p);
    if (m && req.method === "GET") {
      const ch = challenges.get(m[1]);
      if (!ch || u.searchParams.get("token") !== ch.secret) return send(404, { error: "not found" });
      return send(200, { status: ch.status });
    }
    if (p === "/api/cli-auth/me") {
      const ch = [...challenges.values()].find((c) => `Bearer ${c.token}` === auth && c.status === "approved");
      return ch ? send(200, { userId: `uid-${ch.token.replace("board-tok-", "")}`, keyId: KEY_ID }) : send(401, { error: "Board authentication required" });
    }
    if (p === "/api/board-api-keys" && req.method === "GET") return send(200, [{ id: KEY_ID, name: "cli", expiresAt: keyState.expiresAt === null ? null : new Date(keyState.expiresAt).toISOString() }]);
    if (p === "/api/board-api-keys" && req.method === "POST") {
      keyState.posts.push({ auth, name: JSON.parse(raw).name });
      return send(201, { id: "00000000-0000-4000-9000-000000000002", name: "x", token: `pcp_board_rotated_${keyState.posts.length}`, expiresAt: new Date(keyState.now + 30 * 86_400_000).toISOString() });
    }
    if (p === "/api/cli-auth/revoke-current") return (revoked.push(auth ?? ""), send(200, { revoked: true }));
    seenAuth.push(auth);
    if (p === `/api/companies/${CID}/agents`) return send(200, [{ id: "a1", name: "CEO", status: "running" }]);
    if (p === `/api/companies/${CID}/dashboard`) return send(200, { agents: {}, tasks: {}, costs: {}, budgets: {} });
    if (p === `/api/companies/${CID}/approvals`) return send(200, []);
    if (p === "/api/agents/a1/pause") return (paused.push(auth ?? ""), send(200, { id: "a1", status: "paused" }));
    if (p === "/api/agents/a1/terminate") return send(200, { terminated: true });
    send(404, { error: "no route" });
  });
}

// ───────────── harness ─────────────
let paperclip: Server;
let paperclipUrl: string;
const approve = (token: string) => {
  for (const c of challenges.values()) if (c.token === token) c.status = "approved";
};
const approveLatest = () => approve(`board-tok-${challengeSeq}`);

const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};

interface Rig {
  base: string;
  server: Server;
  clock: { t: number };
  audit: AuditEvent[];
  provider: OAuthProvider;
  oauth: OAuthConfig;
  close: () => void;
}

async function rig(over: Partial<OAuthConfig> = {}, extra: { dataFile?: string; bridgeToken?: string | null; apiKey?: string | null } = {}): Promise<Rig> {
  const clock = { t: 1_800_000_000_000 };
  const audit: AuditEvent[] = [];
  const config: BridgeConfig = { apiUrl: `${paperclipUrl}/api`, apiKey: extra.apiKey ?? null, companyId: CID, readOnly: false, timeoutMs: 5000 };
  // Port is unknown until listen(); issuer must be known up front, so listen on a fixed free port first.
  const probe = createServer();
  await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>((r) => probe.close(() => r()));
  const oauth: OAuthConfig = {
    issuer: `http://localhost:${port}`,
    secret: "s".repeat(40),
    login: "paperclip",
    dataFile: extra.dataFile ?? null,
    paperclipPublicUrl: "https://paperclip.example",
    accessTtlSec: 3600,
    refreshTtlSec: 86400,
    redirectHosts: ["claude.ai", "chatgpt.com"],
    previousSecrets: [],
    mode: "single",
    accounts: false,
    database: null,
    idleRevokeDays: 30,
    callsPerMinute: 120,
    proxyHops: 0,
    instance: { allowedPorts: [443], denyHosts: [], allowHosts: null },
    ...over,
  };
  const bridgeToken = extra.bridgeToken === undefined ? "static-secret" : extra.bridgeToken;
  const provider = new OAuthProvider({ config, oauth, bridgeToken, now: () => clock.t, rotationGraceMs: 0 });
  const server = createHttpServer(config, { host: "127.0.0.1", port, bridgeToken, publicUrl: oauth.issuer, oauth }, { oauth: provider, audit: (e) => audit.push(e) });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  return { base: oauth.issuer, server, clock, audit, provider, oauth, close: () => server.close() };
}

const form = (o: Record<string, string>) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString(), redirect: "manual" as const });

async function register(r: Rig, redirect = CLAUDE_CB, name = "Claude") {
  const res = await fetch(`${r.base}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redirect_uris: [redirect], client_name: name, token_endpoint_auth_method: "none" }) });
  return { res, body: (await res.json()) as any };
}

/** Drive authorize → (approve in Paperclip) → decision → code. Returns everything a test may want to tamper with. */
async function authorizeFlow(r: Rig, clientId: string, o: { redirect?: string; scope?: string; level?: string; approveIt?: boolean; state?: string; challenge?: string; action?: string } = {}) {
  const { verifier, challenge } = pkce();
  const redirect = o.redirect ?? CLAUDE_CB;
  const q = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirect, code_challenge: o.challenge ?? challenge, code_challenge_method: "S256", state: o.state ?? "st-123", scope: o.scope ?? "paperclip:read paperclip:control", resource: `${r.base}/mcp` });
  const page = await fetch(`${r.base}/authorize?${q}`, { redirect: "manual" });
  const html = await page.text();
  const rid = /name="rid" value="([^"]+)"/.exec(html)?.[1];
  const csrf = /name="csrf" value="([^"]+)"/.exec(html)?.[1];
  if (o.approveIt !== false) approveLatest();
  if (!rid || !csrf) return { page, html, verifier, redirect };
  const dec = await fetch(`${r.base}/authorize/decision`, form({ rid, csrf, action: o.action ?? "allow", level: o.level ?? "paperclip:control" }));
  const loc = dec.headers.get("location");
  const target = loc ? new URL(loc) : null;
  return { page, html, rid, csrf, dec, decHtml: loc ? "" : await dec.text(), loc: target, code: target?.searchParams.get("code") ?? undefined, verifier, redirect };
}

const tokenReq = (r: Rig, o: Record<string, string>) => fetch(`${r.base}/token`, form(o));

async function connect(r: Rig, level = "paperclip:control", client = "c") {
  const reg = await register(r, CLAUDE_CB, client);
  const f = await authorizeFlow(r, reg.body.client_id, { level, scope: level });
  const tok = await tokenReq(r, { grant_type: "authorization_code", code: f.code!, redirect_uri: CLAUDE_CB, code_verifier: f.verifier, client_id: reg.body.client_id });
  return { reg: reg.body, tokens: (await tok.json()) as any, clientId: reg.body.client_id as string };
}

const act = (r: Rig, token: string, tool: string, body: unknown = {}) => fetch(`${r.base}/actions/${tool}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeAll(async () => {
  paperclip = mockPaperclip();
  await new Promise<void>((r) => paperclip.listen(0, "127.0.0.1", r));
  paperclipUrl = `http://127.0.0.1:${(paperclip.address() as AddressInfo).port}`;
});
afterAll(() => paperclip.close());

// ───────────── tests ─────────────
describe("discovery", () => {
  it("answers unauthenticated /mcp with a 401 pointing at protected-resource metadata", async () => {
    const r = await rig();
    const res = await fetch(`${r.base}/mcp`, { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain(`resource_metadata="${r.base}/.well-known/oauth-protected-resource"`);
    const prm: any = await (await fetch(`${r.base}/.well-known/oauth-protected-resource`)).json();
    expect(prm).toMatchObject({ resource: `${r.base}/mcp`, authorization_servers: [r.base] });
    const prm2: any = await (await fetch(`${r.base}/.well-known/oauth-protected-resource/mcp`)).json();
    expect(prm2.resource).toBe(`${r.base}/mcp`);
    const as: any = await (await fetch(`${r.base}/.well-known/oauth-authorization-server`)).json();
    expect(as).toMatchObject({ issuer: r.base, code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"], registration_endpoint: `${r.base}/register` });
    expect(as.scopes_supported).toContain("offline_access");
    r.close();
  });

  it("marks a bad token as invalid_token", async () => {
    const r = await rig();
    const res = await fetch(`${r.base}/mcp`, { method: "POST", headers: { Authorization: "Bearer pcb_at_bogus" }, body: "{}" });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain('error="invalid_token"');
    r.close();
  });
});

describe("dynamic client registration", () => {
  it("accepts allowed hosts and loopback, rejects everything else", async () => {
    const r = await rig();
    expect((await register(r, CLAUDE_CB)).res.status).toBe(201);
    expect((await register(r, "http://localhost:53124/callback")).res.status).toBe(201);
    for (const bad of ["http://evil.example/cb", "https://evil.example/cb", `${CLAUDE_CB}#frag`, "javascript:alert(1)", "https://user:pw@claude.ai/cb", "not a uri"]) {
      const { res, body } = await register(r, bad);
      expect(res.status, bad).toBe(400);
      expect(body.error).toBe("invalid_redirect_uri");
    }
    const conf = await fetch(`${r.base}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redirect_uris: [CLAUDE_CB], token_endpoint_auth_method: "client_secret_basic" }) });
    expect((await conf.json() as any).error).toBe("invalid_client_metadata");
    r.close();
  });

  it("wildcard host setting allows any https host", async () => {
    const r = await rig({ redirectHosts: ["*"] });
    expect((await register(r, "https://anything.example/cb")).res.status).toBe(201);
    r.close();
  });
});

describe("authorization code + PKCE flow", () => {
  it("runs end to end, uses the user's Paperclip credential (never the bridge token), and scopes tools", async () => {
    const r = await rig();
    const reg = (await register(r, CLAUDE_CB, "<script>alert(1)</script>")).body;
    const f = await authorizeFlow(r, reg.client_id, { approveIt: false, scope: "paperclip:read paperclip:control", state: "xyz" });
    // consent page: escaped name, sign-in link, redirect host, no script injection
    expect(f.html).not.toContain("<script>alert(1)");
    expect(f.html).toContain("&lt;script&gt;alert(1)");
    expect(f.html).toContain("https://paperclip.example/cli-auth/");
    expect(f.html).toContain("claude.ai");
    expect(challengeNames.at(-1)).toContain("returns to claude.ai");
    expect(f.page.headers.get("content-security-policy")).toMatch(/frame-ancestors 'none'/);
    expect(f.page.headers.get("x-frame-options")).toBe("DENY");
    // pressing Allow before approving in Paperclip is refused
    expect(f.dec!.status).toBe(400);
    expect(f.decHtml).toContain("Not approved in Paperclip yet");

    // now approve and retry through a fresh request
    const f2 = await authorizeFlow(r, reg.client_id, { scope: "paperclip:read paperclip:control", state: "xyz" });
    expect(f2.dec!.status).toBe(302);
    expect(f2.loc!.origin + f2.loc!.pathname).toBe(CLAUDE_CB);
    expect(f2.loc!.searchParams.get("state")).toBe("xyz");
    expect(f2.loc!.searchParams.get("iss")).toBe(r.base);

    const tok = await tokenReq(r, { grant_type: "authorization_code", code: f2.code!, redirect_uri: CLAUDE_CB, code_verifier: f2.verifier, client_id: reg.client_id });
    expect(tok.status).toBe(200);
    expect(tok.headers.get("cache-control")).toBe("no-store");
    const t: any = await tok.json();
    expect(t).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "paperclip:read paperclip:control" });
    expect(t.access_token).toMatch(/^pcb_at_/);

    // call through the bridge: Paperclip must see THIS user's board token
    seenAuth.length = 0;
    const res = await act(r, t.access_token, "paperclip_list_agents");
    expect(res.status).toBe(200);
    expect(seenAuth.at(-1)).toBe(`Bearer board-tok-${challengeSeq}`);
    expect(seenAuth.at(-1)).not.toContain("static-secret");

    // Full control is every tool: pause, terminate, approvals and raw writes all pass the scope check (the fake Paperclip may 404 them)
    expect((await act(r, t.access_token, "paperclip_pause_agent", { agentId: "a1" })).status).toBe(200);
    expect((await act(r, t.access_token, "paperclip_terminate_agent", { agentId: "a1", confirm: true })).status).not.toBe(403);
    expect((await act(r, t.access_token, "paperclip_decide_approval", { approvalId: "x", decision: "approve" })).status).not.toBe(403);
    expect((await act(r, t.access_token, "paperclip_api_request", { method: "POST", path: "/x", confirm: true })).status).not.toBe(403);

    // audit trail names the grant and client, never a token
    const ev = r.audit.filter((e) => e.tool === "paperclip_pause_agent").at(-1)!;
    expect(ev).toMatchObject({ ok: true, mutation: true, client: "<script>alert(1)</script>", userId: `uid-${challengeSeq}` });
    expect(JSON.stringify(r.audit)).not.toMatch(/board-tok|pcb_at_/);
    r.close();
  });

  it("MCP clients only see tools within their scope", async () => {
    const r = await rig();
    const { tokens } = await connect(r, "paperclip:read");
    const mcp = new Client({ name: "t", version: "0" });
    await mcp.connect(new StreamableHTTPClientTransport(new URL(`${r.base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } } }));
    const names = (await mcp.listTools()).tools.map((t) => t.name);
    expect(names).toContain("paperclip_report_status");
    expect(names).toContain("paperclip_api_request");
    expect(names).not.toContain("paperclip_pause_agent");
    expect(names).not.toContain("paperclip_terminate_agent");
    const denied: any = await mcp.callTool({ name: "paperclip_pause_agent", arguments: { agentId: "a1" } }).catch((e) => ({ isError: true, content: [{ text: String(e) }] }));
    expect(denied.isError).toBe(true);
    await mcp.close();
    r.close();
  });

  it("offers exactly two levels, preselects what the app asked for, and treats the old admin scope as Full control", async () => {
    const r = await rig();
    const reg = (await register(r)).body;
    const f = await authorizeFlow(r, reg.client_id, { scope: "paperclip:read", approveIt: false });
    expect(f.html).toMatch(/value="paperclip:read" checked/);
    expect(f.html).toContain('value="paperclip:control"');
    expect(f.html).not.toContain("paperclip:admin");
    const g = await authorizeFlow(r, reg.client_id, { scope: "paperclip:admin", approveIt: false });
    expect(g.html).toMatch(/value="paperclip:control" checked/);
    expect(g.html).not.toContain("paperclip:admin");
    // a level that doesn't exist is rejected
    approveLatest();
    const h = await authorizeFlow(r, reg.client_id, { scope: "paperclip:read", level: "paperclip:admin" });
    expect(h.dec!.status).toBe(400);
    expect(h.decHtml).toContain("Choose an access level");
    r.close();
  });

  it("rejects wrong PKCE verifier, wrong redirect_uri and wrong client_id", async () => {
    const r = await rig();
    const reg = (await register(r)).body;
    const other = (await register(r)).body;
    for (const [label, mutate] of [
      ["verifier", (f: any) => ({ code_verifier: randomBytes(32).toString("base64url") })],
      ["redirect", () => ({ redirect_uri: "https://claude.ai/other" })],
      ["client", () => ({ client_id: other.client_id })],
      ["short verifier", () => ({ code_verifier: "short" })],
    ] as const) {
      const f = await authorizeFlow(r, reg.client_id);
      const res = await tokenReq(r, { grant_type: "authorization_code", code: f.code!, redirect_uri: CLAUDE_CB, code_verifier: f.verifier, client_id: reg.client_id, ...mutate(f) });
      expect(res.status, label).toBe(400);
      expect(((await res.json()) as any).error, label).toBe("invalid_grant");
    }
    r.close();
  });

  it("an authorization code is single-use; replay revokes the tokens it produced", async () => {
    const r = await rig();
    const reg = (await register(r)).body;
    const f = await authorizeFlow(r, reg.client_id);
    const body = { grant_type: "authorization_code", code: f.code!, redirect_uri: CLAUDE_CB, code_verifier: f.verifier, client_id: reg.client_id };
    const first: any = await (await tokenReq(r, body)).json();
    expect((await act(r, first.access_token, "paperclip_list_agents")).status).toBe(200);
    const replay = await tokenReq(r, body);
    expect(replay.status).toBe(400);
    expect(((await replay.json()) as any).error).toBe("invalid_grant");
    expect((await act(r, first.access_token, "paperclip_list_agents")).status).toBe(401);
    r.close();
  });

  it("codes expire after 60 seconds", async () => {
    const r = await rig();
    const reg = (await register(r)).body;
    const f = await authorizeFlow(r, reg.client_id);
    r.clock.t += 61_000;
    const res = await tokenReq(r, { grant_type: "authorization_code", code: f.code!, redirect_uri: CLAUDE_CB, code_verifier: f.verifier, client_id: reg.client_id });
    expect(((await res.json()) as any).error).toBe("invalid_grant");
    r.close();
  });
});

describe("authorize request validation", () => {
  it("never redirects to an unregistered redirect_uri (shows an error page instead)", async () => {
    const r = await rig();
    const reg = (await register(r)).body;
    const { challenge } = pkce();
    const q = new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: "https://claude.ai/steal", code_challenge: challenge, code_challenge_method: "S256" });
    const res = await fetch(`${r.base}/authorize?${q}`, { redirect: "manual" });
    expect(res.status).toBe(400);
    expect(res.headers.get("location")).toBeNull();
    const unknown = await fetch(`${r.base}/authorize?${new URLSearchParams({ client_id: "nope", redirect_uri: CLAUDE_CB })}`, { redirect: "manual" });
    expect(unknown.status).toBe(400);
    r.close();
  });

  it("requires PKCE S256 and a matching resource; errors go back to the client with state", async () => {
    const r = await rig();
    const reg = (await register(r)).body;
    const { challenge } = pkce();
    const base = { response_type: "code", client_id: reg.client_id, redirect_uri: CLAUDE_CB, state: "s1" };
    const noPkce = await fetch(`${r.base}/authorize?${new URLSearchParams(base)}`, { redirect: "manual" });
    expect(noPkce.status).toBe(302);
    expect(new URL(noPkce.headers.get("location")!).searchParams.get("error")).toBe("invalid_request");
    const plain = await fetch(`${r.base}/authorize?${new URLSearchParams({ ...base, code_challenge: challenge, code_challenge_method: "plain" })}`, { redirect: "manual" });
    expect(new URL(plain.headers.get("location")!).searchParams.get("error")).toBe("invalid_request");
    const wrongRes = await fetch(`${r.base}/authorize?${new URLSearchParams({ ...base, code_challenge: challenge, code_challenge_method: "S256", resource: "https://other.example/mcp" })}`, { redirect: "manual" });
    const u = new URL(wrongRes.headers.get("location")!);
    expect(u.searchParams.get("error")).toBe("invalid_target");
    expect(u.searchParams.get("state")).toBe("s1");
    r.close();
  });

  it("loopback redirects match regardless of port (RFC 8252)", async () => {
    const r = await rig();
    const reg = (await register(r, "http://localhost/callback", "Claude Code")).body;
    const f = await authorizeFlow(r, reg.client_id, { redirect: "http://localhost:53124/callback" });
    expect(f.dec!.status).toBe(302);
    expect(f.loc!.origin).toBe("http://localhost:53124");
    expect(f.html).toContain("your own machine");
    r.close();
  });

  it("deny returns access_denied; CSRF mismatch and expired requests are refused", async () => {
    const r = await rig();
    const reg = (await register(r)).body;
    const d = await authorizeFlow(r, reg.client_id, { action: "deny" });
    expect(d.loc!.searchParams.get("error")).toBe("access_denied");
    expect(d.loc!.searchParams.get("code")).toBeNull();

    const a = await authorizeFlow(r, reg.client_id, { approveIt: false });
    const bad = await fetch(`${r.base}/authorize/decision`, form({ rid: a.rid!, csrf: "wrong", action: "allow", level: "paperclip:read" }));
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain("Security token mismatch");

    const b = await authorizeFlow(r, reg.client_id, { approveIt: false });
    r.clock.t += 11 * 60_000;
    const late = await fetch(`${r.base}/authorize/decision`, form({ rid: b.rid!, csrf: b.csrf!, action: "allow", level: "paperclip:read" }));
    expect(await late.text()).toContain("expired");
    r.close();
  });

  it("the consent page can poll approval status", async () => {
    const r = await rig();
    const reg = (await register(r)).body;
    const f = await authorizeFlow(r, reg.client_id, { approveIt: false });
    const before: any = await (await fetch(`${r.base}/authorize/status?rid=${f.rid}`)).json();
    expect(before.approved).toBe(false);
    approveLatest();
    const after: any = await (await fetch(`${r.base}/authorize/status?rid=${f.rid}`)).json();
    expect(after.approved).toBe(true);
    r.close();
  });
});

describe("refresh tokens", () => {
  it("rotates; reuse of a rotated token revokes the whole grant and the Paperclip key", async () => {
    const r = await rig();
    const { tokens, clientId } = await connect(r);
    const res = await tokenReq(r, { grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId });
    expect(res.status).toBe(200);
    const next: any = await res.json();
    expect(next.refresh_token).not.toBe(tokens.refresh_token);
    expect((await act(r, next.access_token, "paperclip_list_agents")).status).toBe(200);

    revoked.length = 0;
    const reuse = await tokenReq(r, { grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId });
    expect(((await reuse.json()) as any).error).toBe("invalid_grant");
    expect((await act(r, next.access_token, "paperclip_list_agents")).status).toBe(401);
    const afterReuse = await tokenReq(r, { grant_type: "refresh_token", refresh_token: next.refresh_token, client_id: clientId });
    expect(afterReuse.status).toBe(400);
    await new Promise((x) => setTimeout(x, 50));
    expect(revoked).toHaveLength(1);
    r.close();
  });

  it("cannot escalate scope on refresh or use another client's id", async () => {
    const r = await rig();
    const { tokens, clientId } = await connect(r, "paperclip:read");
    const esc = await tokenReq(r, { grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId, scope: "paperclip:admin" });
    expect(((await esc.json()) as any).error).toBe("invalid_scope");
    const other = (await register(r)).body.client_id;
    const steal = await tokenReq(r, { grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: other });
    expect(((await steal.json()) as any).error).toBe("invalid_grant");
    r.close();
  });

  it("access tokens expire", async () => {
    const r = await rig();
    const { tokens } = await connect(r);
    expect((await act(r, tokens.access_token, "paperclip_list_agents")).status).toBe(200);
    r.clock.t += 3601_000;
    expect((await act(r, tokens.access_token, "paperclip_list_agents")).status).toBe(401);
    r.close();
  });

  it("only accepts form-encoded token requests", async () => {
    const r = await rig();
    const res = await fetch(`${r.base}/token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grant_type: "refresh_token" }) });
    expect(res.status).toBe(400);
    r.close();
  });
});

describe("revocation", () => {
  it("/revoke kills the grant (both tokens) and tells Paperclip to revoke its key", async () => {
    const r = await rig();
    const { tokens, clientId } = await connect(r);
    revoked.length = 0;
    expect((await fetch(`${r.base}/revoke`, form({ token: tokens.refresh_token }))).status).toBe(200);
    expect((await act(r, tokens.access_token, "paperclip_list_agents")).status).toBe(401);
    expect((await tokenReq(r, { grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId })).status).toBe(400);
    await new Promise((x) => setTimeout(x, 50));
    expect(revoked).toHaveLength(1);
    // unknown tokens still answer 200 (no oracle)
    expect((await fetch(`${r.base}/revoke`, form({ token: "nope" }))).status).toBe(200);
    r.close();
  });

  it("operator can revoke a grant programmatically", async () => {
    const r = await rig();
    const { tokens } = await connect(r);
    const [g] = await r.provider.listGrants();
    await r.provider.revokeGrant(g.id);
    expect((await act(r, tokens.access_token, "paperclip_list_agents")).status).toBe(401);
    r.close();
  });
});

describe("Paperclip key rotation without accounts", () => {
  const DAY = 86_400_000;
  it("renews a sign-in key stored on a grant a week before Paperclip expires it", async () => {
    const r = await rig({ accessTtlSec: 90 * 86400 });
    const c = await connect(r);
    const signIn = `board-tok-${challengeSeq}`;
    keyState.posts.length = 0;
    r.clock.t += 20 * DAY; // not due yet: nothing is asked
    keyState.expiresAt = r.clock.t + 10 * DAY;
    expect((await act(r, c.tokens.access_token, "paperclip_list_agents")).status).toBe(200);
    expect(keyState.posts).toHaveLength(0);
    r.clock.t += 4 * DAY; // inside the last week
    keyState.now = r.clock.t;
    keyState.expiresAt = r.clock.t + 6 * DAY;
    expect((await act(r, c.tokens.access_token, "paperclip_list_agents")).status).toBe(200);
    await r.provider.drainBackground();
    expect(keyState.posts).toEqual([{ auth: `Bearer ${signIn}`, name: "Papercliped (c)" }]);
    expect(seenAuth.at(-1)).toBe("Bearer pcp_board_rotated_1");
    expect(revoked).toContain(`Bearer ${signIn}`);
    expect((await act(r, c.tokens.access_token, "paperclip_list_agents")).status).toBe(200);
    expect(keyState.posts).toHaveLength(1);
    expect(seenAuth.at(-1)).toBe("Bearer pcp_board_rotated_1");
    r.close();
  });

  it("never touches the operator's own PAPERCLIP_API_KEY", async () => {
    const r = await rig({ login: "static", accessTtlSec: 90 * 86400 }, { apiKey: "configured-board-key" });
    const reg = (await register(r)).body;
    const { challenge, verifier } = pkce();
    const q = new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: CLAUDE_CB, code_challenge: challenge, code_challenge_method: "S256", scope: "paperclip:read" });
    const html = await (await fetch(`${r.base}/authorize?${q}`)).text();
    const rid = /name="rid" value="([^"]+)"/.exec(html)![1];
    const csrf = /name="csrf" value="([^"]+)"/.exec(html)![1];
    const ok = await fetch(`${r.base}/authorize/decision`, form({ rid, csrf, action: "allow", level: "paperclip:read", password: "static-secret" }));
    const code = new URL(ok.headers.get("location")!).searchParams.get("code")!;
    const t: any = await (await tokenReq(r, { grant_type: "authorization_code", code, redirect_uri: CLAUDE_CB, code_verifier: verifier, client_id: reg.client_id })).json();
    keyState.posts.length = 0;
    r.clock.t += 25 * DAY; // inside what would be the last week of a sign-in key
    await r.provider.sweep();
    expect((await act(r, t.access_token, "paperclip_list_agents")).status).toBe(200);
    expect(seenAuth.at(-1)).toBe("Bearer configured-board-key");
    expect(keyState.posts).toHaveLength(0);
    expect(revoked).not.toContain("Bearer configured-board-key");
    r.close();
  });
});

describe("static login mode", () => {
  it("requires the bridge admin token, rate-limits guesses, and uses the configured Paperclip key", async () => {
    const r = await rig({ login: "static" }, { apiKey: "configured-board-key" });
    const reg = (await register(r)).body;
    const { challenge, verifier } = pkce();
    const q = new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: CLAUDE_CB, code_challenge: challenge, code_challenge_method: "S256", scope: "paperclip:read" });
    const html = await (await fetch(`${r.base}/authorize?${q}`)).text();
    expect(html).toContain('type="password"');
    expect(html).not.toContain("cli-auth");
    const rid = /name="rid" value="([^"]+)"/.exec(html)![1];
    const csrf = /name="csrf" value="([^"]+)"/.exec(html)![1];
    const decide = (password: string) => fetch(`${r.base}/authorize/decision`, form({ rid, csrf, action: "allow", level: "paperclip:read", password }));
    const wrong = await decide("nope");
    expect(wrong.status).toBe(400);
    expect(await wrong.text()).toContain("Incorrect bridge admin token");
    const ok = await decide("static-secret");
    expect(ok.status).toBe(302);
    const code = new URL(ok.headers.get("location")!).searchParams.get("code")!;
    const t: any = await (await tokenReq(r, { grant_type: "authorization_code", code, redirect_uri: CLAUDE_CB, code_verifier: verifier, client_id: reg.client_id })).json();
    seenAuth.length = 0;
    expect((await act(r, t.access_token, "paperclip_list_agents")).status).toBe(200);
    expect(seenAuth.at(-1)).toBe("Bearer configured-board-key");

    // brute force: after 5 attempts per minute further guesses get 429 even with the right token
    const r2 = await rig({ login: "static" });
    const reg2 = (await register(r2)).body;
    const page = await (await fetch(`${r2.base}/authorize?${new URLSearchParams({ response_type: "code", client_id: reg2.client_id, redirect_uri: CLAUDE_CB, code_challenge: challenge, code_challenge_method: "S256" })}`)).text();
    const rid2 = /name="rid" value="([^"]+)"/.exec(page)![1];
    const csrf2 = /name="csrf" value="([^"]+)"/.exec(page)![1];
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await fetch(`${r2.base}/authorize/decision`, form({ rid: rid2, csrf: csrf2, action: "allow", level: "paperclip:read", password: `guess${i}` }))).status);
    expect(statuses.slice(0, 5)).toEqual([400, 400, 400, 400, 400]);
    expect(statuses[5]).toBe(429);
    expect((await fetch(`${r2.base}/authorize/decision`, form({ rid: rid2, csrf: csrf2, action: "allow", level: "paperclip:read", password: "static-secret" }))).status).toBe(429);
    r.close();
    r2.close();
  });
});

describe("coexistence and persistence", () => {
  it("BRIDGE_TOKEN keeps full access next to OAuth", async () => {
    const r = await rig();
    expect((await act(r, "static-secret", "paperclip_list_agents")).status).toBe(200);
    expect(r.audit.at(-1)?.actor).toBe("static-token");
    const mcp = new Client({ name: "t", version: "0" });
    await mcp.connect(new StreamableHTTPClientTransport(new URL(`${r.base}/mcp`), { requestInit: { headers: { Authorization: "Bearer static-secret" } } }));
    expect((await mcp.listTools()).tools).toHaveLength(tools.length);
    await mcp.close();
    r.close();
  });

  it("persists grants across restarts with the credential encrypted at rest", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "bridge-")), "state.json");
    const r1 = await rig({}, { dataFile: file });
    const { tokens } = await connect(r1);
    r1.close();
    const onDisk = readFileSync(file, "utf8");
    expect(onDisk).not.toContain("board-tok-");
    expect(onDisk).not.toContain(tokens.access_token);
    expect(onDisk).not.toContain(tokens.refresh_token);

    const config: BridgeConfig = { apiUrl: `${paperclipUrl}/api`, apiKey: null, companyId: CID, readOnly: false, timeoutMs: 5000 };
    const r2 = await rig({}, { dataFile: file });
    // fresh provider over the same file + same secret
    const store = new OAuthStore(file);
    expect(await store.listGrants()).toHaveLength(1);
    const p2 = new OAuthProvider({ config, oauth: r2.oauth, bridgeToken: "x", store });
    const g = await p2.authenticate(tokens.access_token);
    expect(g).not.toBeNull();
    seenAuth.length = 0;
    await (await p2.clientFor(g!)).get(`/companies/${CID}/agents`);
    expect(seenAuth.at(-1)).toMatch(/^Bearer board-tok-/);
    // a different secret cannot unseal it
    const p3 = new OAuthProvider({ config, oauth: { ...r2.oauth, secret: "z".repeat(40) }, bridgeToken: "x", store });
    await expect(p3.clientFor(g as any)).rejects.toThrow(/no longer has/);
    r2.close();
  });
});

describe("config validation", () => {
  const ok = { BRIDGE_OAUTH: "1", BRIDGE_SECRET: "s".repeat(32) };
  it("is off unless BRIDGE_OAUTH=1", () => expect(readOAuthConfig({}, null, null)).toBeNull());
  it("requires an https origin, a long secret, and a token for static login", () => {
    expect(() => readOAuthConfig(ok, null, null)).toThrow(/BRIDGE_PUBLIC_URL/);
    expect(() => readOAuthConfig(ok, "http://bridge.example.com", null)).toThrow(/https/);
    expect(() => readOAuthConfig(ok, "https://bridge.example.com/path", null)).toThrow(/no path/);
    expect(() => readOAuthConfig({ ...ok, BRIDGE_SECRET: "short" }, "https://b.example.com", null)).toThrow(/BRIDGE_SECRET/);
    expect(() => readOAuthConfig({ ...ok, BRIDGE_LOGIN: "static" }, "https://b.example.com", null)).toThrow(/BRIDGE_TOKEN/);
    expect(() => readOAuthConfig({ ...ok, BRIDGE_LOGIN: "nope" }, "https://b.example.com", null)).toThrow(/BRIDGE_LOGIN/);
    expect(readOAuthConfig(ok, "http://localhost:3939", null)?.issuer).toBe("http://localhost:3939");
    expect(readOAuthConfig(ok, "https://b.example.com", null)).toMatchObject({ issuer: "https://b.example.com", login: "paperclip" });
  });
});

describe("scopes", () => {
  const t = (name: string) => tools.find((x) => x.name === name)!;
  it("classifies every tool and nothing consequential falls into read", () => {
    for (const x of tools) {
      const s = requiredScope(x);
      if (x.access === "read") expect(s, x.name).toBe("paperclip:read");
      else if (x.name !== "paperclip_api_request") expect(s, x.name).toBe("paperclip:control");
    }
    expect(requiredScope(t("paperclip_decide_approval"))).toBe("paperclip:control");
    expect(requiredScope(t("paperclip_set_agent_budget"))).toBe("paperclip:control");
    expect(requiredScope(t("paperclip_terminate_agent"))).toBe("paperclip:control");
    expect(requiredScope(t("paperclip_pause_agent"))).toBe("paperclip:control");
    expect(requiredScope(t("paperclip_api_request"), { method: "GET" })).toBe("paperclip:read");
    expect(requiredScope(t("paperclip_api_request"), { method: "DELETE" })).toBe("paperclip:control");
  });
  it("is hierarchical and ignores unknown scopes", () => {
    expect(scopeAllows(["paperclip:control"], "paperclip:read")).toBe(true);
    expect(scopeAllows(["paperclip:admin"], "paperclip:control")).toBe(true); // retired name = Full control
    expect(SCOPES).toEqual(["paperclip:read", "paperclip:control"]);
    expect(scopeAllows(["paperclip:read"], "paperclip:control")).toBe(false);
    expect(scopeAllows(["offline_access", "bogus"], "paperclip:read")).toBe(false);
  });
});
