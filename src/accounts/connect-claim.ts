import { createHash, createHmac, createPrivateKey, randomBytes, sign as edSign, type KeyObject } from "node:crypto";

/**
 * This service-only assertion proves ownership of one EXISTING Papercliped
 * account for a particular (already verified on Connect) OIDC identity.
 * Disabled unless CONNECT_CLAIM_SIGNING_KEY is configured explicitly.
 * It is NOT a login session, MCP grant, or Proxmox permission.
 *
 * Two signature formats (Connect accepts both during the rollout release):
 *  - EdDSA (Ed25519), header { alg: "EdDSA", v: 2, kid }: signed with a private key held only here; Connect verifies with a
 *    public key, so Connect can no longer forge claims. Preferred; used whenever an Ed25519 key is configured.
 *  - HS256, header { alg: "HS256", v: 1 }: the legacy shared secret.
 */
export const CLAIM_TTL_SECONDS = 60;
const ASSERTION_ISSUER = "https://papercliped.co";
const CLAIM_AUDIENCE = "papercliped-connect";
const ACCOUNT_ID = /^[A-Za-z0-9_-]{3,128}$/;

/** Only the trusted Supabase Auth project may be used for Connect account claims.
 * The OIDC issuer includes /auth/v1 (it is not an origin-only URL).
 */
export const CONNECT_LOGIN_ISSUER = "https://ixwbkbkdxvfmfyiyturx.supabase.co/auth/v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validClaimIdentity(issuer: unknown, subject: unknown): issuer is string {
  return issuer === CONNECT_LOGIN_ISSUER && typeof subject === "string" && UUID.test(subject);
}
/** Bind an assertion to an exact trusted issuer + subject without including PII. */
export function claimIdentityBinding(issuer: string, subject: string): string {
  if (!validClaimIdentity(issuer, subject)) throw new Error("Invalid verified identity");
  return createHash("sha256").update(JSON.stringify([issuer, subject]), "utf8").digest("base64url");
}
export interface ClaimEdKey { key: KeyObject; kid: string }

/** Parses CONNECT_CLAIM_ED25519_PRIVATE_KEY (PKCS#8 PEM; literal "\\n" sequences are accepted for single-line env vars). Throws unless it is Ed25519. */
export function parseClaimEdKey(pem: string, kid: string): ClaimEdKey {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(kid)) throw new Error("Invalid claim key id");
  const key = createPrivateKey(pem.replace(/\\n/g, "\n"));
  if (key.asymmetricKeyType !== "ed25519") throw new Error("Claim signing key must be Ed25519");
  return { key, kid };
}

/** The configured Ed25519 key, or null when unset. A set-but-invalid key throws at startup instead of silently falling back to HS256. */
export function claimEdKeyFromEnv(env: NodeJS.ProcessEnv = process.env): ClaimEdKey | null {
  const pem = env.CONNECT_CLAIM_ED25519_PRIVATE_KEY?.trim();
  return pem ? parseClaimEdKey(pem, env.CONNECT_CLAIM_KEY_ID?.trim() || "pcd-claim-1") : null;
}

export function signConnectClaim({
  accountId, issuer, subject, signingKey, edKey, nowMs = Date.now(),
}: {
  accountId: string; issuer: string; subject: string; signingKey?: string | null; edKey?: ClaimEdKey | null; nowMs?: number;
}): { assertion: string; expiresIn: number } {
  if (!ACCOUNT_ID.test(accountId) || !validClaimIdentity(issuer, subject)) throw new Error("Invalid claim subject");
  if (!edKey && (typeof signingKey !== "string" || Buffer.byteLength(signingKey, "utf8") < 32)) throw new Error("Signing key not configured");
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new Error("Invalid time");
  const iat = Math.floor(nowMs / 1000);
  const header = Buffer.from(JSON.stringify(edKey ? { alg: "EdDSA", typ: "PCD-ACCOUNT-ASSERTION", v: 2, kid: edKey.kid } : { alg: "HS256", typ: "PCD-ACCOUNT-ASSERTION", v: 1 })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: ASSERTION_ISSUER, aud: CLAIM_AUDIENCE, sub: accountId,
    jti: randomBytes(24).toString("base64url"), iat, exp: iat + CLAIM_TTL_SECONDS,
    binding: claimIdentityBinding(issuer, subject),
  })).toString("base64url");
  const signed = header + "." + payload;
  const sig = edKey ? edSign(null, Buffer.from(signed), edKey.key).toString("base64url") : createHmac("sha256", signingKey!).update(signed).digest("base64url");
  return { assertion: signed + "." + sig, expiresIn: CLAIM_TTL_SECONDS };
}
