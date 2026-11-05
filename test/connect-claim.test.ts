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
let server:Server; let base:string; let secret:string;
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
  const provider = new OAuthProvider({ config, oauth, bridgeToken: null, store });
  server = createHttpServer(config, { host: "127.0.0.1", port: 0, bridgeToken: null, publicUrl: oauth.issuer, oauth } as any,
    { oauth: provider, manage: new ManageRoutes(provider, { connectClaimSigningKey: key, now: () => nowMs }) });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
});
afterAll(() => server.close());

describe("Papercliped Connect account-claim issuer", () => {
  it("reuses the canonical account and emits short-lived signed, identity-bound claims", async () => {
    const r = await post({ username: accountName, secret, issuer, subject });
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const claim = await r.json() as {assertion:string;expiresIn:number};
    expect(claim.expiresIn).toBe(60);
    const [header, payload, mac] = claim.assertion.split(".");
    const body = JSON.parse(Buffer.from(payload,"base64url").toString());
    expect(body.sub).toBe("acct_claim_owner");
    expect(body.binding).toBe(claimIdentityBinding(issuer,subject));
    expect(body.exp-body.iat).toBe(60);
    expect(JSON.parse(Buffer.from(header,"base64url").toString()).alg).toBe("HS256");
    expect(createHmac("sha256",key).update(header+"."+payload).digest("base64url")).toBe(mac);
    expect(JSON.stringify(claim)).not.toContain(secret);
  });
  it("refuses wrong key, invalid principal, and unconfigured issuer", async () => {
    expect((await post({username:accountName,secret:"pcs_invalid",issuer,subject})).status).toBe(401);
    expect((await post({username:accountName,secret,issuer:"http://evil.invalid",subject})).status).toBe(400);
    expect((await post({username:accountName,secret,issuer,subject:""})).status).toBe(400);
    expect(() => signConnectClaim({accountId:"acct_one",issuer,subject,signingKey:"short"})).toThrow();
    expect(() => claimIdentityBinding("https://accounts.google.com",subject)).toThrow();
    expect(() => claimIdentityBinding(issuer,"not-a-user-uuid")).toThrow();
  });
});
