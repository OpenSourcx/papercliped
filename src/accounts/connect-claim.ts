import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * This service-only assertion proves ownership of one EXISTING Papercliped
 * account for a particular (already verified on Connect) OIDC identity.
 * Disabled unless CONNECT_CLAIM_SIGNING_KEY is configured explicitly.
 * It is NOT a login session, MCP grant, or Proxmox permission.
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
export function signConnectClaim({
  accountId, issuer, subject, signingKey, nowMs = Date.now(),
}: {
  accountId: string; issuer: string; subject: string; signingKey: string; nowMs?: number;
}): { assertion: string; expiresIn: number } {
  if (!ACCOUNT_ID.test(accountId) || !validClaimIdentity(issuer, subject)) throw new Error("Invalid claim subject");
  if (typeof signingKey !== "string" || Buffer.byteLength(signingKey, "utf8") < 32) throw new Error("Signing key not configured");
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new Error("Invalid time");
  const iat = Math.floor(nowMs / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "PCD-ACCOUNT-ASSERTION", v: 1 })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: ASSERTION_ISSUER, aud: CLAIM_AUDIENCE, sub: accountId,
    jti: randomBytes(24).toString("base64url"), iat, exp: iat + CLAIM_TTL_SECONDS,
    binding: claimIdentityBinding(issuer, subject),
  })).toString("base64url");
  const signed = header + "." + payload;
  const mac = createHmac("sha256", signingKey).update(signed).digest("base64url");
  return { assertion: signed + "." + mac, expiresIn: CLAIM_TTL_SECONDS };
}
