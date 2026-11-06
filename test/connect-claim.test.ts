import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createHmac, generateKeyPairSync, verify as edVerify } from "node:crypto";
import { hashSecretKey, generateSecretKey, normalizeSecretKey } from "../src/accounts/secret.js";
import { usernameKey } from "../src/accounts/username.js";
import { ManageRoutes } from "../src/manage/routes.js";
import { MemoryStore } from "../src/oauth/store.js";
import { OAuthProvider } from "../src/oauth/provider.js";
import { createHttpServer } from "../src/server.js";
import { claimEdKeyFromEnv, claimIdentityBinding, parseClaimEdKey, signConnectClaim } from "../src/accounts/connect-claim.js";
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

describe("Ed25519 claim signing (asymmetric)", () => {
  const pair = generateKeyPairSync("ed25519");
  const pem = pair.privateKey.export({ type: "pkcs8", format: "pem" }) as string;
  const edKey = parseClaimEdKey(pem, "k-test");
  it("signs EdDSA with a kid header that the public key verifies; the shared secret is not involved", () => {
    const { assertion } = signConnectClaim({ accountId: "acct_one", issuer, subject, edKey, nowMs });
    const [h, p, sig] = assertion.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "EdDSA", typ: "PCD-ACCOUNT-ASSERTION", v: 2, kid: "k-test" });
    expect(edVerify(null, Buffer.from(h + "." + p), pair.publicKey, Buffer.from(sig, "base64url"))).toBe(true);
    expect(edVerify(null, Buffer.from(h + "." + p + "x"), pair.publicKey, Buffer.from(sig, "base64url"))).toBe(false);
    expect(JSON.parse(Buffer.from(p, "base64url").toString()).binding).toBe(claimIdentityBinding(issuer, subject));
  });
  it("prefers EdDSA when both keys are configured and still signs HS256 when only the secret is", () => {
    expect(signConnectClaim({ accountId: "acct_one", issuer, subject, signingKey: key, edKey, nowMs }).assertion.split(".")[0]).toBe(
      Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "PCD-ACCOUNT-ASSERTION", v: 2, kid: "k-test" })).toString("base64url"));
    expect(JSON.parse(Buffer.from(signConnectClaim({ accountId: "acct_one", issuer, subject, signingKey: key, nowMs }).assertion.split(".")[0], "base64url").toString()).alg).toBe("HS256");
    expect(() => signConnectClaim({ accountId: "acct_one", issuer, subject, nowMs })).toThrow();
  });
  it("rejects non-Ed25519 keys and bad key ids; env parsing accepts single-line PEM and fails loudly when invalid", () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    expect(() => parseClaimEdKey(rsa, "k")).toThrow();
    expect(() => parseClaimEdKey(pem, "bad kid!")).toThrow();
    expect(claimEdKeyFromEnv({})).toBeNull();
    expect(claimEdKeyFromEnv({ CONNECT_CLAIM_ED25519_PRIVATE_KEY: pem.trim().replace(/\n/g, "\\n"), CONNECT_CLAIM_KEY_ID: "env-kid" } as NodeJS.ProcessEnv)?.kid).toBe("env-kid");
    expect(() => claimEdKeyFromEnv({ CONNECT_CLAIM_ED25519_PRIVATE_KEY: "not a key" } as NodeJS.ProcessEnv)).toThrow();
  });
  it("the route works with ONLY an Ed25519 key (no shared secret) and signs EdDSA", async () => {
    const store = new MemoryStore();
    const s = generateSecretKey();
    await store.createAccount({ id: "acct_ed", username: "ed.owner", usernameKey: "ed.owner", secretHash: await hashSecretKey(normalizeSecretKey(s)!), createdAt: Date.now(), lastLoginAt: null, disabled: false });
    const provider = new OAuthProvider({ config, oauth, bridgeToken: null, store });
    const srv = createHttpServer(config, { host: "127.0.0.1", port: 0, bridgeToken: null, publicUrl: oauth.issuer, oauth } as any,
      { oauth: provider, manage: new ManageRoutes(provider, { connectClaimEdKey: edKey, now: () => nowMs, verifyIdentity }) });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    try {
      const r = await fetch("http://127.0.0.1:" + (srv.address() as AddressInfo).port + "/api/manage/connect-claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "ed.owner", secret: s, accessToken: goodToken }) });
      expect(r.status).toBe(200);
      const [h, p, sig] = ((await r.json()) as { assertion: string }).assertion.split(".");
      expect(JSON.parse(Buffer.from(h, "base64url").toString()).alg).toBe("EdDSA");
      expect(edVerify(null, Buffer.from(h + "." + p), pair.publicKey, Buffer.from(sig, "base64url"))).toBe(true);
    } finally { srv.close(); }
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
