import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { hashSecretKey, generateSecretKey, normalizeSecretKey } from "../src/accounts/secret.js";
import { usernameKey } from "../src/accounts/username.js";
import { ManageRoutes } from "../src/manage/routes.js";
import { MemoryStore } from "../src/oauth/store.js";
import { OAuthProvider } from "../src/oauth/provider.js";
import { createHttpServer } from "../src/server.js";
import { claimIdentityBinding, signConnectClaim } from "../src/accounts/connect-claim.js";
import { supabaseIdentityVerifier } from "../src/accounts/supabase-session.js";
import type { OAuthConfig } from "../src/config.js";

const key = "TEST-ONLY-papercliped-connect-claim-signing-key-long-enough";
const accountName = "claim.owner";
const issuer = "https://ixwbkbkdxvfmfyiyturx.supabase.co/auth/v1";
const subject = "6d7beb74-570b-4180-a51b-42e7b1df9342";
const nowMs = 1793851200000;
const oauth: OAuthConfig = {
  issuer: "http://localhost:1", secret: "a".repeat(40), previousSecrets: [],
  mode: "multi", accounts: true, login: "paperclip", dataFile: null,
  database: null, paperclipPublicUrl: null, accessTtlSec: 3600,
  refreshTtlSec: 86400*40, idleRevokeDays: 30, callsPerMinute: 120,
  redirectHosts: ["claude.ai"], proxyHops: 0,
  instance: { allowedPorts: [443], denyHosts: ["localhost"], allowHosts: null },
};
const config = { apiUrl: "http://unused.invalid/api", apiKey: null, companyId: null, readOnly: false, timeoutMs: 1000 };
const goodToken = "good-token", otherToken = "other-token";
const subject2 = "0f1e2d3c-4b5a-4968-8776-655443322110";
const verifyIdentity = async (t: string) => t === goodToken ? { issuer, subject } : t === otherToken ? { issuer, subject: subject2 } : null;
let server:Server; let base:string; let secret:string; let secret2:string;
const post = (data:unknown) => fetch(base + "/api/manage/connect-claim", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
});
beforeAll(async () => {
  const store = new MemoryStore();
  secret = generateSecretKey();
  await store.createAccount({
    id: "acct_claim_owner", username: accountName, usernameKey: usernameKey(accountName),
    secretHash: await hashSecretKey(normalizeSecretKey(secret)!), createdAt: Date.now(),
    lastLoginAt: null, disabled: false
  });
  secret2 = generateSecretKey();
  await store.createAccount({
    id: "acct_second", username: "second.owner", usernameKey: usernameKey("second.owner"),
    secretHash: await hashSecretKey(normalizeSecretKey(secret2)!), createdAt: Date.now(),
    lastLoginAt: null, disabled: false
  });
  const provider = new OAuthProvider({ config, oauth, bridgeToken: null, store });
  server = createHttpServer(config, { host: "127.0.0.1", port: 0, bridgeToken: null, publicUrl: oauth.issuer, oauth } as any,
    { oauth: provider, manage: new ManageRoutes(provider, { connectClaimSigningKey: key, now: () => nowMs, verifyIdentity }) });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
});
afterAll(() => server.close());

describe("Papercliped Connect account-claim issuer", () => {
  it("issues a short-lived signed claim bound to the identity Supabase verified", async () => {
    const r = await post({ username: accountName, secret, accessToken: goodToken });
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const claim = await r.json() as {assertion:string;expiresIn:number};
    expect(claim.expiresIn).toBe(60);
    const [header, payload, mac] = claim.assertion.split(".");
    const body = JSON.parse(Buffer.from(payload,"base64url").toString());
    expect(body.sub).toBe("acct_claim_owner");
    expect(body.binding).toBe(claimIdentityBinding(issuer,subject));
    expect(body.exp-body.iat).toBe(60);
    expect(createHmac("sha256",key).update(header+"."+payload).digest("base64url")).toBe(mac);
    expect(JSON.stringify(claim)).not.toContain(secret);
  });
  it("ignores caller-supplied issuer/subject: the identity comes from the verified token", async () => {
    const r = await post({ username: accountName, secret, accessToken: goodToken, issuer, subject: subject2 });
    const body = JSON.parse(Buffer.from(((await r.json()) as {assertion:string}).assertion.split(".")[1],"base64url").toString());
    expect(body.binding).toBe(claimIdentityBinding(issuer, subject));
  });
  it("refuses a bad token, wrong key, missing token and the old unverified body", async () => {
    expect((await post({username:accountName,secret,accessToken:"forged"})).status).toBe(401);
    expect((await post({username:accountName,secret:"pcs_invalid",accessToken:goodToken})).status).toBe(401);
    expect((await post({username:accountName,secret})).status).toBe(400);
    expect((await post({username:accountName,secret,issuer,subject})).status).toBe(400);
    expect(() => signConnectClaim({accountId:"acct_one",issuer,subject,signingKey:"short"})).toThrow();
    expect(() => claimIdentityBinding("https://accounts.google.com",subject)).toThrow();
  });
  it("never rebinds a linked account or lets one identity own two accounts", async () => {
    await post({ username: accountName, secret, accessToken: goodToken }); // links subject -> acct_claim_owner
    expect((await post({ username: accountName, secret, accessToken: otherToken })).status).toBe(409); // other identity, same account
    expect((await post({ username: "second.owner", secret: secret2, accessToken: goodToken })).status).toBe(409); // same identity, other account
    expect((await post({ username: accountName, secret, accessToken: goodToken })).status).toBe(200); // idempotent
  });
});

describe("supabaseIdentityVerifier", () => {
  const ok = { id: subject, email_confirmed_at: "2026-11-01T00:00:00Z", is_anonymous: false };
  const make = (status: number, body: unknown) => supabaseIdentityVerifier("pk", (async () => new Response(JSON.stringify(body), { status })) as typeof fetch);
  it("accepts a confirmed user and returns the pinned issuer", async () => {
    expect(await make(200, ok)("t")).toEqual({ issuer, subject });
  });
  it("fails closed on rejection, unconfirmed, anonymous, banned, bad id or network error", async () => {
    expect(await make(401, {})("t")).toBeNull();
    expect(await make(200, { ...ok, email_confirmed_at: null })("t")).toBeNull();
    expect(await make(200, { ...ok, is_anonymous: true })("t")).toBeNull();
    expect(await make(200, { ...ok, banned_until: "2999-01-01T00:00:00Z" })("t")).toBeNull();
    expect(await make(200, { ...ok, id: "not-a-uuid" })("t")).toBeNull();
    expect(await supabaseIdentityVerifier("pk", (async () => { throw new Error("down"); }) as typeof fetch)("t")).toBeNull();
    expect(await make(200, ok)("")).toBeNull();
  });
});
