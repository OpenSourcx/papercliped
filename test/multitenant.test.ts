import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ALIAS_RE } from "../src/accounts/alias.js";
import { hostAllowed, readOAuthConfig, type BridgeConfig, type OAuthConfig } from "../src/config.js";
import { migrate } from "../src/migrate.js";
import { PgStore } from "../src/oauth/pg-store.js";
import { OAuthProvider, clientIp } from "../src/oauth/provider.js";
import { MemoryStore, type Store } from "../src/oauth/store.js";
import type { AuditEvent } from "../src/execute.js";
import { createHttpServer } from "../src/server.js";
import { VERSION } from "../src/version.js";

const DB = process.env.TEST_DATABASE_URL;
const CB = "https://claude.ai/api/mcp/auth_callback";
const CID = "11111111-1111-1111-1111-111111111111";

// ───────────── mock fleet of tenant Paperclips, routed by a fake "egress" ─────────────
interface Seen { host: string; path: string; auth?: string }
const seen: Seen[] = [];
const challenges = new Map<string, { host: string; token: string; secret: string; status: string }>();
const revokedBy: string[] = [];
const challengeNames: string[] = [];
const deadTokens = new Set<string>(); // credentials that Paperclip no longer accepts
const identity = new Map<string, string>(); // host → the Paperclip user id whoami reports (default user@host)
const unreachable = new Set<string>(); // hosts the egress cannot connect to
const plugins = new Map<string, string>(); // host → installed Papercliped plugin version
const pluginCalls: { method: string; host: string; auth?: string; body?: any }[] = []; // every plugin API call Paperclip received
let seq = 0;
// Board keys (Paperclip's /board-api-keys): every challenge token and every key made through the API, with its expiry.
const DAY = 24 * 3600 * 1000;
const mockClock = { offset: 0 }; // moves the fake Paperclip's clock along with a rig's
const mockNow = () => Date.now() + mockClock.offset;
interface MockKey { id: string; host: string; token: string; expiresAt: number | null; revoked: boolean }
const boardKeys = new Map<string, MockKey>(); // token → key
const keyCalls: { method: string; host: string; auth?: string; body?: any }[] = []; // every /board-api-keys call
const failCreate = new Set<string>(); // hosts whose key creation fails
let keySeq = 0;
const keyFor = (host: string, token: string): MockKey => {
  let k = boardKeys.get(token);
  if (!k) boardKeys.set(token, (k = { id: `00000000-0000-4000-9000-${String(++keySeq).padStart(12, "0")}`, host, token, expiresAt: mockNow() + 30 * DAY, revoked: false }));
  return k;
};
const liveKey = (token: string) => {
  const k = boardKeys.get(token);
  return k && !k.revoked && (k.expiresAt === null || k.expiresAt > mockNow()) ? k : undefined;
};

function fleet(): Server {
  return createServer(async (req: IncomingMessage, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    const host = String(req.headers["x-mock-host"]);
    const send = (s: number, b: unknown, ct = "application/json") => (res.writeHead(s, { "Content-Type": ct }), res.end(typeof b === "string" ? b : JSON.stringify(b)));
    const u = new URL(req.url!, "http://x");
    const p = u.pathname;
    const auth = req.headers.authorization;
    if (p === "/api/health") {
      if (host.includes("notpaperclip")) return send(200, "<html>hello</html>", "text/html");
      if (host.includes("nofields")) return send(200, {});
      if (host.includes("down")) return send(500, { error: "boom" });
      return send(200, { status: "ok", deploymentMode: host.includes("localtrusted") ? "local_trusted" : "authenticated" });
    }
    if (p === "/api/cli-auth/challenges" && req.method === "POST") {
      challengeNames.push(JSON.parse(raw).clientName);
      const n = ++seq;
      const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
      const ch = { host, token: `board-${host}-${n}`, secret: `secret-${n}-xxxxxxxx`, status: "pending" };
      challenges.set(id, ch);
      const k = keyFor(host, ch.token);
      if (host.includes("oldpaperclip")) k.expiresAt = null; // before Paperclip expired keys
      if (host.includes("badid")) return send(201, { id: "nope", token: ch.secret, boardApiToken: ch.token, approvalPath: `/cli-auth/${id}?token=${ch.secret}`, expiresAt: new Date(Date.now() + 6e5).toISOString() });
      const approvalPath = host.includes("evilpath") ? "@evil.com/x" : `/cli-auth/${id}?token=${ch.secret}`;
      return send(201, { id, token: ch.secret, boardApiToken: ch.token, approvalPath, expiresAt: new Date(Date.now() + 6e5).toISOString() });
    }
    const m = /^\/api\/cli-auth\/challenges\/([^/]+)$/.exec(p);
    if (m) {
      const ch = challenges.get(m[1]);
      return ch && u.searchParams.get("token") === ch.secret ? send(200, { status: ch.status }) : send(404, { error: "nf" });
    }
    if (p === "/api/cli-auth/me") {
      const token = auth?.replace(/^Bearer /, "") ?? "";
      const ch = [...challenges.values()].find((c) => c.token === token && c.status === "approved");
      const made = boardKeys.get(token);
      const owner = ch?.host ?? (made && ![...challenges.values()].some((c) => c.token === token) ? made.host : undefined);
      if (!owner || deadTokens.has(token) || !liveKey(token)) return send(401, { error: "auth" });
      return send(200, { userId: identity.get(owner) ?? `user@${owner}`, source: "board_key", keyId: host.includes("oldpaperclip") ? null : liveKey(token)!.id });
    }
    if (p === "/api/board-api-keys") {
      keyCalls.push({ method: req.method!, host, auth, body: raw ? JSON.parse(raw) : undefined });
      if (host.includes("oldpaperclip")) return send(404, { error: "no such route" });
      const token = auth?.replace(/^Bearer /, "") ?? "";
      if (deadTokens.has(token) || !liveKey(token)) return send(401, { error: "auth" });
      if (req.method === "GET") return send(200, [...boardKeys.values()].filter((k) => k.host === host && liveKey(k.token)).map((k) => ({ id: k.id, name: "x", expiresAt: k.expiresAt === null ? null : new Date(k.expiresAt).toISOString() })));
      if (failCreate.has(host)) return send(500, { error: "database is down" });
      const made = keyFor(host, `pcp_board_${host}_${++keySeq}`);
      return send(201, { id: made.id, name: JSON.parse(raw).name, token: made.token, expiresAt: new Date(made.expiresAt!).toISOString() });
    }
    if (p === "/api/cli-auth/revoke-current") {
      const k = boardKeys.get(auth?.replace(/^Bearer /, "") ?? "");
      if (k) k.revoked = true;
      return (revokedBy.push(`${host}|${auth}`), send(200, { revoked: true }));
    }
    if (p === "/api/plugins" || p === "/api/plugins/install") {
      pluginCalls.push({ method: req.method!, host, auth, body: raw ? JSON.parse(raw) : undefined });
      if (host.includes("noplugins")) return send(404, { error: "no such route" });
      if (p === "/api/plugins") {
        const v = plugins.get(host);
        return send(200, v ? [{ id: "p1", pluginKey: "papercliped.remote-control", packageName: "papercliped-paperclip-plugin", version: v, status: "ready" }] : []);
      }
      if (host.includes("notadmin")) return send(403, { error: "Instance admin access required" });
      if (host.includes("installfail")) return send(400, { error: "npm install failed" });
      const body = JSON.parse(raw);
      plugins.set(host, body.version);
      return send(200, { id: "p1", pluginKey: "papercliped.remote-control", packageName: body.packageName, version: body.version, status: "ready" });
    }
    const bearer = auth?.replace(/^Bearer /, "") ?? "";
    if (deadTokens.has(bearer) || (boardKeys.has(bearer) && !liveKey(bearer))) return send(401, { error: "auth" });
    seen.push({ host, path: p, auth });
    if (p === `/api/companies/${CID}/agents`) return send(200, [{ id: "a1", name: `agent-of-${host}`, status: "idle" }]);
    if (p === "/api/companies") return send(200, [{ id: CID, name: host }]);
    send(404, { error: "no route" });
  });
}

let mock: Server, mockBase: string;
const outbound: string[] = []; // every URL the bridge tried to reach (the egress layer sees it before the network does)
const egress: typeof fetch = (async (input: any, init: any = {}) => {
  const u = new URL(typeof input === "string" ? input : input.toString());
  outbound.push(u.toString());
  if (unreachable.has(u.hostname)) throw new Error("connect ECONNREFUSED");
  return fetch(`${mockBase}${u.pathname}${u.search}`, { ...init, headers: { ...(init.headers ?? {}), "x-mock-host": u.hostname } });
}) as any;

beforeAll(async () => {
  mock = fleet();
  await new Promise<void>((r) => mock.listen(0, "127.0.0.1", r));
  mockBase = `http://127.0.0.1:${(mock.address() as AddressInfo).port}`;
});
afterAll(() => mock.close());

const approve = (host: string) => {
  for (const c of challenges.values()) if (c.host === host && c.status === "pending") c.status = "approved";
};

interface Rig { base: string; server: Server; provider: OAuthProvider; store: Store; audit: AuditEvent[]; clock: { t: number }; oauth: OAuthConfig; close: () => void }

async function rig(over: Partial<OAuthConfig> = {}, opts: { store?: Store; secret?: string } = {}): Promise<Rig> {
  const clock = { t: Date.now() };
  const audit: AuditEvent[] = [];
  const probe = createServer();
  await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>((r) => probe.close(() => r()));
  const config: BridgeConfig = { apiUrl: "http://unused.invalid/api", apiKey: "SHOULD-NEVER-BE-USED", companyId: "SHOULD-NEVER-BE-USED", readOnly: false, timeoutMs: 5000 };
  const oauth: OAuthConfig = {
    issuer: `http://localhost:${port}`, secret: opts.secret ?? "s".repeat(40), previousSecrets: [], mode: "multi", accounts: true, login: "paperclip", dataFile: null, database: null,
    paperclipPublicUrl: null, accessTtlSec: 3600, refreshTtlSec: 86400 * 40, idleRevokeDays: 30, callsPerMinute: 120, redirectHosts: ["claude.ai"], proxyHops: 0,
    instance: { allowedPorts: [443], denyHosts: ["localhost"], allowHosts: null }, ...over,
  };
  const store = opts.store ?? new MemoryStore(null, () => clock.t);
  const provider = new OAuthProvider({ config, oauth, bridgeToken: null, store, now: () => clock.t, safeFetch: egress, rotationGraceMs: 0 });
  const server = createHttpServer(config, { host: "127.0.0.1", port, bridgeToken: null, publicUrl: oauth.issuer, oauth }, { oauth: provider, audit: (e) => audit.push(e) });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  return { base: oauth.issuer, server, provider, store, audit, clock, oauth, close: () => server.close() };
}

const form = (o: Record<string, string>) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString(), redirect: "manual" as const });
const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};
const register = async (r: Rig, name = "Claude") =>
  ((await (await fetch(`${r.base}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redirect_uris: [CB], client_name: name }) })).json()) as any).client_id as string;

interface Sess { cid: string; verifier: string; html: string; rid: string; csrf: string; status: number }
const grab = (html: string) => ({ rid: /name="rid" value="([^"]+)"/.exec(html)?.[1]!, csrf: /name="csrf" value="([^"]+)"/.exec(html)?.[1]! });

async function start(r: Rig, cid?: string, scope = "paperclip:read paperclip:control"): Promise<Sess> {
  cid ??= await register(r);
  const { verifier, challenge } = pkce();
  const q = new URLSearchParams({ response_type: "code", client_id: cid, redirect_uri: CB, code_challenge: challenge, code_challenge_method: "S256", state: "st", scope, resource: `${r.base}/mcp` });
  const page = await fetch(`${r.base}/authorize?${q}`, { redirect: "manual" });
  const html = await page.text();
  return { cid, verifier, html, status: page.status, ...grab(html) };
}
const step = (r: Rig, s: Pick<Sess, "rid" | "csrf">, path: string, fields: Record<string, string> = {}) => fetch(`${r.base}/authorize/${path}`, form({ rid: s.rid, csrf: s.csrf, action: "continue", ...fields }));
const toInstance = async (r: Rig, s: Sess) => (await step(r, s, "connect")).text();

const SECRET_RE = /id="sec">(pcs_[0-9A-Z<>wbr/-]+)</; // the page puts <wbr> after each dash so phones wrap only there
const secretOf = (html: string) => SECRET_RE.exec(html)?.[1]?.replace(/<wbr>/g, "");
const exchange = async (r: Rig, s: Sess, dec: Response) => {
  const loc = dec.headers.get("location");
  if (!loc) throw new Error(`no redirect: ${dec.status} ${(await dec.text()).slice(0, 200)}`);
  const code = new URL(loc).searchParams.get("code")!;
  return (await (await fetch(`${r.base}/token`, form({ grant_type: "authorization_code", code, redirect_uri: CB, code_verifier: s.verifier, client_id: s.cid }))).json()) as any;
};

/** A brand-new user: connect → approve → username → secret → allow. */
async function newUser(r: Rig, host: string, username: string, o: { level?: string; cid?: string; scope?: string; anonymous?: boolean } = {}) {
  const s = await start(r, o.cid, o.scope ?? o.level ?? "paperclip:read paperclip:control");
  await toInstance(r, s);
  await step(r, s, "instance", { instance: host });
  approve(host);
  const un = await (await step(r, s, "approved")).text();
  const secretPage = await (await step(r, s, "username", { username, ...(o.anonymous ? { anonymous: "on" } : {}) })).text();
  const secret = secretOf(secretPage);
  const scopePage = await (await step(r, s, "continue")).text();
  const dec = await step(r, s, "decision", { level: o.level ?? "paperclip:control" });
  const tokens = await exchange(r, s, dec);
  return { s, secret, usernamePage: un, secretPage, scopePage, tokens, username };
}

/** Log in with username + secret key (no Paperclip approval needed while the stored key still works). */
async function loginFlow(r: Rig, username: string, secret: string, o: { level?: string; cid?: string } = {}) {
  const s = await start(r, o.cid);
  const res = await step(r, s, "login", { username, secret });
  const html = await res.text();
  return { s, res, html };
}

const act = (r: Rig, token: string, tool: string, body: unknown = {}) => fetch(`${r.base}/actions/${tool}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
/** Pages HTML-escape apostrophes; compare against the visible text. */
const un = (h: string) => h.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const kinds = async (r: Rig) => (await r.store.userEventsRecent(0, 100)).reverse().map((e) => `${e.kind}${e.username ? ":" + e.username : ""}${e.detail ? "/" + e.detail : ""}`);

// ───────────── the new-user journey ─────────────
describe("account flow: a brand-new user", () => {
  it("connects Paperclip, picks a username, gets a secret key once, and ends up with a scoped grant", async () => {
    const r = await rig();
    const before = challenges.size;
    const s = await start(r);
    // step 1: choose
    expect(s.html).toContain("Sign in to Papercliped");
    expect(s.html).toContain('action="/authorize/login"');
    expect(s.html).toContain("Connect your Paperclip");
    expect(challenges.size).toBe(before); // nothing contacted yet
    // step 2: instance
    expect(await toInstance(r, s)).toContain('name="instance"');
    // step 3: approve in Paperclip
    const ap = await (await step(r, s, "instance", { instance: "Tenant-A.Example.com" })).text();
    expect(ap).toContain("https://tenant-a.example.com/cli-auth/");
    expect(challengeNames.at(-1)).toMatch(/^Claude \(via Papercliped, returns to claude\.ai\)$/);
    // pressing Continue before approving is refused
    const early = await (await step(r, s, "approved")).text();
    expect(early).toContain("Not approved in Paperclip yet");
    approve("tenant-a.example.com");
    // step 4: username
    const unPage = await (await step(r, s, "approved")).text();
    expect(unPage).toContain("Choose your username");
    expect(unPage).toContain("At least 6 characters");
    // rules enforced server-side, with helpful messages, and nothing is created
    for (const [bad, why] of [["abc", /at least 6/], ["justletters", /number or one of/], ["bad%name1", /only letters/], [".lead1ng", /Start your username/], ["admin.01", /reserved/]] as const) {
      const t = await step(r, s, "username", { username: bad });
      expect(t.status).toBe(400);
      expect(await t.text()).toMatch(why);
    }
    expect(await r.store.countAccounts()).toBe(0);
    // step 5: the secret key, shown once
    const sec = await (await step(r, s, "username", { username: "og.kpnwrld" })).text();
    const secret = secretOf(sec)!;
    expect(secret).toMatch(/^pcs_([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(sec).toContain("Welcome, og.kpnwrld");
    expect(un(sec)).toContain("only time we'll show it");
    // the account exists; the secret is stored only as a hash; the credential only sealed
    const acct = (await r.store.getAccountByKey("og.kpnwrld"))!;
    expect(acct.username).toBe("og.kpnwrld");
    expect(acct.secretHash).toMatch(/^scrypt\$/);
    expect(JSON.stringify(acct)).not.toContain(secret.replace(/-/g, "").slice(4));
    const link = (await r.store.getLink(acct.id))!;
    expect(link).toMatchObject({ instanceUrl: "https://tenant-a.example.com", paperclipUserId: "user@tenant-a.example.com" });
    expect(link.sealedCredential).toMatch(/^[0-9a-f]{8}\./);
    expect(link.sealedCredential).not.toContain("board-tenant-a");
    // step 6: access level, then the code
    const scope = await (await step(r, s, "continue")).text();
    expect(scope).toContain("Allow Claude?");
    expect(scope).toContain("Signed in as <strong>og.kpnwrld</strong>");
    expect(scope).toMatch(/value="paperclip:control" checked/);
    expect(scope).not.toMatch(/value="paperclip:admin"/);
    const dec = await step(r, s, "decision", { level: "paperclip:control" });
    expect(dec.status).toBe(302);
    const tokens = await exchange(r, s, dec);
    expect(tokens).toMatchObject({ token_type: "Bearer", scope: "paperclip:read paperclip:control" });

    // the grant belongs to the account and uses the account's stored Paperclip key
    seen.length = 0;
    const res = await act(r, tokens.access_token, "paperclip_list_agents", { companyId: CID });
    expect(res.status).toBe(200);
    expect(seen.at(-1)).toMatchObject({ host: "tenant-a.example.com", auth: expect.stringMatching(/^Bearer board-tenant-a\.example\.com-/) });
    expect(JSON.stringify(seen)).not.toContain("SHOULD-NEVER-BE-USED");
    const [g] = await r.provider.listGrants();
    expect(g).toMatchObject({ accountId: acct.id, username: "og.kpnwrld", sealedCredential: null });
    // the operator's log and audit trail know the username
    expect(r.audit.at(-1)).toMatchObject({ tool: "paperclip_list_agents", ok: true, username: "og.kpnwrld", instance: "tenant-a.example.com" });
    expect(await kinds(r)).toEqual(["started", "joined:og.kpnwrld/tenant-a.example.com", "completed:og.kpnwrld/new"]);
    r.close();
  });

  it("usernames are unique regardless of case, even when two people race for one", async () => {
    const r = await rig();
    await newUser(r, "tenant-a.example.com", "Kpn.Wrld1");
    const s = await start(r);
    await toInstance(r, s);
    await step(r, s, "instance", { instance: "tenant-b.example.com" });
    approve("tenant-b.example.com");
    await step(r, s, "approved");
    const taken = await step(r, s, "username", { username: "kpn.wrld1" });
    expect(taken.status).toBe(400);
    expect(await taken.text()).toContain("That username is taken");
    // two simultaneous sign-ups for the same free name: exactly one wins
    const mk = async (host: string) => {
      const x = await start(r);
      await toInstance(r, x);
      await step(r, x, "instance", { instance: host });
      approve(host);
      await step(r, x, "approved");
      return x;
    };
    const [x, y] = [await mk("tenant-c.example.com"), await mk("tenant-d.example.com")];
    const texts = await Promise.all([step(r, x, "username", { username: "Race.Name9" }), step(r, y, "username", { username: "race.name9" })].map(async (p) => (await p).text()));
    expect(texts.filter((t) => t.includes("Welcome, ")).length).toBe(1);
    expect(texts.filter((t) => t.includes("That username is taken")).length).toBe(1);
    r.close();
  });

  it("another Paperclip user can't take over an existing identity", async () => {
    const r = await rig();
    await newUser(r, "tenant-a.example.com", "first.user1");
    // same Paperclip user returns on a fresh client → welcomed back as the same account, no new username
    const s = await start(r);
    await toInstance(r, s);
    await step(r, s, "instance", { instance: "tenant-a.example.com" });
    approve("tenant-a.example.com");
    const welcome = await (await step(r, s, "approved")).text();
    expect(welcome).toContain("Welcome back, first.user1");
    expect(await r.store.countAccounts()).toBe(1);
    // a different Paperclip user on the same instance is a different identity and gets to choose a name
    identity.set("tenant-a.example.com", "someone-else");
    const s2 = await start(r);
    await toInstance(r, s2);
    await step(r, s2, "instance", { instance: "tenant-a.example.com" });
    approve("tenant-a.example.com");
    expect(await (await step(r, s2, "approved")).text()).toContain("Choose your username");
    identity.delete("tenant-a.example.com");
    r.close();
  });
});

// ───────────── returning users ─────────────
describe("account flow: returning users", () => {
  it("logging in with username + secret key reuses the stored Paperclip key (no new approval)", async () => {
    const r = await rig();
    const { secret, tokens: first } = await newUser(r, "tenant-a.example.com", "og.kpnwrld");
    const chBefore = challenges.size;
    const { s, res, html } = await loginFlow(r, "OG.KPNWRLD", secret!.toLowerCase().replace(/-/g, " ")); // case + formatting forgiven
    expect(res.status).toBe(200);
    expect(html).toContain("Allow Claude?");
    expect(html).toContain("Signed in as <strong>og.kpnwrld</strong>");
    expect(challenges.size).toBe(chBefore); // no new Paperclip approval was needed
    const tokens = await exchange(r, s, await step(r, s, "decision", { level: "paperclip:read" }));
    expect(tokens.scope).toBe("paperclip:read");
    seen.length = 0;
    expect((await act(r, tokens.access_token, "paperclip_list_agents", { companyId: CID })).status).toBe(200);
    // the same stored Paperclip key serves both connections
    expect(seen[0].auth).toMatch(/board-tenant-a\.example\.com-\d+$/);
    expect((await act(r, first.access_token, "paperclip_list_agents", { companyId: CID })).status).toBe(200);
    expect(seen[1].auth).toBe(seen[0].auth);
    const ev = await kinds(r);
    expect(ev.slice(-3)).toEqual(["started", "login:og.kpnwrld/claude.ai", "completed:og.kpnwrld/login"]);
    r.close();
  });

  it("wrong credentials get one generic message — unknown user and wrong key look identical — and are logged", async () => {
    const r = await rig();
    const { secret } = await newUser(r, "tenant-a.example.com", "og.kpnwrld");
    const wrongKey = await loginFlow(r, "og.kpnwrld", "pcs_" + "0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ");
    const unknown = await loginFlow(r, "nobody.here9", secret!);
    const garbage = await loginFlow(r, "og.kpnwrld", "hunter2");
    for (const x of [wrongKey, unknown, garbage]) {
      expect(x.res.status).toBe(400);
      expect(un(x.html)).toContain("That username and secret key don't match.");
      expect(x.html).not.toContain("Allow Claude?");
    }
    const ev = await kinds(r);
    expect(ev.filter((e) => e.startsWith("login_failed"))).toEqual(["login_failed:og.kpnwrld/bad_credentials", "login_failed/bad_credentials", "login_failed:og.kpnwrld/bad_credentials"]);
    expect(JSON.stringify(await r.store.userEventsRecent(0, 100))).not.toContain("nobody.here9"); // attacker-supplied names never reach the log
    r.close();
  });

  it("throttles guessing per username (and still rejects the right key while throttled)", async () => {
    const r = await rig();
    const { secret } = await newUser(r, "tenant-a.example.com", "og.kpnwrld");
    for (let i = 0; i < 8; i++) expect((await loginFlow(r, "og.kpnwrld", "pcs_" + "0".repeat(4) + `-${String(1000 + i)}-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ`)).res.status).toBe(400);
    const locked = await loginFlow(r, "og.kpnwrld", secret!);
    expect(locked.res.status).toBe(429);
    expect(locked.html).toContain("Too many attempts");
    expect(await kinds(r)).toContain("login_failed/rate_limited");
    r.clock.t += 16 * 60_000;
    expect((await loginFlow(r, "og.kpnwrld", secret!)).res.status).toBe(200); // window passed
    r.close();
  });

  it("an expired Paperclip key sends the user to reconnect, keeping their username", async () => {
    const r = await rig();
    const { secret } = await newUser(r, "tenant-a.example.com", "og.kpnwrld");
    const link = (await r.store.getLink((await r.store.getAccountByKey("og.kpnwrld"))!.id))!;
    // Paperclip stops accepting the stored key
    for (const c of challenges.values()) if (c.host === "tenant-a.example.com") deadTokens.add(c.token);
    const { s, html } = await loginFlow(r, "og.kpnwrld", secret!);
    expect(html).toContain("Your Paperclip connection has expired");
    expect(html).toContain('value="tenant-a.example.com"'); // prefilled
    await step(r, s, "instance", { instance: "tenant-a.example.com" });
    approve("tenant-a.example.com");
    const scope = await (await step(r, s, "approved")).text(); // straight to access level: no username step
    expect(scope).toContain("Signed in as <strong>og.kpnwrld</strong>");
    const fresh = (await r.store.getLink(link.accountId))!;
    expect(fresh.connectedAt).toBeGreaterThanOrEqual(link.connectedAt);
    expect(fresh.sealedCredential).not.toBe(link.sealedCredential);
    expect(await r.store.countAccounts()).toBe(1);
    expect(await kinds(r)).toContain("updated:og.kpnwrld/reconnect");
    deadTokens.clear();
    r.close();
  });

  it("can't graft a Paperclip identity that belongs to a different username", async () => {
    const r = await rig();
    const a = await newUser(r, "tenant-a.example.com", "alice.one1");
    await newUser(r, "tenant-b.example.com", "bob.two22");
    // alice logs in with her key but approves Bob's Paperclip identity
    for (const c of challenges.values()) if (c.host === "tenant-a.example.com") deadTokens.add(c.token); // force reconnect
    const { s } = await loginFlow(r, "alice.one1", a.secret!);
    await step(r, s, "instance", { instance: "tenant-b.example.com" });
    approve("tenant-b.example.com");
    const res = await step(r, s, "approved");
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("already linked to a different Papercliped username");
    deadTokens.clear();
    r.close();
  });

  it("returning via Paperclip approval: the old key is revoked upstream, and a lost secret key can be replaced", async () => {
    const r = await rig();
    const first = await newUser(r, "tenant-a.example.com", "og.kpnwrld");
    const oldKey = (await act(r, first.tokens.access_token, "paperclip_list_agents", { companyId: CID }), seen.at(-1)!.auth!);
    revokedBy.length = 0;
    const s = await start(r);
    await toInstance(r, s);
    await step(r, s, "instance", { instance: "tenant-a.example.com" });
    approve("tenant-a.example.com");
    expect(await (await step(r, s, "approved")).text()).toContain("Welcome back, og.kpnwrld");
    await new Promise((x) => setTimeout(x, 50));
    expect(revokedBy).toEqual([`tenant-a.example.com|${oldKey}`]);
    // lost key → make a new one
    const rot = await (await step(r, s, "welcome", { action: "rotate" })).text();
    const newSecret = secretOf(rot)!;
    expect(rot).toContain("Your new secret key");
    expect(newSecret).not.toBe(first.secret);
    expect((await loginFlow(r, "og.kpnwrld", first.secret!)).res.status).toBe(400); // old key dead
    expect((await loginFlow(r, "og.kpnwrld", newSecret)).res.status).toBe(200); // new key works
    expect(await kinds(r)).toContain("updated:og.kpnwrld/secret_rotated");
    r.close();
  });
});

// ───────────── anonymity ─────────────
/**
 * Everything the separate panel's database role can read, as one string: the telemetry tables, and grants ONLY through the
 * `panel_grants` view's columns (no instance_url, no credential). The real-role equivalent is asserted against Postgres in store.test.ts.
 */
const panelView = async (r: Rig) => {
  const grants = (await r.provider.listGrants()).map((g) => ({ id: g.id, clientName: g.clientName, scopes: g.scopes, createdAt: g.createdAt, lastUsedAt: g.lastUsedAt, revoked: g.revoked, accountId: g.accountId, displayName: g.username }));
  return JSON.stringify([await r.store.userEventsRecent(0, 1000), await r.store.auditRecent(0, 1000), grants]);
};

describe("anonymity", () => {
  it("is off by default: logs show the real username and host", async () => {
    const r = await rig();
    const u = await newUser(r, "tenant-a.example.com", "og.kpnwrld");
    await act(r, u.tokens.access_token, "paperclip_list_agents", { companyId: CID });
    const seenByPanel = await panelView(r);
    expect(seenByPanel).toContain("og.kpnwrld");
    expect(seenByPanel).toContain("tenant-a.example.com");
    expect((await r.store.getAccountByKey("og.kpnwrld"))).toMatchObject({ anonymous: false, alias: null });
    expect(u.usernamePage).toContain('name="anonymous"');
    expect(u.usernamePage).not.toMatch(/name="anonymous" checked/);
    r.close();
  });

  it("opting in at signup shows an alias like Ann02 everywhere the operator looks — never the username or the Paperclip's address", async () => {
    const r = await rig();
    const u = await newUser(r, "tenant-a.example.com", "og.kpnwrld", { anonymous: true });
    await act(r, u.tokens.access_token, "paperclip_list_agents", { companyId: CID });
    const acct = (await r.store.getAccountByKey("og.kpnwrld"))!;
    expect(acct).toMatchObject({ username: "og.kpnwrld", anonymous: true });
    expect(acct.alias).toMatch(ALIAS_RE);
    const alias = acct.alias!;
    const link = (await r.store.getLink(acct.id))!;
    expect(link.instanceLabel).toMatch(/^anon-[0-9a-f]{6}$/);
    expect(link.instanceUrl).toBe("https://tenant-a.example.com"); // the bridge still needs the real address to call it

    const seenByPanel = await panelView(r);
    expect(seenByPanel).not.toContain("og.kpnwrld");
    expect(seenByPanel).not.toContain("tenant-a.example.com");
    expect(seenByPanel).toContain(alias);
    expect(seenByPanel).toContain(link.instanceLabel!);
    expect(await kinds(r)).toEqual(["started", `joined:${alias}/${link.instanceLabel}`, `completed:${alias}/new`]);
    expect(r.audit.at(-1)).toMatchObject({ tool: "paperclip_list_agents", username: alias, instance: link.instanceLabel });
    // the user's OWN pages still use their real name
    expect(u.secretPage).toContain("Welcome, og.kpnwrld");
    expect(u.scopePage).toContain("Signed in as <strong>og.kpnwrld</strong>");
    expect(u.scopePage).toContain(`You appear as <strong>${alias}</strong>`);
    // logging in with the real username still works, and the log stays anonymous
    const back = await loginFlow(r, "og.kpnwrld", u.secret!);
    expect(back.res.status).toBe(200);
    expect((await kinds(r)).filter((k) => k.startsWith("login:"))).toEqual([`login:${alias}/claude.ai`]);
    r.close();
  });

  it("existing users can turn it on later: history is rewritten, the alias is stable, and turning it off restores the name", async () => {
    const r = await rig();
    const u = await newUser(r, "tenant-a.example.com", "og.kpnwrld");
    await act(r, u.tokens.access_token, "paperclip_list_agents", { companyId: CID });
    expect(await panelView(r)).toContain("og.kpnwrld");

    // log in again and tick the box on the access-level screen
    const { s, html } = await loginFlow(r, "og.kpnwrld", u.secret!);
    expect(html).not.toMatch(/name="anonymous" checked/);
    const t1 = await exchange(r, s, await step(r, s, "decision", { level: "paperclip:control", privacy_present: "1", anonymous: "on" }));
    const alias = (await r.store.getAccountByKey("og.kpnwrld"))!.alias!;
    expect(alias).toMatch(ALIAS_RE);
    let view = await panelView(r);
    expect(view).not.toContain("og.kpnwrld"); // the earlier rows were rewritten too
    expect(view).not.toContain("tenant-a.example.com");
    expect(view).toContain(alias);
    expect(await kinds(r)).toContain(`updated:${alias}/privacy_on`);
    // the already-connected client now audits under the alias as well
    await act(r, u.tokens.access_token, "paperclip_list_agents", { companyId: CID });
    expect(r.audit.at(-1)).toMatchObject({ username: alias });
    expect((await r.provider.listGrants()).every((g) => g.username === alias)).toBe(true);

    // leaving the box unticked (with the form field present) turns it back off; the alias is kept
    const again = await loginFlow(r, "og.kpnwrld", u.secret!);
    expect(again.html).toMatch(/name="anonymous" checked/); // reflects the current state
    await exchange(r, again.s, await step(r, again.s, "decision", { level: "paperclip:read", privacy_present: "1" }));
    view = await panelView(r);
    expect(view).toContain("og.kpnwrld");
    expect(view).toContain("tenant-a.example.com");
    expect(view).not.toContain(`"${alias}"`);
    expect((await r.store.getAccountByKey("og.kpnwrld"))).toMatchObject({ anonymous: false, alias });
    expect(await kinds(r)).toContain("updated:og.kpnwrld/privacy_off");
    expect(t1.access_token).toBeDefined();
    // ...and on again: same alias
    const third = await loginFlow(r, "og.kpnwrld", u.secret!);
    await exchange(r, third.s, await step(r, third.s, "decision", { level: "paperclip:read", privacy_present: "1", anonymous: "on" }));
    expect((await r.store.getAccountByKey("og.kpnwrld"))!.alias).toBe(alias);
    r.close();
  });

  it("forms that don't carry the privacy field never change the setting", async () => {
    const r = await rig();
    const u = await newUser(r, "tenant-a.example.com", "og.kpnwrld", { anonymous: true });
    const { s } = await loginFlow(r, "og.kpnwrld", u.secret!);
    await exchange(r, s, await step(r, s, "decision", { level: "paperclip:read" })); // no privacy_present
    expect((await r.store.getAccountByKey("og.kpnwrld"))!.anonymous).toBe(true);
    r.close();
  });

  it("anonymous users never leak through 'left', idle expiry, or operator deletion, and tenants stay distinguishable", async () => {
    const r = await rig();
    const a = await newUser(r, "tenant-a.example.com", "alice.one1", { anonymous: true });
    const b = await newUser(r, "tenant-b.example.com", "bob.two22", { anonymous: true });
    const la = (await r.store.getLink((await r.store.getAccountByKey("alice.one1"))!.id))!.instanceLabel;
    const lb = (await r.store.getLink((await r.store.getAccountByKey("bob.two22"))!.id))!.instanceLabel;
    expect(la).not.toBe(lb); // different tenants keep different labels, so slow-tenant debugging still works
    const aliasA = (await r.store.getAccountByKey("alice.one1"))!.alias!;
    const aliasB = (await r.store.getAccountByKey("bob.two22"))!.alias!;
    expect(aliasA).not.toBe(aliasB);
    await fetch(`${r.base}/revoke`, form({ token: a.tokens.refresh_token }));
    r.clock.t += 40 * 86_400_000;
    await r.provider.sweep();
    await r.provider.deleteUser("alice.one1");
    const view = await panelView(r);
    for (const secret of ["alice.one1", "bob.two22", "tenant-a.example.com", "tenant-b.example.com"]) expect(view, secret).not.toContain(secret);
    const ev = await kinds(r);
    expect(ev).toContain(`left:${aliasA}/disconnected`);
    expect(ev).toContain(`left:${aliasB}/idle`);
    expect(ev).toContain(`left:${aliasA}/deleted`);
    expect(b.tokens.access_token).toBeDefined();
    r.close();
  });

  it("reconnecting keeps the same anonymous instance label", async () => {
    const r = await rig();
    const u = await newUser(r, "tenant-a.example.com", "og.kpnwrld", { anonymous: true });
    const acct = (await r.store.getAccountByKey("og.kpnwrld"))!;
    const before = (await r.store.getLink(acct.id))!.instanceLabel;
    for (const c of challenges.values()) if (c.host === "tenant-a.example.com") deadTokens.add(c.token);
    const { s } = await loginFlow(r, "og.kpnwrld", u.secret!);
    await step(r, s, "instance", { instance: "tenant-a.example.com" });
    approve("tenant-a.example.com");
    await step(r, s, "approved");
    expect((await r.store.getLink(acct.id))!.instanceLabel).toBe(before);
    deadTokens.clear();
    r.close();
  });

  it("the operator CLI view lists the real name and the alias together (this is the operator's own lookup)", async () => {
    const r = await rig();
    await newUser(r, "tenant-a.example.com", "og.kpnwrld", { anonymous: true });
    const [row] = await r.provider.listUsers();
    expect(row).toMatchObject({ username: "og.kpnwrld", anonymous: true, alias: expect.stringMatching(ALIAS_RE), instance: "tenant-a.example.com" });
    r.close();
  });
});

// ───────────── step order and abuse ─────────────
describe("account flow: step enforcement", () => {
  it("steps can't be skipped or replayed out of order; the page shown is where the user really is", async () => {
    const r = await rig();
    const s = await start(r);
    for (const path of ["decision", "username", "approved", "welcome", "continue", "instance"]) {
      const res = await step(r, s, path, { level: "paperclip:admin", username: "sneaky.user1", instance: "tenant-a.example.com" });
      expect(res.status, path).toBe(200);
      const html = await res.text();
      expect(html, path).toContain("Sign in to Papercliped"); // still at the first step
      expect(html, path).not.toContain("Allow Claude?");
    }
    expect(await r.store.countAccounts()).toBe(0);
    expect(challenges.size).toBeGreaterThanOrEqual(0);
    r.close();
  });

  it("requires the CSRF token, and Cancel at any step returns access_denied and is logged", async () => {
    const r = await rig();
    const s = await start(r);
    const bad = await fetch(`${r.base}/authorize/connect`, form({ rid: s.rid, csrf: "wrong", action: "continue" }));
    expect(await bad.text()).toContain("Security token mismatch");
    await toInstance(r, s);
    const cancel = await step(r, s, "instance", { action: "deny" });
    expect(new URL(cancel.headers.get("location")!).searchParams.get("error")).toBe("access_denied");
    expect(await kinds(r)).toContain("connect_failed/denied");
    const gone = await step(r, s, "instance", { instance: "tenant-a.example.com" });
    expect(await gone.text()).toContain("expired"); // the request is gone
    r.close();
  });

  it("the secret key page can't be shown a second time", async () => {
    const r = await rig();
    const s = await start(r);
    await toInstance(r, s);
    await step(r, s, "instance", { instance: "tenant-a.example.com" });
    approve("tenant-a.example.com");
    await step(r, s, "approved");
    const first = await (await step(r, s, "username", { username: "og.kpnwrld" })).text();
    expect(SECRET_RE.test(first)).toBe(true);
    const again = await (await step(r, s, "username", { username: "og.kpnwrld" })).text(); // a reload / double submit
    expect(SECRET_RE.test(again)).toBe(false);
    expect(un(again)).toContain("can't be shown again");
    expect(again).toContain("Allow Claude?");
    r.close();
  });

  it("login/connect/instance steps don't exist in single-instance mode", async () => {
    const r = await rig({ mode: "single", accounts: false });
    for (const p of ["login", "connect", "instance"]) expect((await fetch(`${r.base}/authorize/${p}`, form({ rid: "x", csrf: "y" }))).status).toBe(404);
    r.close();
  });
});

// ───────────── lifecycle ─────────────
describe("account lifecycle", () => {
  it("disconnecting a client logs 'left' but keeps the Paperclip key, so the user can come back without approving", async () => {
    const r = await rig();
    const { tokens, secret } = await newUser(r, "tenant-a.example.com", "og.kpnwrld");
    revokedBy.length = 0;
    expect((await fetch(`${r.base}/revoke`, form({ token: tokens.refresh_token }))).status).toBe(200);
    expect((await act(r, tokens.access_token, "paperclip_list_agents", { companyId: CID })).status).toBe(401);
    await new Promise((x) => setTimeout(x, 50));
    expect(revokedBy).toEqual([]); // the key stays active
    expect(await kinds(r)).toContain("left:og.kpnwrld/disconnected");
    const back = await loginFlow(r, "og.kpnwrld", secret!);
    expect(back.html).toContain("Allow Claude?"); // no re-approval
    r.close();
  });

  it("'left' is logged only when the LAST client disconnects", async () => {
    const r = await rig();
    const a = await newUser(r, "tenant-a.example.com", "og.kpnwrld");
    const { s } = await loginFlow(r, "og.kpnwrld", a.secret!);
    const second = await exchange(r, s, await step(r, s, "decision", { level: "paperclip:read" }));
    await fetch(`${r.base}/revoke`, form({ token: a.tokens.refresh_token }));
    expect((await kinds(r)).filter((e) => e.startsWith("left"))).toEqual([]);
    await fetch(`${r.base}/revoke`, form({ token: second.refresh_token }));
    expect((await kinds(r)).filter((e) => e.startsWith("left"))).toEqual(["left:og.kpnwrld/disconnected"]);
    r.close();
  });

  it("an idle account loses its stored key (revoked upstream) but keeps its username", async () => {
    const r = await rig();
    const idle = await newUser(r, "tenant-a.example.com", "idle.user1");
    r.clock.t += 20 * 86_400_000;
    const active = await newUser(r, "tenant-b.example.com", "active.user2");
    await act(r, active.tokens.access_token, "paperclip_list_agents", { companyId: CID });
    r.clock.t += 15 * 86_400_000; // idle: 35 days since use · active: 15
    revokedBy.length = 0;
    expect(await r.provider.sweep()).toBeGreaterThanOrEqual(1);
    await new Promise((x) => setTimeout(x, 50));
    expect(revokedBy.filter((x) => x.startsWith("tenant-a.example.com|Bearer board-tenant-a"))).toHaveLength(1);
    expect(revokedBy.some((x) => x.startsWith("tenant-b"))).toBe(false);
    const acct = (await r.store.getAccountByKey("idle.user1"))!;
    expect(acct).toBeDefined(); // username survives
    expect((await r.store.getLink(acct.id))?.sealedCredential).toBeNull(); // credential deleted
    expect((await act(r, idle.tokens.access_token, "paperclip_list_agents", { companyId: CID })).status).toBe(401);
    expect(await kinds(r)).toContain("left:idle.user1/idle");
    // logging in now requires reconnecting
    const { html } = await loginFlow(r, "idle.user1", idle.secret!);
    expect(html).toContain("Your Paperclip connection has expired");
    r.close();
  });

  it("operator deletion removes the account, revokes the key upstream, and frees the name", async () => {
    const r = await rig();
    const u = await newUser(r, "tenant-a.example.com", "deleteme.99");
    revokedBy.length = 0;
    expect(await r.provider.deleteUser("DELETEME.99")).toBe(true);
    await new Promise((x) => setTimeout(x, 50));
    expect(revokedBy).toHaveLength(1);
    expect(await r.store.getAccountByKey("deleteme.99")).toBeUndefined();
    expect((await act(r, u.tokens.access_token, "paperclip_list_agents", { companyId: CID })).status).toBe(401);
    expect(await r.provider.deleteUser("deleteme.99")).toBe(false);
    expect(await kinds(r)).toContain("left:deleteme.99/deleted");
    r.close();
  });

  it("listUsers never exposes secrets", async () => {
    const r = await rig();
    await newUser(r, "tenant-a.example.com", "og.kpnwrld");
    const users = await r.provider.listUsers();
    expect(users).toEqual([expect.objectContaining({ username: "og.kpnwrld", instance: "tenant-a.example.com", connected: true, liveGrants: 1 })]);
    expect(JSON.stringify(users)).not.toMatch(/scrypt|sealed|board-|pcs_/);
    r.close();
  });

  it("key rotation re-seals account credentials too", async () => {
    const A = "a".repeat(40), B = "b".repeat(40);
    const store = new MemoryStore(null);
    const r1 = await rig({}, { store, secret: A });
    const { tokens } = await newUser(r1, "tenant-a.example.com", "og.kpnwrld");
    const acct = (await store.getAccountByKey("og.kpnwrld"))!;
    const before = (await store.getLink(acct.id))!.sealedCredential!;
    r1.close();
    const r2 = await rig({ previousSecrets: [A] }, { store, secret: B });
    expect((await act(r2, tokens.access_token, "paperclip_list_agents", { companyId: CID })).status).toBe(200);
    expect(await r2.provider.rotateKeys()).toBe(1);
    expect((await store.getLink(acct.id))!.sealedCredential).not.toBe(before);
    expect(await r2.provider.rotateKeys()).toBe(0);
    r2.close();
    const r3 = await rig({}, { store, secret: B });
    expect((await act(r3, tokens.access_token, "paperclip_list_agents", { companyId: CID })).status).toBe(200);
    r3.close();
    const r4 = await rig({}, { store, secret: A });
    expect((await act(r4, tokens.access_token, "paperclip_list_agents", { companyId: CID })).status).toBe(401);
    r4.close();
  });
});

// ───────────── tenant isolation & runtime protections ─────────────
describe("tenant isolation", () => {
  it("each account reaches only its own instance with only its own credential", async () => {
    const r = await rig();
    const a = await newUser(r, "tenant-a.example.com", "alice.one1");
    const b = await newUser(r, "tenant-b.example.com", "bob.two22");
    seen.length = 0;
    await act(r, a.tokens.access_token, "paperclip_list_agents", { companyId: CID });
    await act(r, b.tokens.access_token, "paperclip_list_agents", { companyId: CID });
    await act(r, a.tokens.access_token, "paperclip_list_agents", { companyId: CID });
    expect(seen.map((s) => s.host)).toEqual(["tenant-a.example.com", "tenant-b.example.com", "tenant-a.example.com"]);
    for (const s of seen) expect(s.auth).toContain(s.host);
    seen.length = 0;
    await act(r, a.tokens.access_token, "paperclip_api_request", { method: "GET", path: "/companies" });
    const evil = await act(r, a.tokens.access_token, "paperclip_api_request", { method: "GET", path: "//evil.com/x" });
    expect(seen.every((s) => s.host === "tenant-a.example.com")).toBe(true);
    expect(evil.status).toBeGreaterThanOrEqual(400);
    r.close();
  });

  it("re-validates the stored instance on every call (tampered or newly-denied hosts are cut off)", async () => {
    const r = await rig();
    const { tokens } = await newUser(r, "tenant-a.example.com", "og.kpnwrld");
    expect((await act(r, tokens.access_token, "paperclip_list_companies")).status).toBe(200);
    const acct = (await r.store.getAccountByKey("og.kpnwrld"))!;
    const link = (await r.store.getLink(acct.id))!;
    await r.store.putLink({ ...link, instanceUrl: "https://localhost" });
    const before = outbound.length;
    expect((await act(r, tokens.access_token, "paperclip_list_companies")).status).toBe(401);
    expect(outbound.length).toBe(before);
    r.close();
  });

  it("limits calls per grant", async () => {
    const r = await rig({ callsPerMinute: 3 });
    const { tokens } = await newUser(r, "tenant-a.example.com", "og.kpnwrld");
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await act(r, tokens.access_token, "paperclip_list_companies")).status);
    expect(codes).toEqual([200, 200, 200, 429, 429]);
    r.clock.t += 61_000;
    expect((await act(r, tokens.access_token, "paperclip_list_companies")).status).toBe(200);
    r.close();
  });
});

/** Connect a brand-new user, optionally ticking the "install the plugin" box, and wait for the background install to finish. */
async function connectWithPlugin(r: Rig, host: string, username: string, tick: boolean) {
  plugins.delete(host);
  const s = await start(r);
  await toInstance(r, s);
  await step(r, s, "instance", { instance: host, ...(tick ? { install_plugin: "on" } : {}) });
  approve(host);
  await step(r, s, "approved");
  await step(r, s, "username", { username });
  await step(r, s, "continue");
  const tokens = await exchange(r, s, await step(r, s, "decision", { level: "paperclip:control" }));
  await r.provider.drainBackground();
  return { s, tokens };
}

describe("installing the Papercliped plugin during setup", () => {
  it("offers the checkbox, ticked by default", async () => {
    const r = await rig();
    const s = await start(r);
    const html = await toInstance(r, s);
    expect(html).toMatch(/name="install_plugin"[^>]* checked/);
    r.close();
  });

  it("installs the pinned package once, with the user's own approved key, and records one short event", async () => {
    const r = await rig();
    pluginCalls.length = 0;
    const { tokens } = await connectWithPlugin(r, "plug-a.example.com", "plug.user1", true);
    expect(tokens.access_token).toBeTruthy(); // the connection itself is unaffected
    const installs = pluginCalls.filter((c) => c.method === "POST");
    expect(installs).toHaveLength(1);
    expect(installs[0].body).toEqual({ packageName: "papercliped-paperclip-plugin", version: VERSION }); // fixed name, exact version, nothing user-supplied
    expect(installs[0].auth).toMatch(/^Bearer board-plug-a\.example\.com-/);
    expect(plugins.get("plug-a.example.com")).toBe(VERSION);
    expect(await kinds(r)).toContain("plugin/installed");
    r.close();
  });

  it("does nothing when the box is not ticked", async () => {
    const r = await rig();
    pluginCalls.length = 0;
    const { tokens } = await connectWithPlugin(r, "plug-b.example.com", "plug.user2", false);
    expect(tokens.access_token).toBeTruthy();
    expect(pluginCalls).toHaveLength(0);
    expect((await kinds(r)).some((k) => k.startsWith("plugin"))).toBe(false);
    r.close();
  });

  it("leaves an existing install alone", async () => {
    const r = await rig();
    pluginCalls.length = 0;
    const s = await start(r);
    await toInstance(r, s);
    await step(r, s, "instance", { instance: "plug-c.example.com", install_plugin: "on" });
    approve("plug-c.example.com");
    plugins.set("plug-c.example.com", "9.9.9");
    await step(r, s, "approved");
    await r.provider.drainBackground();
    expect(pluginCalls.filter((c) => c.method === "POST")).toHaveLength(0);
    expect(plugins.get("plug-c.example.com")).toBe("9.9.9");
    expect(await kinds(r)).toContain("plugin/already");
    r.close();
  });

  it.each([
    ["notadmin.example.com", "denied"],
    ["noplugins.example.com", "unsupported"],
    ["installfail.example.com", "failed"],
  ])("never blocks the connection when the install can't happen (%s)", async (host, outcome) => {
    const r = await rig();
    const { tokens } = await connectWithPlugin(r, host, "plug.user3", true);
    expect(tokens.access_token).toBeTruthy();
    expect(await kinds(r)).toContain(`plugin/${outcome}`);
    r.close();
  });
});

describe("instance step: SSRF and abuse", () => {
  const rejected = [
    "localhost", "http://tenant-a.example.com", "127.0.0.1", "https://127.1", "https://2130706433", "10.0.0.5", "169.254.169.254", "https://[::1]",
    "tenant-a.example.com:3100", "tenant-a.example.com:22", "intranet", "db.internal", "https://user:pw@tenant-a.example.com", "file:///etc/passwd", "ftp://tenant-a.example.com",
  ];
  it.each(rejected)("never contacts %j", async (typed) => {
    const r = await rig();
    const s = await start(r);
    await toInstance(r, s);
    const before = outbound.length;
    const res = await step(r, s, "instance", { instance: typed });
    expect(res.status).toBe(400);
    expect(outbound.length).toBe(before);
    expect(await res.text()).toMatch(/class="err"/);
    r.close();
  });

  it("refuses the bridge's own address (it must not proxy to itself)", async () => {
    const r = await rig({ instance: { allowedPorts: [443], denyHosts: ["bridge.example.com"], allowHosts: null } });
    const s = await start(r);
    await toInstance(r, s);
    const before = outbound.length;
    expect((await step(r, s, "instance", { instance: "bridge.example.com" })).status).toBe(400);
    expect(outbound.length).toBe(before);
    r.close();
  });

  it("honours a host allow-list for private betas", async () => {
    const r = await rig({ instance: { allowedPorts: [443], denyHosts: [], allowHosts: ["*.beta.example.com", "friend.example.org"] } });
    const s = await start(r);
    await toInstance(r, s);
    const before = outbound.length;
    const no = await step(r, s, "instance", { instance: "tenant-a.example.com" });
    expect(no.status).toBe(400);
    expect(await no.text()).toContain("not open to that host");
    expect(outbound.length).toBe(before);
    expect((await step(r, s, "instance", { instance: "x.beta.example.com" })).status).toBe(200);
    expect(hostAllowed("beta.example.com", ["*.beta.example.com"])).toBe(false);
    expect(hostAllowed("friend.example.org", ["friend.example.org"])).toBe(true);
    r.close();
  });

  const hostile: [string, RegExp][] = [
    ["tenant-notpaperclip.example.com", /did not respond like a Paperclip|non-JSON/],
    ["tenant-nofields.example.com", /did not respond like a Paperclip/],
    ["tenant-localtrusted.example.com", /local_trusted/],
    ["tenant-down.example.com", /Could not reach/],
    ["tenant-evilpath.example.com", /unexpected approval link/],
    ["tenant-badid.example.com", /invalid challenge id/],
  ];
  it.each(hostile)("handles a hostile or wrong server at %s without reaching the approval step", async (host, msg) => {
    const r = await rig();
    const s = await start(r);
    await toInstance(r, s);
    const res = await step(r, s, "instance", { instance: host });
    const html = await res.text();
    expect(res.status).toBe(400);
    expect(html).toMatch(msg);
    expect(html).not.toContain("evil.com");
    expect(html).not.toContain("Open Paperclip to approve");
    r.close();
  });

  it("caps instance attempts per request (probing through the bridge is bounded) and logs one failure", async () => {
    const r = await rig();
    const s = await start(r);
    await toInstance(r, s);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await step(r, s, "instance", { instance: `tenant-down${i}.example.com` })).status);
    expect(statuses.slice(0, 5)).toEqual([400, 400, 400, 400, 400]);
    expect(statuses[5]).toBe(429);
    const failed = (await kinds(r)).filter((e) => e.startsWith("connect_failed"));
    expect(failed).toEqual(["connect_failed/unreachable", "connect_failed/too_many_attempts"]);
    r.close();
  });

  it("a Paperclip that is unreachable at login time doesn't lock the user out", async () => {
    const r = await rig();
    const { secret } = await newUser(r, "tenant-a.example.com", "og.kpnwrld");
    unreachable.add("tenant-a.example.com");
    const { res, html } = await loginFlow(r, "og.kpnwrld", secret!);
    expect(res.status).toBe(502);
    expect(un(html)).toContain("couldn't reach your Paperclip");
    unreachable.delete("tenant-a.example.com");
    expect((await loginFlow(r, "og.kpnwrld", secret!)).res.status).toBe(200);
    r.close();
  });
});

// ───────────── Paperclip key rotation ─────────────
describe("Paperclip key rotation", () => {
  /** Move the bridge's clock and the fake Paperclip's together. */
  const advance = (r: Rig, ms: number) => {
    r.clock.t += ms;
    mockClock.offset += ms;
  };
  const creates = (host: string) => keyCalls.filter((c) => c.host === host && c.method === "POST");
  const lastAuth = (host: string) => seen.filter((x) => x.host === host).at(-1)?.auth;
  const firstKey = (host: string) => [...challenges.values()].find((c) => c.host === host && c.status === "approved")!.token;
  const call = (r: Rig, token: string) => act(r, token, "paperclip_list_companies");
  const LONG = { accessTtlSec: 90 * 86400 }; // the bridge's own token outlives the jumps in time
  beforeEach(() => {
    mockClock.offset = 0; // each rig's clock starts at the real time
  });

  it("leaves a key alone until a week before it expires", async () => {
    const r = await rig(LONG);
    const host = "rot-early.example.com";
    const u = await newUser(r, host, "rot.early1");
    advance(r, 22 * DAY);
    expect((await call(r, u.tokens.access_token)).status).toBe(200);
    expect(keyCalls.filter((c) => c.host === host)).toHaveLength(0);
    expect(lastAuth(host)).toBe(`Bearer ${firstKey(host)}`);
    r.close();
  });

  it("renews it in the last week: the new key is stored and used, the old one revoked, and it renews only once", async () => {
    const r = await rig(LONG);
    const host = "rot-due.example.com";
    const u = await newUser(r, host, "rot.due1");
    const old = firstKey(host);
    advance(r, 24 * DAY);
    expect((await call(r, u.tokens.access_token)).status).toBe(200);
    await r.provider.drainBackground();
    expect(creates(host)).toHaveLength(1);
    expect(creates(host)[0]).toMatchObject({ auth: `Bearer ${old}`, body: { name: "Papercliped (rot.due1)" } });
    expect(lastAuth(host)).toMatch(/^Bearer pcp_board_rot-due\.example\.com_/);
    expect(revokedBy).toContain(`${host}|Bearer ${old}`);
    expect(boardKeys.get(old)?.revoked).toBe(true);
    const link = (await r.store.getLink((await r.provider.listGrants())[0].accountId!))!;
    expect(link.credentialExpiresAt).toBe(boardKeys.get(lastAuth(host)!.slice(7))!.expiresAt);
    expect(JSON.stringify(link)).not.toContain("pcp_board_"); // stored sealed
    // still working days later, with no second renewal
    advance(r, 3 * DAY);
    expect((await call(r, u.tokens.access_token)).status).toBe(200);
    expect(creates(host)).toHaveLength(1);
    expect(await kinds(r)).toContain("key:rot.due1/rotated");
    expect(JSON.stringify(await r.store.userEventsRecent(0, 100))).not.toContain("pcp_board_");
    r.close();
  });

  it("a failed renewal keeps the working key, and is retried later", async () => {
    const r = await rig(LONG);
    const host = "rot-fail.example.com";
    const u = await newUser(r, host, "rot.fail1");
    const old = firstKey(host);
    failCreate.add(host);
    advance(r, 24 * DAY);
    expect((await call(r, u.tokens.access_token)).status).toBe(200);
    expect(creates(host)).toHaveLength(1);
    expect(lastAuth(host)).toBe(`Bearer ${old}`);
    expect(revokedBy).not.toContain(`${host}|Bearer ${old}`);
    expect(await kinds(r)).toContain("key:rot.fail1/failed");
    expect((await call(r, u.tokens.access_token)).status).toBe(200); // no retry storm
    expect(creates(host)).toHaveLength(1);
    failCreate.delete(host);
    advance(r, 11 * 60_000);
    expect((await call(r, u.tokens.access_token)).status).toBe(200);
    expect(creates(host)).toHaveLength(2);
    expect(lastAuth(host)).toMatch(/^Bearer pcp_board_/);
    r.close();
  });

  it("concurrent calls renew once, and every call uses a working key", async () => {
    const r = await rig(LONG);
    const host = "rot-race.example.com";
    const u = await newUser(r, host, "rot.race1");
    advance(r, 24 * DAY);
    const before = seen.length;
    const res = await Promise.all(Array.from({ length: 6 }, () => call(r, u.tokens.access_token)));
    expect(res.map((x) => x.status)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(creates(host)).toHaveLength(1);
    const used = new Set(seen.slice(before).filter((x) => x.host === host).map((x) => x.auth));
    expect([...used]).toEqual([expect.stringMatching(/^Bearer pcp_board_/)]);
    r.close();
  });

  it("a renewal racing a reconnect keeps the reconnected key and drops the one it made", async () => {
    const r = await rig(LONG);
    const host = "rot-swap.example.com";
    const u = await newUser(r, host, "rot.swap1");
    const accountId = (await r.provider.listGrants())[0].accountId!;
    const stored = (await r.store.getLink(accountId))!.sealedCredential!;
    // The user reconnects in another tab while the renewal is between "create" and "swap".
    const swap = r.store.swapCredential.bind(r.store);
    r.store.swapCredential = async (h, expect, next, exp) => {
      if (next !== expect) await swap(h, expect, "reconnected.sealed", null);
      return swap(h, expect, next, exp);
    };
    advance(r, 24 * DAY);
    await call(r, u.tokens.access_token);
    await r.provider.drainBackground();
    expect(creates(host)).toHaveLength(1);
    const made = [...boardKeys.values()].find((k) => k.host === host && k.token.startsWith("pcp_board_"))!;
    expect(made.revoked).toBe(true); // the key it made is dropped
    expect(boardKeys.get(firstKey(host))?.revoked).toBe(false); // the old one is not touched by the rotation
    expect((await r.store.getLink(accountId))!.sealedCredential).toBe("reconnected.sealed");
    expect(stored).not.toBe("reconnected.sealed");
    expect((await kinds(r)).filter((k) => k.startsWith("key"))).toEqual([]);
    r.close();
  });

  it("an older Paperclip whose keys never expire keeps working unchanged", async () => {
    const r = await rig(LONG);
    const host = "oldpaperclip-rot.example.com";
    const u = await newUser(r, host, "rot.old1");
    advance(r, 24 * DAY); // the stored estimate says due; Paperclip has no key API
    expect((await call(r, u.tokens.access_token)).status).toBe(200);
    expect(creates(host)).toHaveLength(0);
    const accountId = (await r.provider.listGrants())[0].accountId!;
    expect((await r.store.getLink(accountId))!.credentialExpiresAt).toBeNull();
    advance(r, 20 * DAY);
    const asked = keyCalls.length;
    expect((await call(r, u.tokens.access_token)).status).toBe(200);
    expect(keyCalls.length).toBe(asked); // never asks again
    expect(lastAuth(host)).toBe(`Bearer ${firstKey(host)}`);
    expect((await kinds(r)).filter((k) => k.startsWith("key"))).toEqual([]);
    r.close();
  });

  it("the periodic sweep renews keys of people who are not calling", async () => {
    const r = await rig(LONG);
    const host = "rot-sweep.example.com";
    const u = await newUser(r, host, "rot.sweep1");
    advance(r, 24 * DAY);
    await r.provider.sweep();
    await r.provider.drainBackground();
    expect(creates(host)).toHaveLength(1);
    expect((await call(r, u.tokens.access_token)).status).toBe(200);
    expect(creates(host)).toHaveLength(1);
    expect(lastAuth(host)).toMatch(/^Bearer pcp_board_/);
    r.close();
  });

  it("a key Paperclip already expired still gets the reconnect hint", async () => {
    const r = await rig(LONG);
    const host = "rot-late.example.com";
    const u = await newUser(r, host, "rot.late1");
    advance(r, 31 * DAY);
    const res = await call(r, u.tokens.access_token);
    expect(await res.text()).toContain("disconnect and reconnect the connector");
    expect(creates(host)).toHaveLength(0);
    expect(await kinds(r)).toContain("key:rot.late1/failed");
    advance(r, 11 * 60_000); // a dead key is not retried
    const asked = keyCalls.length;
    expect(await (await call(r, u.tokens.access_token)).text()).toContain("disconnect and reconnect the connector");
    await r.provider.sweep();
    expect(keyCalls.length).toBe(asked);
    expect((await kinds(r)).filter((k) => k.startsWith("key"))).toEqual(["key:rot.late1/failed"]);
    r.close();
  });
});

// ───────────── Postgres end to end ─────────────
describe.skipIf(!DB)("account flow on Postgres", () => {
  const opts = { connectionString: DB!, ssl: "off" as const };
  it("works end to end, and secrets never reach the database in the clear", async () => {
    const c = new pg.Client({ connectionString: DB });
    await c.connect();
    await c.query("drop schema if exists bridge cascade");
    await c.end();
    await migrate(opts);
    const clock = { t: Date.now() };
    const store = new PgStore(opts, () => clock.t);
    const r = await rig({}, { store });
    const u = await newUser(r, "tenant-pg.example.com", "pg.user007");
    expect((await act(r, u.tokens.access_token, "paperclip_list_companies")).status).toBe(200);
    const back = await loginFlow(r, "PG.user007", u.secret!);
    expect(back.html).toContain("Allow Claude?");
    // refresh rotation + reuse detection against Postgres
    const cid = (await r.provider.listGrants())[0].clientId;
    const next = (await (await fetch(`${r.base}/token`, form({ grant_type: "refresh_token", refresh_token: u.tokens.refresh_token, client_id: cid }))).json()) as any;
    expect((await act(r, next.access_token, "paperclip_list_companies")).status).toBe(200);
    expect(((await (await fetch(`${r.base}/token`, form({ grant_type: "refresh_token", refresh_token: u.tokens.refresh_token, client_id: cid }))).json()) as any).error).toBe("invalid_grant");
    expect((await act(r, next.access_token, "paperclip_list_companies")).status).toBe(401);
    // the whole schema, searched for anything sensitive
    const q = new pg.Client({ connectionString: DB });
    await q.connect();
    let dump = "";
    for (const t of ["accounts", "account_links", "grants", "tokens", "codes", "pending", "user_events", "audit_events"]) dump += JSON.stringify((await q.query(`select * from bridge.${t}`)).rows);
    await q.end();
    expect(dump).toContain("pg.user007");
    expect(dump).not.toContain(u.secret!);
    expect(dump).not.toContain(u.secret!.replace(/-/g, ""));
    expect(dump).not.toContain("board-tenant-pg");
    expect(dump).not.toContain(u.tokens.access_token);
    expect(dump).not.toContain(u.tokens.refresh_token);
    expect(await kinds(r)).toEqual(expect.arrayContaining(["joined:pg.user007/tenant-pg.example.com", "completed:pg.user007/new", "login:pg.user007/claude.ai"]));
    r.close();
    await store.close();
  });
});

// ───────────── misc ─────────────
describe("client IP for rate limiting", () => {
  const req = (xff: string | undefined, remote = "10.0.0.9") => ({ headers: xff ? { "x-forwarded-for": xff } : {}, socket: { remoteAddress: remote } }) as any;
  it("ignores X-Forwarded-For unless proxies are configured", () => expect(clientIp(req("1.2.3.4"), 0)).toBe("10.0.0.9"));
  it("takes the entry N hops from the right, so client-forged left entries don't count", () => {
    expect(clientIp(req("6.6.6.6, 203.0.113.7"), 1)).toBe("203.0.113.7");
    expect(clientIp(req("6.6.6.6, 203.0.113.7, 10.1.1.1"), 2)).toBe("203.0.113.7");
  });
  it("falls back to the socket when the header is too short or missing", () => {
    expect(clientIp(req(undefined), 1)).toBe("10.0.0.9");
    expect(clientIp(req("1.1.1.1"), 3)).toBe("10.0.0.9");
  });
});

describe("multi-tenant configuration", () => {
  const base = { BRIDGE_OAUTH: "1", BRIDGE_MODE: "multi", BRIDGE_SECRET: "s".repeat(32), DATABASE_URL: "postgresql://u:p@h/db" };
  const url = "https://bridge.example.com";
  it("accepts a safe public configuration, turns accounts on, and denies the bridge's own host by default", () => {
    const c = readOAuthConfig(base, url, null)!;
    expect(c).toMatchObject({ mode: "multi", accounts: true, login: "paperclip", idleRevokeDays: 30, callsPerMinute: 120 });
    expect(c.instance.denyHosts).toContain("bridge.example.com");
    expect(c.instance.allowedPorts).toEqual([443]);
    expect(c.database?.ssl).toBe("verify");
    expect(readOAuthConfig({ ...base, BRIDGE_MODE: "single" }, url, null)!.accounts).toBe(false);
  });
  it("refuses unsafe public setups", () => {
    expect(() => readOAuthConfig({ ...base, BRIDGE_LOGIN: "static" }, url, "tok")).toThrow(/BRIDGE_LOGIN=paperclip/);
    expect(() => readOAuthConfig(base, url, "tok")).toThrow(/BRIDGE_TOKEN must not be set/);
    expect(() => readOAuthConfig({ ...base, DATABASE_URL: "" }, url, null)).toThrow(/DATABASE_URL/);
    expect(readOAuthConfig({ ...base, DATABASE_URL: "", BRIDGE_ALLOW_EPHEMERAL: "1" }, url, null)).not.toBeNull();
    expect(() => readOAuthConfig({ ...base, BRIDGE_MODE: "nope" }, url, null)).toThrow(/BRIDGE_MODE/);
    expect(() => readOAuthConfig({ ...base, BRIDGE_SECRET_PREVIOUS: "short" }, url, null)).toThrow(/PREVIOUS/);
    expect(() => readOAuthConfig({ ...base, DATABASE_SSL: "maybe" }, url, null)).toThrow(/DATABASE_SSL/);
  });
  it("reads tuning knobs", () => {
    const c = readOAuthConfig({ ...base, BRIDGE_ALLOWED_PORTS: "443,8443", BRIDGE_INSTANCE_ALLOWLIST: "*.example.com", BRIDGE_IDLE_REVOKE_DAYS: "0", BRIDGE_PROXY_HOPS: "1", DATABASE_SSL: "require" }, url, null)!;
    expect(c.instance.allowedPorts).toEqual([443, 8443]);
    expect(c.instance.allowHosts).toEqual(["*.example.com"]);
    expect(c.idleRevokeDays).toBe(0);
    expect(c.proxyHops).toBe(1);
    expect(c.database?.ssl).toBe("require");
  });
});
