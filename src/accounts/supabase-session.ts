import { CONNECT_LOGIN_ISSUER } from "./connect-claim.js";

export interface VerifiedIdentity { issuer: string; subject: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ask the trusted Supabase Auth project who this access token belongs to. Server-side, so a forged or revoked
 * token fails, and issuer/subject come from Supabase, never from the caller. Null on any doubt (fail closed).
 */
export function supabaseIdentityVerifier(publishableKey: string, fetchImpl: typeof fetch = fetch) {
  return async (accessToken: string): Promise<VerifiedIdentity | null> => {
    if (!accessToken || accessToken.length > 4096 || /\s/.test(accessToken)) return null;
    try {
      const r = await fetchImpl(`${CONNECT_LOGIN_ISSUER}/user`, {
        headers: { apikey: publishableKey, authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) return null;
      const u = (await r.json()) as { id?: unknown; email_confirmed_at?: unknown; is_anonymous?: unknown; banned_until?: unknown };
      if (typeof u.id !== "string" || !UUID.test(u.id) || !u.email_confirmed_at || u.is_anonymous === true) return null;
      if (typeof u.banned_until === "string" && Date.parse(u.banned_until) > Date.now()) return null;
      return { issuer: CONNECT_LOGIN_ISSUER, subject: u.id.toLowerCase() };
    } catch {
      return null;
    }
  };
}
