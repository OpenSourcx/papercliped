import { createPrivateKey, randomBytes, sign, type KeyObject } from "node:crypto";
import type { OAuthStore } from "../oauth/store.js";

export const OPERATOR_RECOVERY_AUDIENCE = "papercliped-operator-recovery-review";
export const OPERATOR_RECOVERY_ISSUER = "https://mcp.papercliped.co";
export const OPERATOR_RECOVERY_TTL_SECONDS = 300;
const MIN_GRANT_AGE_MS = 24 * 60 * 60 * 1000;
const ID = /^[A-Za-z0-9_-]{3,128}$/;

export type RecoverySigner = { key: KeyObject; kid: string };

export function parseRecoverySigner(pem: string, kid: string): RecoverySigner {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(kid)) throw new Error("Invalid recovery signing key id");
  const key = createPrivateKey(pem.replace(/\\n/g, "\n"));
  if (key.asymmetricKeyType !== "ed25519") throw new Error("Operator recovery key must be Ed25519");
  return { key, kid };
}

/** No signer configured => no recovery evidence tool. An invalid key fails startup. */
export function recoverySignerFromEnv(env: NodeJS.ProcessEnv = process.env): RecoverySigner | null {
  const pem = env.OPERATOR_RECOVERY_ED25519_PRIVATE_KEY?.trim();
  return pem ? parseRecoverySigner(pem, env.OPERATOR_RECOVERY_KEY_ID?.trim() || "pcd-recovery-1") : null;
}

/**
 * Evidence of possession of a previously authorized OAuth grant.
 * This CANNOT approve recovery. The operator must independently verify the
 * verified Supabase subject, corroborate ownership and explicitly approve.
 * No Paperclip instance call is necessary, so historical grants can prove
 * possession even when a user deleted their former Paperclip deployment.
 */
export async function issueOperatorRecoveryEvidence(
  store: Pick<OAuthStore, "getGrant" | "getAccount" | "hit">,
  grantId: string,
  signer: RecoverySigner,
  nowMs = Date.now(),
): Promise<string> {
  if (!Number.isSafeInteger(nowMs) || nowMs < MIN_GRANT_AGE_MS) throw new Error("Invalid time");
  const grant = await store.getGrant(grantId);
  if (!grant || grant.revoked || !grant.accountId || !ID.test(grant.accountId) ||
      !ID.test(grant.id) || grant.clientId === "paperclip-plugin" ||
      grant.createdAt > nowMs - MIN_GRANT_AGE_MS ||
      !grant.scopes.includes("paperclip:read")) throw new Error("Not an eligible existing account grant");
  const account = await store.getAccount(grant.accountId);
  if (!account || account.disabled) throw new Error("Account unavailable");
  // Shared persistent counter across replicas, not a process-local throttle.
  if (!(await store.hit("operator-recovery:" + grant.accountId, 1, 5 * 60_000))) throw new Error("Recovery evidence rate-limited");
  const iat = Math.floor(nowMs / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "PCD-RECOVERY-EVIDENCE", v: 1, kid: signer.kid })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: OPERATOR_RECOVERY_ISSUER, aud: OPERATOR_RECOVERY_AUDIENCE,
    aid: account.id, gid: grant.id, iat, exp: iat + OPERATOR_RECOVERY_TTL_SECONDS,
    jti: randomBytes(24).toString("base64url"),
  })).toString("base64url");
  const data = header + "." + payload;
  return data + "." + sign(null, Buffer.from(data), signer.key).toString("base64url");
}
