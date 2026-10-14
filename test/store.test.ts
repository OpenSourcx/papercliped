import { copyFileSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { consolidatedSql, migrate } from "../src/migrate.js";
import { PgStore, sslOption } from "../src/oauth/pg-store.js";
import { AliasTakenError, type Account, type AccountLink, type UserEvent } from "../src/accounts/types.js";
import { HIST_EDGES, type AuditRow } from "../src/telemetry/types.js";
import { PublicApiRoutes } from "../src/public-api/routes.js";
import { SECRET, seed as seedPublic } from "./public-api.fixture.js";
import { MemoryStore, type CodeRecord, type Grant, type PendingRecord, type Store } from "../src/oauth/store.js";

const DB = process.env.TEST_DATABASE_URL;

/** A login role for the least-privilege tests, with the same password as the admin URL (so the test can sign in as it). */
async function ensureRole(admin: pg.Client, role: "bridge_app" | "panel_ro") {
  const pw = decodeURIComponent(new URL(DB!).password).replace(/'/g, "''");
  await admin.query(`do $$ begin if not exists (select 1 from pg_roles where rolname='${role}') then create role ${role} login; end if; end $$`);
  await admin.query(`alter role ${role} login password '${pw}'`);
}
const clock = { t: 1_800_000_000_000 };
const now = () => clock.t;

const grant = (id: string, over: Partial<Grant> = {}): Grant => ({
  id, clientId: "c1", clientName: "Claude", userId: "u1", scopes: ["paperclip:read"], resource: "https://b/mcp",
  instanceUrl: "https://p.example.com", sealedCredential: "kid.sealed", createdAt: clock.t, lastUsedAt: clock.t, revoked: false, ...over,
});
const code = (over: Partial<CodeRecord> = {}): CodeRecord => ({
  clientId: "c1", redirectUri: "https://claude.ai/cb", codeChallenge: "x".repeat(43), scopes: ["paperclip:read"], clientName: "Claude",
  userId: "u1", instanceUrl: "https://p.example.com", sealedCredential: "kid.sealed", expiresAt: clock.t + 60_000, ...over,
});
const pending = (over: Partial<PendingRecord> = {}): PendingRecord => ({
  clientId: "c1", clientName: "Claude", redirectUri: "https://claude.ai/cb", state: "s", codeChallenge: "x".repeat(43), requestedMax: "paperclip:read",
  csrf: "csrf", attempts: 0, expiresAt: clock.t + 600_000, ...over,
});

function contract(name: string, make: () => Promise<Store>) {
  describe(`Store contract: ${name}`, () => {
    let s: Store;
    beforeAll(async () => {
      s = await make();
    });
    afterAll(async () => s.close());

    it("clients round-trip", async () => {
      await s.putClient({ id: "c1", name: "Claude", redirectUris: ["https://claude.ai/cb", "http://localhost/cb"], createdAt: clock.t, lastUsedAt: clock.t });
      expect(await s.getClient("c1")).toMatchObject({ name: "Claude", redirectUris: ["https://claude.ai/cb", "http://localhost/cb"] });
      expect(await s.getClient("nope")).toBeUndefined();
    });

    it("grants round-trip, including the tenant instance", async () => {
      await s.putGrant(grant("g1"));
      expect(await s.getGrant("g1")).toMatchObject(grant("g1"));
      expect((await s.listGrants()).map((g) => g.id)).toContain("g1");
    });

    it("revokeGrant drops the credential and every token, and returns what it dropped", async () => {
      await s.putGrant(grant("g2"));
      await s.putAccess("ha", { grantId: "g2", expiresAt: clock.t + 1000 });
      await s.putRefresh("hr", { grantId: "g2", expiresAt: clock.t + 1000 });
      expect(await s.getAccess("ha")).toBeDefined();
      expect(await s.revokeGrant("g2")).toBe("kid.sealed");
      expect(await s.getAccess("ha")).toBeUndefined();
      expect(await s.getRefresh("hr")).toBeUndefined();
      expect(await s.getGrant("g2")).toMatchObject({ revoked: true, sealedCredential: null });
      expect(await s.revokeGrant("g2")).toBeNull();
      expect(await s.revokeGrant("missing")).toBeNull();
    });

    it("tokens expire", async () => {
      await s.putAccess("hexp", { grantId: "g1", expiresAt: clock.t + 100 });
      expect(await s.getAccess("hexp")).toBeDefined();
      clock.t += 200;
      expect(await s.getAccess("hexp")).toBeUndefined();
    });

    it("refresh tokens are consumed exactly once, even under a race", async () => {
      await s.putRefresh("rr", { grantId: "g1", expiresAt: clock.t + 60_000 });
      const results = await Promise.all(Array.from({ length: 8 }, () => s.consumeRefresh("rr")));
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await s.getRefresh("rr")).toMatchObject({ consumed: true });
      expect(await s.consumeRefresh("nope")).toBe(false);
      expect(await s.findAnyToken("rr")).toBeDefined();
    });

    it("authorization codes are single-use under a race and report replays with the grant they made", async () => {
      await s.putCode("code1", code());
      const takes = await Promise.all(Array.from({ length: 8 }, () => s.takeCode("code1")));
      expect(takes.filter((t) => t.status === "ok")).toHaveLength(1);
      expect(takes.filter((t) => t.status === "replay")).toHaveLength(7);
      await s.setCodeGrant("code1", "g1");
      expect(await s.takeCode("code1")).toEqual({ status: "replay", grantId: "g1" });
      expect(await s.takeCode("never")).toEqual({ status: "missing" });
      await s.putCode("code2", code({ expiresAt: clock.t + 10 }));
      clock.t += 20;
      expect(await s.takeCode("code2")).toEqual({ status: "missing" });
    });

    it("pending consent requests round-trip, expire and count", async () => {
      await s.putPending("rid1", pending({ instanceUrl: "https://p.example.com", sealedChallenge: "kid.blob" }));
      expect(await s.getPending("rid1")).toMatchObject({ csrf: "csrf", instanceUrl: "https://p.example.com", sealedChallenge: "kid.blob", attempts: 0 });
      await s.putPending("rid1", pending({ attempts: 2 }));
      expect((await s.getPending("rid1"))?.attempts).toBe(2);
      expect(await s.countPending()).toBeGreaterThanOrEqual(1);
      await s.deletePending("rid1");
      expect(await s.getPending("rid1")).toBeUndefined();
      await s.putPending("rid2", pending({ expiresAt: clock.t + 10 }));
      clock.t += 20;
      expect(await s.getPending("rid2")).toBeUndefined();
    });

    it("rate limiting is a shared fixed window", async () => {
      const r = await Promise.all(Array.from({ length: 12 }, () => s.hit("k", 10, 1000)));
      expect(r.filter(Boolean)).toHaveLength(10);
      clock.t += 1001;
      expect(await s.hit("k", 10, 1000)).toBe(true);
      expect(await s.hit("other", 1, 1000)).toBe(true);
      expect(await s.hit("other", 1, 1000)).toBe(false);
    });

    it("lists idle grants and persists activity (throttled)", async () => {
      await s.putGrant(grant("g3", { lastUsedAt: clock.t - 40 * 86_400_000 }));
      await s.putGrant(grant("g4", { lastUsedAt: clock.t }));
      const idle = (await s.listIdleGrants(clock.t - 30 * 86_400_000)).map((g) => g.id);
      expect(idle).toContain("g3");
      expect(idle).not.toContain("g4");
      await s.touchGrant("g3");
      expect((await s.listIdleGrants(clock.t - 30 * 86_400_000)).map((g) => g.id)).not.toContain("g3");
    });

    it("keeps clients that have live grants and prunes idle unused ones", async () => {
      await s.putClient({ id: "c-idle", name: "x", redirectUris: ["https://claude.ai/x"], createdAt: clock.t, lastUsedAt: clock.t });
      clock.t += 8 * 86_400_000;
      await s.prune();
      expect(await s.getClient("c-idle")).toBeUndefined();
      expect(await s.getClient("c1")).toBeDefined(); // g1/g3/g4 are live grants of c1
    });

    it("ping works", async () => {
      await s.ping();
    });
  });
}

const T0 = 1_900_000_020_000; // fixed, aligned to a minute (divisible by 60_000)
const row = (o: Partial<AuditRow>): AuditRow => ({
  at: T0, node: "n1", kind: "tool", name: "t1", mutation: false, ok: true, status: null, errorClass: null, totalMs: 10, upstreamMs: 5, upstreamCalls: 1,
  scope: "paperclip:read", grantId: "g", client: "Claude", instance: "a.example.com", userId: "u", username: null, ...o,
});

function auditContract(name: string, make: () => Promise<Store>) {
  describe(`Audit contract: ${name}`, () => {
    let s: Store;
    beforeAll(async () => {
      s = await make();
      const rows: AuditRow[] = [];
      // t1: totals 10..100 (ten calls), upstream = half; call #9 is a 502 fault, call #10 a caller error
      for (let i = 1; i <= 10; i++) {
        rows.push(row({ at: T0 + i * 1000, totalMs: i * 10, upstreamMs: i * 5, ok: i < 9, status: i === 9 ? 502 : i === 10 ? 400 : null, errorClass: i === 9 ? "upstream_5xx" : i === 10 ? "invalid_input" : null, mutation: i === 1 }));
      }
      // t2 on another tenant, slow, in the NEXT minute; one call never reached Paperclip (no upstream)
      rows.push(row({ at: T0 + 61_000, name: "t2", instance: "b.example.com", totalMs: 3500, upstreamMs: 3400 }));
      rows.push(row({ at: T0 + 62_000, name: "t2", instance: "b.example.com", totalMs: 7, upstreamMs: 0, upstreamCalls: 0, ok: false, status: 403, errorClass: "insufficient_scope" }));
      // http noise must never leak into tool aggregates
      rows.push(row({ at: T0 + 5_000, kind: "http", name: "oauth.token", instance: null, grantId: null, totalMs: 99_999, upstreamMs: null, upstreamCalls: null }));
      await s.insertAudit(rows);
    });
    afterAll(async () => s.close());

    it("totals: percentiles are linear-interpolated, faults are separated from caller errors, http is excluded", async () => {
      const t = await s.auditTotals("tool", T0, T0 + 120_000);
      expect(t).toMatchObject({ count: 12, errors: 3, faults: 1, mutations: 1 });
      // 12 sorted totals: 7,10,20,...,100,3500
      expect(t.p50).toBeCloseTo(55, 5);
      expect(t.p99).toBeGreaterThan(3000);
      expect(t.p99).toBeLessThanOrEqual(3500);
      expect(t.upstreamP95).toBeGreaterThan(0); // only rows with upstream calls
      expect(t.bridgeP95).toBeGreaterThan(0);
      expect((await s.auditTotals("http", T0, T0 + 120_000)).count).toBe(1);
      expect((await s.auditTotals("tool", T0 + 500_000, T0 + 600_000)).count).toBe(0);
    });

    it("series: buckets by time with per-bucket percentiles and latency split", async () => {
      const b = await s.auditSeries("tool", T0, T0 + 120_000, 60_000);
      expect(b.map((x) => x.t)).toEqual([T0, T0 + 60_000]);
      expect(b[0]).toMatchObject({ count: 10, errors: 2, faults: 1 });
      expect(b[0].p50).toBeCloseTo(55, 5);
      expect(b[0].p95).toBeCloseTo(95.5, 5);
      expect(b[0].p99).toBeCloseTo(99.1, 5);
      expect(b[0].avgUpstream).toBeCloseTo(27.5, 5); // 5..50 step 5
      expect(b[0].avgBridge).toBeCloseTo(27.5, 5);
      expect(b[1]).toMatchObject({ count: 2, errors: 1, faults: 0 });
      expect(b[1].avgBridge).toBeCloseTo((100 + 7) / 2, 5); // t2#1: 3500-3400=100; t2#2: 7-0=7
    });

    it("breakdowns by tool, tenant and error class", async () => {
      const byTool = await s.auditBreakdown("tool", "name", T0, T0 + 120_000, 10);
      expect(byTool.map((x) => [x.key, x.count])).toEqual([["t1", 10], ["t2", 2]]);
      expect(byTool[0]).toMatchObject({ errors: 2, faults: 1 });
      const byInst = await s.auditBreakdown("tool", "instance", T0, T0 + 120_000, 10);
      expect(byInst.find((x) => x.key === "b.example.com")).toMatchObject({ count: 2, errors: 1 });
      expect(byInst.find((x) => x.key === "b.example.com")!.upstreamP95).toBeGreaterThan(3000);
      const byErr = await s.auditBreakdown("tool", "errorClass", T0, T0 + 120_000, 10);
      expect(byErr.map((x) => x.key).sort()).toEqual(["insufficient_scope", "invalid_input", "upstream_5xx"]);
      expect((await s.auditBreakdown("tool", "name", T0, T0 + 120_000, 1))).toHaveLength(1);
    });

    it("histogram uses the shared bucket edges", async () => {
      const h = await s.auditHistogram("tool", T0, T0 + 120_000);
      expect(h).toHaveLength(HIST_EDGES.length + 1);
      // <25: 7,10,20 · 25–50: 30,40 · 50–100: 50,60,70,80,90 · 100–200: 100 · … ≥3200: 3500
      expect(h.slice(0, 4)).toEqual([3, 2, 5, 1]);
      expect(h.at(-1)).toBe(1);
      expect(h.reduce((a, b) => a + b, 0)).toBe(12);
    });

    it("slowest and recent", async () => {
      const slow = await s.auditSlowest("tool", T0, T0 + 120_000, 3);
      expect(slow.map((r) => r.totalMs)).toEqual([3500, 100, 90]);
      const recent = await s.auditRecent(0, 4);
      expect(recent).toHaveLength(4);
      expect(recent[0].id!).toBeGreaterThan(recent[1].id!); // newest first
      const tail = await s.auditRecent(recent[3].id!, 50);
      expect(tail.map((r) => r.id)).toEqual(recent.slice(0, 3).map((r) => r.id));
      expect(await s.auditRecent(recent[0].id!, 50)).toEqual([]);
    });

    it("prunes by age", async () => {
      await s.insertAudit([row({ at: T0 - 90 * 86_400_000, name: "ancient" })]);
      expect(await s.pruneAudit(T0 - 30 * 86_400_000)).toBe(1);
      expect(await s.pruneAudit(T0 - 30 * 86_400_000)).toBe(0);
      expect((await s.auditTotals("tool", T0, T0 + 120_000)).count).toBe(12);
    });

    it("breaks down by username (and ignores calls with none)", async () => {
      const W = T0 + 5_000_000; // an isolated window, so the shared dataset above is untouched
      await s.insertAudit([row({ at: W + 10, name: "u1", username: "og.kpnwrld", totalMs: 40 }), row({ at: W + 11, name: "u1", username: "og.kpnwrld", totalMs: 60, ok: false, errorClass: "upstream_5xx", status: 502 }), row({ at: W + 12, name: "u1", username: "second.user2", totalMs: 10 }), row({ at: W + 13, name: "u1", username: null, totalMs: 10 })]);
      const by = await s.auditBreakdown("tool", "username", W, W + 1000, 10);
      expect(by.map((x) => [x.key, x.count, x.faults])).toEqual([["og.kpnwrld", 2, 1], ["second.user2", 1, 0]]);
    });

    it("an empty window is all zeros, not an error", async () => {
      expect(await s.auditTotals("tool", 1, 2)).toMatchObject({ count: 0, p95: 0, upstreamP95: 0 });
      expect(await s.auditSeries("tool", 1, 2, 1000)).toEqual([]);
    });
  });
}

describe("docs/supabase-schema.sql", () => {
  it("is exactly what the migrations generate (run `npm run schema:sql` after changing migrations/)", () => {
    expect(readFileSync(new URL("../docs/supabase-schema.sql", import.meta.url), "utf8").replace(/\r\n/g, "\n")).toBe(consolidatedSql());
  });
});

const acct = (id: string, username: string, o: Partial<Account> = {}): Account => ({ id, username, usernameKey: username.toLowerCase(), secretHash: "scrypt$16384$8$1$c2FsdA==$aGFzaA==", createdAt: T0, lastLoginAt: null, disabled: false, ...o });
const link = (accountId: string, o: Partial<AccountLink> = {}): AccountLink => ({ accountId, instanceUrl: "https://p.example.com", paperclipUserId: `pu-${accountId}`, sealedCredential: "kid.sealed", createdAt: T0, connectedAt: T0, lastUsedAt: T0, ...o });
const ev = (o: Partial<UserEvent> = {}): UserEvent => ({ at: T0, accountId: "a1", username: "og.kpnwrld", kind: "joined", detail: null, ...o });

function accountContract(name: string, make: () => Promise<Store>) {
  describe(`Account contract: ${name}`, () => {
    let s: Store;
    beforeAll(async () => {
      s = await make();
    });
    afterAll(async () => s.close());

    it("usernames are unique case-insensitively, even under a race", async () => {
      const wins = await Promise.all(Array.from({ length: 8 }, (_, i) => s.createAccount(acct(`race${i}`, i % 2 ? "Race.User1" : "race.user1"))));
      expect(wins.filter(Boolean)).toHaveLength(1);
      expect(await s.createAccount(acct("x", "RACE.USER1"))).toBe(false);
      const found = await s.getAccountByKey("race.user1");
      expect(found?.usernameKey).toBe("race.user1");
      expect(await s.getAccountByKey("nobody.1")).toBeUndefined();
    });

    it("accounts round-trip and update", async () => {
      expect(await s.createAccount(acct("a1", "og.kpnwrld"))).toBe(true);
      expect(await s.getAccount("a1")).toMatchObject({ username: "og.kpnwrld", usernameKey: "og.kpnwrld", lastLoginAt: null, disabled: false });
      await s.setAccountSecret("a1", "scrypt$16384$8$1$bmV3$aGFzaDI=");
      await s.touchAccountLogin("a1", T0 + 5);
      expect(await s.getAccount("a1")).toMatchObject({ secretHash: "scrypt$16384$8$1$bmV3$aGFzaDI=", lastLoginAt: T0 + 5 });
      expect(await s.countAccounts()).toBeGreaterThanOrEqual(2);
      expect((await s.listAccounts(100)).map((a) => a.id)).toContain("a1");
      expect(await s.getAccount("nope")).toBeUndefined();
    });

    it("an account's access policy and a session's limits round-trip, replace, and clear", async () => {
      await s.createAccount(acct("pol1", "policy.user1"));
      expect((await s.getAccount("pol1"))?.policy ?? null).toBeNull(); // untouched = Full for every agent
      expect(await s.setAccountPolicy("pol1", { mode: "agent", agents: { a1: "off", a2: "api" } })).toBe(true);
      expect((await s.getAccount("pol1"))?.policy).toEqual({ mode: "agent", agents: { a1: "off", a2: "api" } });
      expect(await s.setAccountPolicy("pol1", { mode: "full", agents: {} })).toBe(true);
      expect((await s.getAccount("pol1"))?.policy).toEqual({ mode: "full", agents: {} });
      expect(await s.setAccountPolicy("nobody", { mode: "api", agents: {} })).toBe(false);

      await s.putGrant(grant("gp1", { accountId: "pol1", scopes: ["paperclip:control"] }));
      expect((await s.getGrant("gp1"))?.policy ?? null).toBeNull();
      expect(await s.setGrantPolicy("gp1", { label: "Phone", tools: ["paperclip_list_agents"], agents: ["a1"] })).toBe(true);
      expect((await s.getGrant("gp1"))?.policy).toEqual({ label: "Phone", tools: ["paperclip_list_agents"], agents: ["a1"] });
      expect((await s.listAccountGrants("pol1")).find((g) => g.id === "gp1")?.policy).toEqual({ label: "Phone", tools: ["paperclip_list_agents"], agents: ["a1"] });
      expect(await s.setGrantPolicy("gp1", null)).toBe(true);
      expect((await s.getGrant("gp1"))?.policy ?? null).toBeNull();
      expect(await s.setGrantPolicy("missing", { label: null, tools: null, agents: null })).toBe(false);
      await s.revokeGrant("gp1");
      expect(await s.setGrantPolicy("gp1", { label: "x", tools: null, agents: null })).toBe(false); // a revoked session can't be edited
    });

    it("recent calls are found by session, newest first, and only for the sessions asked about", async () => {
      const row = (at: number, grantId: string | null, name: string, over: Partial<AuditRow> = {}): AuditRow => ({ at, node: "n", kind: "tool", name, mutation: false, ok: true, status: null, errorClass: null, totalMs: 5, upstreamMs: null, upstreamCalls: null, scope: null, grantId, client: "Claude", instance: null, userId: null, username: null, ...over });
      await s.insertAudit([row(T0 + 1, "rc_a", "first"), row(T0 + 2, "rc_b", "other"), row(T0 + 3, "rc_a", "second", { ok: false, status: 403, errorClass: "policy_blocked" }), row(T0 + 4, null, "nobody"), row(T0 + 5, "rc_a", "http", { kind: "http" })]);
      const calls = await s.recentCallsForGrants(["rc_a"], 10);
      expect(calls.map((r) => r.name)).toEqual(["second", "first"]); // newest first; other sessions, no-session rows and http rows excluded
      expect(calls[0]).toMatchObject({ ok: false, errorClass: "policy_blocked", status: 403 });
      expect((await s.recentCallsForGrants(["rc_a"], 1)).map((r) => r.name)).toEqual(["second"]);
      expect((await s.recentCallsForGrants(["rc_a", "rc_b"], 10)).map((r) => r.name)).toEqual(["second", "other", "first"]);
      expect(await s.recentCallsForGrants([], 10)).toEqual([]);
      expect(await s.recentCallsForGrants(["unknown"], 10)).toEqual([]);
    });

    it("one link per account; a Paperclip identity can belong to only one account", async () => {
      await s.createAccount(acct("a2", "second.user2"));
      expect(await s.putLink(link("a1", { paperclipUserId: "pu-shared" }))).toBe(true);
      expect(await s.getLink("a1")).toMatchObject({ instanceUrl: "https://p.example.com", paperclipUserId: "pu-shared", sealedCredential: "kid.sealed" });
      expect((await s.getLinkByIdentity("https://p.example.com", "pu-shared"))?.accountId).toBe("a1");
      expect(await s.getLinkByIdentity("https://p.example.com", "other")).toBeUndefined();
      expect(await s.getLinkByIdentity("https://other.example.com", "pu-shared")).toBeUndefined();
      // another account may not claim the same identity
      expect(await s.putLink(link("a2", { paperclipUserId: "pu-shared" }))).toBe(false);
      expect(await s.getLink("a2")).toBeUndefined();
      // same identity on a different instance is a different identity
      expect(await s.putLink(link("a2", { instanceUrl: "https://elsewhere.example.com", paperclipUserId: "pu-shared" }))).toBe(true);
      // replacing your own link works (reconnect)
      expect(await s.putLink(link("a1", { paperclipUserId: "pu-shared", sealedCredential: "kid.newkey", connectedAt: T0 + 9 }))).toBe(true);
      expect(await s.getLink("a1")).toMatchObject({ sealedCredential: "kid.newkey", connectedAt: T0 + 9 });
    });

    it("links with no known identity don't collide", async () => {
      await s.createAccount(acct("a3", "third.user33"));
      await s.createAccount(acct("a4", "fourth.user4"));
      expect(await s.putLink(link("a3", { paperclipUserId: null }))).toBe(true);
      expect(await s.putLink(link("a4", { paperclipUserId: null }))).toBe(true);
    });

    it("drops credentials without deleting the account, and finds idle links", async () => {
      // relative to the store's own clock (touchLink stamps "now")
      await s.putLink(link("a3", { paperclipUserId: "pu-3", lastUsedAt: clock.t - 40 * 86_400_000 }));
      await s.putLink(link("a4", { paperclipUserId: "pu-4", lastUsedAt: clock.t }));
      expect((await s.listIdleLinks(clock.t - 30 * 86_400_000)).map((l) => l.accountId)).toEqual(["a3"]);
      await s.touchLink("a3");
      expect(await s.listIdleLinks(clock.t - 30 * 86_400_000)).toEqual([]);
      expect(await s.dropLinkCredential("a3")).toBe("kid.sealed");
      expect(await s.dropLinkCredential("a3")).toBeNull();
      expect((await s.getLink("a3"))?.sealedCredential).toBeNull();
      expect(await s.getAccount("a3")).toBeDefined();
      expect(await s.dropLinkCredential("ghost")).toBeNull();
    });

    it("grants carry their account; revoking an account's grants leaves others alone", async () => {
      const g = (id: string, accountId: string | null, username: string | null): Grant => ({ ...grant(id), accountId, username, sealedCredential: null });
      await s.putGrant(g("ga1", "a1", "og.kpnwrld"));
      await s.putGrant(g("ga2", "a1", "og.kpnwrld"));
      await s.putGrant(g("gb1", "a2", "second.user2"));
      expect(await s.getGrant("ga1")).toMatchObject({ accountId: "a1", username: "og.kpnwrld", sealedCredential: null });
      await s.putAccess("tok-a1", { grantId: "ga1", expiresAt: clock.t + 1e9 });
      await s.putRefresh("ref-a2", { grantId: "ga2", expiresAt: clock.t + 1e9 });
      await s.putAccess("tok-b1", { grantId: "gb1", expiresAt: clock.t + 1e9 });
      expect(await s.countLiveGrants("a1")).toBe(2);
      expect(await s.revokeAccountGrants("a1")).toBe(2);
      expect(await s.countLiveGrants("a1")).toBe(0);
      expect(await s.getAccess("tok-a1")).toBeUndefined();
      expect(await s.getRefresh("ref-a2")).toBeUndefined();
      expect(await s.getAccess("tok-b1")).toBeDefined();
      expect(await s.countLiveGrants("a2")).toBe(1);
      expect(await s.revokeAccountGrants("a1")).toBe(0);
    });

    it("deleting an account removes everything and returns the credential to revoke upstream", async () => {
      await s.createAccount(acct("a9", "deleteme.99"));
      await s.putLink(link("a9", { paperclipUserId: "pu-9", sealedCredential: "kid.todelete" }));
      await s.putGrant({ ...grant("g9"), accountId: "a9", username: "deleteme.99", sealedCredential: null });
      await s.putAccess("tok-9", { grantId: "g9", expiresAt: clock.t + 1e9 });
      expect(await s.deleteAccount("a9")).toEqual({ sealedCredential: "kid.todelete", instanceUrl: "https://p.example.com" });
      expect(await s.getAccount("a9")).toBeUndefined();
      expect(await s.getLink("a9")).toBeUndefined();
      expect(await s.getAccountByKey("deleteme.99")).toBeUndefined();
      expect((await s.getGrant("g9"))?.revoked).toBe(true);
      expect(await s.getAccess("tok-9")).toBeUndefined();
      expect(await s.createAccount(acct("a9b", "deleteme.99"))).toBe(true); // the name is free again
      expect(await s.deleteAccount("a9")).toBeNull();
    });

    it("user events: newest first, incremental, counted by kind with failure reasons", async () => {
      await s.insertUserEvent(ev({ kind: "started", username: null, accountId: null, at: T0 + 1000 }));
      await s.insertUserEvent(ev({ kind: "joined", at: T0 + 2000 }));
      await s.insertUserEvent(ev({ kind: "completed", detail: "new", at: T0 + 3000 }));
      await s.insertUserEvent(ev({ kind: "connect_failed", detail: "denied", username: null, accountId: null, at: T0 + 4000 }));
      await s.insertUserEvent(ev({ kind: "login_failed", detail: "bad_secret", username: null, accountId: null, at: T0 + 5000 }));
      await s.insertUserEvent(ev({ kind: "login_failed", detail: "bad_secret", username: null, accountId: null, at: T0 + 5500 }));
      await s.insertUserEvent(ev({ kind: "left", detail: "idle", at: T0 + 6000 }));
      const recent = await s.userEventsRecent(0, 3);
      expect(recent.map((e) => e.kind)).toEqual(["left", "login_failed", "login_failed"]);
      expect(recent[0]).toMatchObject({ username: "og.kpnwrld", detail: "idle", accountId: "a1" });
      const after = await s.userEventsRecent(recent[2].id!, 50);
      expect(after.map((e) => e.id)).toEqual(recent.slice(0, 2).map((e) => e.id));
      const c = await s.userEventCounts(T0, T0 + 10_000);
      expect(c.byKind).toMatchObject({ started: 1, joined: 1, completed: 1, connect_failed: 1, login_failed: 2, left: 1 });
      expect(c.failures).toEqual({ "connect_failed:denied": 1, "login_failed:bad_secret": 2 });
      expect((await s.userEventCounts(T0 + 7000, T0 + 8000)).byKind).toEqual({});
    });

    it("event series buckets completed / failed / joined", async () => {
      const b = await s.userEventSeries(T0, T0 + 120_000, 60_000);
      expect(b).toEqual([{ t: T0, completed: 1, failed: 3, joined: 1 }]);
    });

    it("heartbeat is repeatable", async () => {
      await s.heartbeat();
      await s.heartbeat();
    });

    it("counts distinct active usernames from the audit trail", async () => {
      await s.insertAudit([row({ at: T0 + 1, username: "og.kpnwrld" }), row({ at: T0 + 2, username: "og.kpnwrld" }), row({ at: T0 + 3, username: "second.user2" }), row({ at: T0 + 4, username: null }), row({ at: T0 + 9_000_000, username: "far.future9" })]);
      expect(await s.auditActiveUsers(T0, T0 + 1000)).toBe(2);
      expect(await s.auditActiveUsers(T0, T0 + 10_000_000)).toBe(3);
      expect(await s.auditActiveUsers(T0 + 100_000_000, T0 + 200_000_000)).toBe(0);
    });

    it("anonymity: toggling rewrites what logs, grants, audit rows and the instance label show — for that account only", async () => {
      const W = T0 + 8_000_000; // an isolated window (other tests use +5M and +9M)
      const mkAudit = (username: string, instance: string, i: number) => row({ at: W + i, name: "pv", username, instance });
      await s.createAccount(acct("pv1", "private.user1"));
      await s.createAccount(acct("pv2", "other.person2"));
      await s.putLink(link("pv1", { paperclipUserId: "pu-pv1", instanceLabel: "acme.paperclip.dev" }));
      await s.putLink(link("pv2", { paperclipUserId: "pu-pv2", instanceLabel: "other.example.com" }));
      await s.putGrant({ ...grant("gpv1"), accountId: "pv1", username: "private.user1", sealedCredential: null });
      await s.putGrant({ ...grant("gpv2"), accountId: "pv2", username: "other.person2", sealedCredential: null });
      await s.insertUserEvent(ev({ at: W, accountId: "pv1", username: "private.user1", kind: "joined", detail: "acme.paperclip.dev" }));
      await s.insertUserEvent(ev({ at: W + 1, accountId: "pv2", username: "other.person2", kind: "login" }));
      await s.insertAudit([mkAudit("private.user1", "acme.paperclip.dev", 1), mkAudit("other.person2", "other.example.com", 2)]);

      expect(await s.setAccountPrivacy("pv1", { anonymous: true, alias: "Ann02", display: "Ann02", prevDisplay: "private.user1", instanceLabel: "anon-3f9a1c", prevInstanceLabel: "acme.paperclip.dev" })).toBe("ok");
      expect(await s.getAccount("pv1")).toMatchObject({ username: "private.user1", anonymous: true, alias: "Ann02" }); // the real name is kept for login
      expect((await s.getLink("pv1"))?.instanceLabel).toBe("anon-3f9a1c");
      expect((await s.getGrant("gpv1"))?.username).toBe("Ann02");
      const seen = JSON.stringify([await s.userEventsRecent(0, 500), await s.auditRecent(0, 500)]);
      expect(seen).not.toContain("private.user1");
      expect(seen).not.toContain("acme.paperclip.dev");
      expect(seen).toContain("Ann02");
      expect(seen).toContain("anon-3f9a1c");
      // another account is untouched
      expect((await s.getGrant("gpv2"))?.username).toBe("other.person2");
      expect(seen).toContain("other.person2");
      expect(seen).toContain("other.example.com");
      expect(await s.auditActiveUsers(W, W + 1000)).toBe(2);
      const by = (await s.auditBreakdown("tool", "username", W, W + 1000, 10)).map((x) => x.key).sort();
      expect(by).toEqual(["Ann02", "other.person2"]);

      // and back: the alias is stable, history follows
      expect(await s.setAccountPrivacy("pv1", { anonymous: false, alias: "Ann02", display: "private.user1", prevDisplay: "Ann02", instanceLabel: "acme.paperclip.dev", prevInstanceLabel: "anon-3f9a1c" })).toBe("ok");
      expect(await s.getAccount("pv1")).toMatchObject({ anonymous: false, alias: "Ann02" });
      expect(JSON.stringify(await s.auditRecent(0, 500))).toContain("private.user1");
    });

    it("aliases are unique (case-insensitively) and a clash is reported, not swallowed", async () => {
      await s.createAccount(acct("al1", "alias.holder1", { anonymous: true, alias: "Bob07" }));
      await expect(s.createAccount(acct("al2", "alias.holder2", { anonymous: true, alias: "bob07" }))).rejects.toBeInstanceOf(AliasTakenError);
      expect(await s.getAccount("al2")).toBeUndefined();
      await s.createAccount(acct("al3", "alias.holder3"));
      expect(await s.setAccountPrivacy("al3", { anonymous: true, alias: "BOB07", display: "BOB07", prevDisplay: "alias.holder3", instanceLabel: "anon-1", prevInstanceLabel: "x" })).toBe("alias_taken");
      expect((await s.getAccount("al3"))?.anonymous).toBeFalsy(); // nothing half-applied
      expect(await s.setAccountPrivacy("nope", { anonymous: true, alias: "Zed99", display: "Zed99", prevDisplay: "a", instanceLabel: "b", prevInstanceLabel: "c" })).toBe("missing");
    });

    it("node samples and the live grant count", async () => {
      await s.recordNodeSample({ at: T0 + 100, node: "n1", dbPingMs: 4.5, loopLagP99Ms: 2, rssMb: 90, heapMb: 40, uptimeS: 10, version: "1.0.0" });
      await s.recordNodeSample({ at: T0 + 200, node: "n1", dbPingMs: null, loopLagP99Ms: 3, rssMb: 91, heapMb: 41, uptimeS: 40, version: "1.0.0" });
      const got = await s.nodeSamples(T0);
      expect(got.map((x) => x.at)).toEqual([T0 + 200, T0 + 100]); // newest first
      expect(got[1]).toMatchObject({ node: "n1", dbPingMs: 4.5, rssMb: 90, version: "1.0.0" });
      expect(got[0].dbPingMs).toBeNull();
      expect(await s.nodeSamples(T0 + 150)).toHaveLength(1);
      expect(await s.liveGrantCount()).toBeGreaterThanOrEqual(0);
    });

    it("a stored Paperclip key is swapped only while it is still the one stored, and expiring keys are listed", async () => {
      const DAY = 86_400_000;
      await s.createAccount(acct("rot1", "rotate.user1"));
      await s.createAccount(acct("rot2", "rotate.user2"));
      expect(await s.putLink(link("rot1", { sealedCredential: "k1.sealed", credentialExpiresAt: T0 + 3 * DAY }))).toBe(true);
      expect(await s.putLink(link("rot2", { sealedCredential: "k2.sealed", credentialExpiresAt: null }))).toBe(true); // never expires
      const soon = (await s.listExpiringLinks(T0 + 7 * DAY)).map((l) => l.accountId);
      expect(soon).toContain("rot1");
      expect(soon).not.toContain("rot2");
      expect((await s.getLink("rot2"))?.credentialExpiresAt).toBeNull();

      const h = { kind: "link" as const, id: "rot1" };
      expect(await s.swapCredential(h, "k1.sealed", "k1b.sealed", T0 + 30 * DAY)).toBe(true);
      expect(await s.getLink("rot1")).toMatchObject({ sealedCredential: "k1b.sealed", credentialExpiresAt: T0 + 30 * DAY });
      expect(await s.swapCredential(h, "k1.sealed", "late.sealed", T0)).toBe(false); // already replaced
      expect((await s.listExpiringLinks(T0 + 7 * DAY)).map((l) => l.accountId)).not.toContain("rot1");
      await s.dropLinkCredential("rot1");
      expect(await s.swapCredential(h, "k1b.sealed", "x.sealed", T0)).toBe(false); // dropped
      expect(await s.swapCredential({ kind: "link", id: "nobody" }, "a", "b", null)).toBe(false);

      await s.putGrant(grant("grot1", { sealedCredential: "g.sealed", credentialExpiresAt: T0 + DAY }));
      await s.putGrant(grant("grot2", { sealedCredential: "g2.sealed", credentialExpiresAt: null }));
      const due = (await s.listExpiringGrants(T0 + 7 * DAY)).map((g) => g.id);
      expect(due).toContain("grot1");
      expect(due).not.toContain("grot2");
      const g = { kind: "grant" as const, id: "grot1" };
      expect(await s.swapCredential(g, "g.sealed", "g.sealed", null)).toBe(true); // expiry only
      expect(await s.getGrant("grot1")).toMatchObject({ sealedCredential: "g.sealed", credentialExpiresAt: null });
      await s.revokeGrant("grot1");
      expect(await s.swapCredential(g, "g.sealed", "g3.sealed", T0)).toBe(false);
      expect((await s.listExpiringGrants(T0 + 7 * DAY)).map((x) => x.id)).not.toContain("grot1");
    });

    it("prune removes old events along with old audit rows", async () => {
      await s.insertUserEvent(ev({ at: T0 - 90 * 86_400_000, kind: "joined", username: "ancient.1" }));
      await s.pruneAudit(T0 - 30 * 86_400_000);
      const all = await s.userEventCounts(T0 - 100 * 86_400_000, T0 - 80 * 86_400_000);
      expect(all.byKind).toEqual({});
    });
  });
}

contract("memory", async () => new MemoryStore(null, now));
auditContract("memory", async () => new MemoryStore(null, now));
accountContract("memory", async () => new MemoryStore(null, now));

describe.skipIf(!DB)("Postgres", () => {
  const opts = { connectionString: DB!, ssl: "off" as const };
  const reset = async () => {
    const c = new pg.Client({ connectionString: DB });
    await c.connect();
    await c.query("drop schema if exists bridge cascade");
    // Simulate Supabase's API roles so we can prove they're locked out.
    for (const r of ["anon", "authenticated"]) await c.query(`do $$ begin if not exists (select 1 from pg_roles where rolname='${r}') then create role ${r} nologin; end if; end $$`);
    await c.end();
  };

  it("the public API aggregates from Postgres and leaks nothing identifying", async () => {
    await reset();
    await migrate(opts);
    const t = Date.now();
    const pgs = new PgStore(opts, () => t);
    try {
      await seedPublic(pgs, t);
      const p = new PublicApiRoutes({ store: pgs, version: "2.0.0", docsUrl: "x", now: () => t });
      const s = await p.stats("1h");
      expect(s).toMatchObject({ users: { total: 1, new: 1 }, connections: { live: 1 }, auth: { flowsStarted: 3, flowsCompleted: 1 } });
      expect(s.requests.count).toBe(5);
      expect(s.requests.byTool).toEqual({ paperclip_list_agents: 3, paperclip_pause_agent: 1 });
      const all = JSON.stringify([s, await p.series("24h"), await p.errors("7d"), await p.status()]);
      for (const x of SECRET) expect(all, x).not.toContain(x);
    } finally {
      await pgs.close();
    }
  });

  it("migrates once, idempotently", async () => {
    await reset();
    expect(await migrate(opts)).toEqual(["001_init.sql", "002_audit.sql", "003_accounts.sql", "004_privacy_panel.sql", "005_beta.sql", "006_two_levels.sql", "007_control_room.sql", "008_key_rotation.sql"]);
    expect(await migrate(opts)).toEqual([]);
  });

  it("gives keys stored before rotation existed Paperclip's default 30 days from when they were connected", async () => {
    await reset();
    const all = new URL("../migrations/", import.meta.url);
    const before = mkdtempSync(join(tmpdir(), "mig-"));
    for (const f of readdirSync(all)) if (f < "008") copyFileSync(new URL(f, all), join(before, f));
    await migrate(opts, before);
    const c = new pg.Client({ connectionString: DB });
    await c.connect();
    try {
      await c.query("insert into bridge.accounts (id, username, username_key, secret_hash, created_at) values ('old1', 'old.user1', 'old.user1', 'h', $1)", [T0]);
      await c.query("insert into bridge.account_links (account_id, instance_url, sealed_credential, created_at, connected_at, last_used_at) values ('old1', 'https://p.example.com', 'k.sealed', $1, $2, $2)", [T0, T0 + 5]);
      await c.query("insert into bridge.grants (id, client_id, client_name, scopes, resource, sealed_credential, created_at, last_used_at) values ('og1', 'c', 'C', '{}', 'r', 'g.sealed', $1, $1), ('og2', 'c', 'C', '{}', 'r', null, $1, $1)", [T0]);
      expect(await migrate(opts)).toEqual(["008_key_rotation.sql"]);
      const pgs = new PgStore(opts, () => T0);
      try {
        expect((await pgs.getLink("old1"))?.credentialExpiresAt).toBe(T0 + 5 + 30 * 86_400_000);
        expect((await pgs.getGrant("og1"))?.credentialExpiresAt).toBe(T0 + 30 * 86_400_000);
        expect((await pgs.getGrant("og2"))?.credentialExpiresAt).toBeNull(); // no key, nothing to renew
      } finally {
        await pgs.close();
      }
    } finally {
      await c.end();
    }
  });

  it("locks the schema against Supabase's anon/authenticated roles (RLS + revoked grants)", async () => {
    const c = new pg.Client({ connectionString: DB });
    await c.connect();
    for (const role of ["anon", "authenticated"]) {
      await c.query(`set role ${role}`);
      await expect(c.query("select * from bridge.grants")).rejects.toThrow(/permission denied/);
      await expect(c.query("select * from bridge.schema_migrations")).rejects.toThrow(/permission denied/);
      await c.query("reset role");
    }
    const rls = await c.query("select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'bridge' and relkind = 'r'");
    expect(rls.rows.length).toBeGreaterThanOrEqual(7);
    expect(rls.rows.every((r) => r.relrowsecurity)).toBe(true);
    await c.end();
  });

  it("verifies TLS by default and allows explicit relaxations", () => {
    expect(sslOption({})).toEqual({ rejectUnauthorized: true });
    expect(sslOption({ ca: "PEM" })).toEqual({ rejectUnauthorized: true, ca: "PEM" });
    expect(sslOption({ ssl: "require" })).toEqual({ rejectUnauthorized: false });
    expect(sslOption({ ssl: "off" })).toBe(false);
  });

  contract("postgres", async () => {
    await reset();
    await migrate(opts);
    return new PgStore(opts, now);
  });

  // The documented least-privilege setup must be sufficient for the whole Store contract — and nothing more.
  contract("postgres as least-privilege role (docs/least-privilege.sql)", async () => {
    await reset();
    await migrate(opts);
    const admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await ensureRole(admin, "bridge_app");
    await admin.query(readFileSync(new URL("../docs/least-privilege.sql", import.meta.url), "utf8"));
    await admin.end();
    const appUrl = new URL(DB!);
    appUrl.username = "bridge_app";
    return new PgStore({ connectionString: appUrl.toString(), ssl: "off" }, now);
  });

  auditContract("postgres", async () => {
    await reset();
    await migrate(opts);
    return new PgStore(opts, now);
  });

  accountContract("postgres", async () => {
    await reset();
    await migrate(opts);
    return new PgStore(opts, now);
  });

  accountContract("postgres as least-privilege role", async () => {
    await reset();
    await migrate(opts);
    const admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await ensureRole(admin, "bridge_app");
    await admin.query(readFileSync(new URL("../docs/least-privilege.sql", import.meta.url), "utf8"));
    await admin.end();
    const appUrl = new URL(DB!);
    appUrl.username = "bridge_app";
    return new PgStore({ connectionString: appUrl.toString(), ssl: "off" }, now);
  });

  auditContract("postgres as least-privilege role", async () => {
    await reset();
    await migrate(opts);
    const admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await ensureRole(admin, "bridge_app");
    await admin.query(readFileSync(new URL("../docs/least-privilege.sql", import.meta.url), "utf8"));
    await admin.end();
    const appUrl = new URL(DB!);
    appUrl.username = "bridge_app";
    return new PgStore({ connectionString: appUrl.toString(), ssl: "off" }, now);
  });

  it("the paste-into-Supabase script builds the same locked-down schema, is re-runnable, and makes `migrate` a no-op", async () => {
    await reset();
    const c = new pg.Client({ connectionString: DB });
    await c.connect();
    const sql = readFileSync(new URL("../docs/supabase-schema.sql", import.meta.url), "utf8");
    await c.query(sql);
    await c.query(sql); // re-run
    expect((await c.query("select version from bridge.schema_migrations order by 1")).rows.map((r) => r.version)).toEqual(["001_init.sql", "002_audit.sql", "003_accounts.sql", "004_privacy_panel.sql", "005_beta.sql", "006_two_levels.sql", "007_control_room.sql", "008_key_rotation.sql"]);
    for (const role of ["anon", "authenticated"]) {
      await c.query(`set role ${role}`);
      for (const t of ["grants", "tokens", "codes", "pending", "clients", "rate_limits", "audit_events", "schema_migrations", "accounts", "account_links", "user_events", "heartbeat", "node_samples", "panel_accounts", "panel_grants", "panel_links"])
        await expect(c.query(`select * from bridge.${t}`), `${role}.${t}`).rejects.toThrow(/permission denied/);
      await c.query("reset role");
    }
    const rls = await c.query("select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'bridge' and relkind = 'r'");
    expect(rls.rows.map((r) => r.relname).sort()).toEqual(["account_links", "accounts", "audit_events", "clients", "codes", "grants", "heartbeat", "node_samples", "pending", "rate_limits", "schema_migrations", "tokens", "user_events"]);
    expect(rls.rows.every((r) => r.relrowsecurity)).toBe(true);
    await c.end();
    expect(await migrate(opts)).toEqual([]); // nothing left to apply
    const store = new PgStore(opts, now);
    await store.insertAudit([row({})]);
    expect((await store.auditRecent(0, 5)).length).toBe(1);
    await store.close();
  });

  it("the audit table is locked against anon/authenticated and idempotently migrated", async () => {
    await reset();
    expect(await migrate(opts)).toEqual(["001_init.sql", "002_audit.sql", "003_accounts.sql", "004_privacy_panel.sql", "005_beta.sql", "006_two_levels.sql", "007_control_room.sql", "008_key_rotation.sql"]);
    const c = new pg.Client({ connectionString: DB });
    await c.connect();
    for (const role of ["anon", "authenticated"]) {
      await c.query(`set role ${role}`);
      await expect(c.query("select * from bridge.audit_events")).rejects.toThrow(/permission denied/);
      await c.query("reset role");
    }
    const rls = await c.query("select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'bridge' and relname = 'audit_events'");
    expect(rls.rows[0].relrowsecurity).toBe(true);
    await c.end();
  });

  // The panel_* views and telemetry tables stay for the separate (private) operator dashboard. This proves a read-only role
  // set up like that dashboard's (script copied to test/fixtures/dashboard-role.sql) can see nothing sensitive.
  describe("an external read-only dashboard role", () => {
    const panelUrl = () => {
      const u = new URL(DB!);
      u.username = "panel_ro";
      return u.toString();
    };
    let admin: pg.Client;
    let panel: pg.Client;

    it("is set up from docs/panel-role.sql", async () => {
      await reset();
      await migrate(opts);
      admin = new pg.Client({ connectionString: DB });
      await admin.connect();
      await ensureRole(admin, "panel_ro");
      await admin.query(readFileSync(new URL("./fixtures/dashboard-role.sql", import.meta.url), "utf8"));
      // an anonymous account with a stored credential, events and audit rows
      const store = new PgStore(opts, now);
      await store.createAccount(acct("pa1", "real.person42", { anonymous: true, alias: "Eve31", secretHash: "scrypt$16384$8$1$c2VjcmV0c2FsdA==$VERYSECRETHASH" }));
      await store.putLink(link("pa1", { paperclipUserId: "pu-secret-id", sealedCredential: "kid.VERYSECRETCREDENTIAL", instanceLabel: "anon-9c1d77", instanceUrl: "https://real-host.example.com" }));
      await store.putGrant({ ...grant("gpa1"), accountId: "pa1", username: "Eve31", sealedCredential: null, instanceUrl: "https://real-host.example.com" });
      await store.insertUserEvent(ev({ accountId: "pa1", username: "Eve31", kind: "joined", detail: "anon-9c1d77" }));
      await store.insertAudit([row({ username: "Eve31", instance: "anon-9c1d77" })]);
      await store.recordNodeSample({ at: T0, node: "n1", dbPingMs: 3, loopLagP99Ms: 1, rssMb: 80, heapMb: 30, uptimeS: 5, version: "1.0.0" });
      await store.close();
      panel = new pg.Client({ connectionString: panelUrl() });
      await panel.connect();
    });

    it("reads the safe views and telemetry", async () => {
      expect((await panel.query("select display_name, anonymous from bridge.panel_accounts")).rows).toEqual([{ display_name: "Eve31", anonymous: true }]);
      expect((await panel.query("select display_name, client_name from bridge.panel_grants")).rows[0].display_name).toBe("Eve31");
      expect((await panel.query("select instance_label, has_credential from bridge.panel_links")).rows).toEqual([{ instance_label: "anon-9c1d77", has_credential: true }]);
      for (const t of ["audit_events", "user_events", "node_samples"]) expect((await panel.query(`select count(*)::int as n from bridge.${t}`)).rows[0].n).toBe(1);
    });

    it("cannot read anything secret: credentials, secret hashes, real usernames, tokens, codes, pending requests", async () => {
      for (const q of [
        "select * from bridge.accounts", "select secret_hash from bridge.accounts", "select username from bridge.accounts",
        "select * from bridge.account_links", "select sealed_credential from bridge.account_links",
        "select * from bridge.grants", "select * from bridge.tokens", "select * from bridge.codes", "select * from bridge.pending",
        "select * from bridge.clients", "select * from bridge.rate_limits", "select * from bridge.heartbeat", "select * from bridge.schema_migrations",
      ]) await expect(panel.query(q), q).rejects.toThrow(/permission denied/);
    });

    it("the real username, the real host and every secret appear nowhere the panel can read", async () => {
      let readable = "";
      for (const t of ["panel_accounts", "panel_grants", "panel_links", "audit_events", "user_events", "node_samples"]) readable += JSON.stringify((await panel.query(`select * from bridge.${t}`)).rows);
      for (const secret of ["real.person42", "real-host.example.com", "VERYSECRETHASH", "VERYSECRETCREDENTIAL", "pu-secret-id", "real.person42".toUpperCase()]) expect(readable, secret).not.toContain(secret);
      expect(readable).toContain("Eve31");
    });

    it("cannot write, alter or create anything", async () => {
      for (const q of [
        "insert into bridge.audit_events (ts,node,kind,name,ok,total_ms) values (1,'x','tool','x',true,1)", "update bridge.user_events set username = 'x'", "delete from bridge.audit_events",
        "truncate bridge.node_samples", "create table bridge.evil (x int)", "drop table bridge.audit_events", "create schema evil", "alter table bridge.audit_events add column x int",
        "update bridge.panel_accounts set display_name = 'x'", "insert into bridge.node_samples (ts,node) values (1,'x')",
      ]) await expect(panel.query(q), q).rejects.toThrow(/permission denied|must be owner|cannot (update|insert|delete)|not (automatically )?updatable/);
    });

  });

  it("the least-privilege role cannot touch anything outside the bridge tables", async () => {
    const appUrl = new URL(DB!);
    appUrl.username = "bridge_app";
    const c = new pg.Client({ connectionString: appUrl.toString() });
    await c.connect();
    await expect(c.query("create table bridge.evil (x int)")).rejects.toThrow(/permission denied/);
    await expect(c.query("drop table bridge.grants")).rejects.toThrow(/must be owner|permission denied/);
    await expect(c.query("select * from bridge.schema_migrations")).rejects.toThrow(/permission denied/);
    await expect(c.query("create schema evil")).rejects.toThrow(/permission denied/);
    await c.end();
  });
});
