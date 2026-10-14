import { hkdfSync } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { generateSecretKey, burnVerify, hashSecretKey, normalizeSecretKey, verifySecretKey } from "../accounts/secret.js";
import { anonInstanceLabel, displayName, generateAlias } from "../accounts/alias.js";
import { AliasTakenError, type Account, type AccountLink, type UserEvent, type UserEventKind } from "../accounts/types.js";
import { usernameKey, validateUsername } from "../accounts/username.js";
import { PaperclipClient } from "../client.js";
import { hostAllowed, type BridgeConfig, type OAuthConfig } from "../config.js";
import { UnsafeUrlError, createSafeFetch, parseInstanceUrl } from "../net/safe-fetch.js";
import { Keyring, isValidCodeChallenge, randomToken, safeEqual, sha256Hex, verifyPkce } from "./crypto.js";
import { approvePage, choosePage, consentPage, errorPage, instancePage, scopePage, secretPage, usernamePage, welcomePage } from "./pages.js";
import { LoginError, PAPERCLIP_KEY_TTL_MS, PaperclipLogin, type Challenge } from "./paperclip-login.js";
import { parseAccountPolicy, parseSessionPolicy, readAccountPolicy, readSessionPolicy, surfaceOfTool, type AccountPolicy, type ExecPolicy, type SessionPolicy } from "../access/policy.js";
import { tools as ALL_TOOLS } from "../tools.js";
import { VERSION } from "../version.js";
import { MemoryStore, credentialExpiry, type CredentialHolder, type Grant, type PendingRecord, type Store } from "./store.js";
import { SCOPES, grantableScopes, isScope, maxRank, normalizeScope, normalizeScopes, scopeAllows, scopesUpTo, type Scope } from "./scopes.js";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const PENDING_TTL_MS = 10 * 60_000;
const CODE_TTL_MS = 60_000;
const MAX_PENDING = 5000;
const MAX_INSTANCE_ATTEMPTS = 5;
/** Every tool name, for checking a session's tool list. */
const KNOWN_TOOLS: ReadonlySet<string> = new Set(ALL_TOOLS.map((t) => t.name));
/** The plugin offered on the instance step: one fixed package, pinned to this bridge's own version (both are released together). */
const PLUGIN_PACKAGE = "papercliped-paperclip-plugin";
/** Its id inside Paperclip (the manifest id), used to see whether it is already installed. */
const PLUGIN_KEY = "papercliped.remote-control";
/** Paperclip runs npm on its side for an install; allow it more time than ordinary calls. */
const PLUGIN_INSTALL_MS = 120_000;
const MAX_FORM_BYTES = 16 * 1024;
const DAY_MS = 24 * 3600 * 1000;
/** Renew a stored Paperclip key this long before Paperclip expires it. */
const ROTATE_BEFORE_MS = 7 * DAY_MS;
/** After a rotation attempt, wait this long before trying that key again (shared across processes). */
const ROTATE_RETRY_MS = 10 * 60_000;
/** Revoke the replaced key only after this, so calls already under way with it (here or in another process) finish. */
const ROTATE_GRACE_MS = 60_000;

/** A stored Paperclip credential that may need renewing. */
interface HeldKey extends CredentialHolder {
  instanceUrl: string | null;
  sealed: string;
  expiresAt: number | null;
}

export interface OAuthDeps {
  config: BridgeConfig;
  oauth: OAuthConfig;
  bridgeToken: string | null;
  store?: Store;
  now?: () => number;
  /** Build the Paperclip login adapter for an instance (null = the single configured one). Tests inject mocks. */
  loginFor?: (instanceUrl: string | null) => PaperclipLogin;
  /** Egress-guarded fetch used for tenant Paperclip instances. */
  safeFetch?: typeof fetch;
  /** How long a replaced Paperclip key stays valid after a rotation (tests pass 0). */
  rotationGraceMs?: number;
}

class OAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** The account's Paperclip connection is missing or was dropped: the user must reconnect. */
export class ReconnectRequired extends Error {}

export function levelOf(scopes: string[]): Scope {
  return SCOPES[Math.max(0, maxRank(scopes) - 1)];
}

const parseUri = (raw: string): URL | null => {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
};

/** Client address: `hops` entries from the right of X-Forwarded-For (a client can only forge the left side). */
export function clientIp(req: IncomingMessage, hops: number): string {
  if (hops > 0) {
    const xff = req.headers["x-forwarded-for"];
    const parts = (Array.isArray(xff) ? xff.join(",") : xff ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    if (parts.length >= hops) return parts[parts.length - hops];
  }
  return req.socket.remoteAddress ?? "unknown";
}

type Step = { f: URLSearchParams; p: PendingRecord; rid: string };

export class OAuthProvider {
  readonly resource: string;
  readonly metadataUrl: string;
  readonly store: Store;
  private keyring: Keyring;
  private now: () => number;
  private safeFetch: typeof fetch;
  /** Longer-lived egress-guarded fetch for the plugin install, which makes Paperclip run npm. */
  private installFetch: typeof fetch;
  /** Plugin installs running after a sign-in finished, so tests (and shutdown) can wait for them. */
  private background = new Set<Promise<void>>();
  private multi: boolean;
  private accounts: boolean;
  /** Key rotations under way in this process, by holder: callers wait for one instead of starting another. */
  private rotations = new Map<string, Promise<string | null>>();
  /** Holder → when this process may try a failed rotation again. */
  private rotateRetryAt = new Map<string, number>();

  constructor(private deps: OAuthDeps) {
    this.now = deps.now ?? Date.now;
    this.store = deps.store ?? new MemoryStore(deps.oauth.dataFile, this.now);
    this.keyring = new Keyring([deps.oauth.secret, ...deps.oauth.previousSecrets]);
    this.multi = deps.oauth.mode === "multi";
    this.accounts = deps.oauth.accounts && this.multi;
    this.safeFetch = deps.safeFetch ?? createSafeFetch({ timeoutMs: deps.config.timeoutMs, maxBytes: 2_000_000 });
    this.installFetch = deps.safeFetch ?? createSafeFetch({ timeoutMs: PLUGIN_INSTALL_MS, maxBytes: 200_000 });
    this.resource = `${deps.oauth.issuer}/mcp`;
    this.metadataUrl = `${deps.oauth.issuer}/.well-known/oauth-protected-resource`;
  }

  // ───────────── community log ─────────────

  /** Best-effort: the community log must never break a sign-in. */
  async event(kind: UserEventKind, who: { accountId?: string | null; username?: string | null } | null, detail?: string): Promise<void> {
    try {
      const e: UserEvent = { at: this.now(), accountId: who?.accountId ?? null, username: who?.username ?? null, kind, detail: detail ?? null };
      await this.store.insertUserEvent(e);
    } catch {
      /* telemetry only */
    }
  }

  /** The name logs and the operator dashboard show for an account: its alias if it opted into anonymity, else its username. */
  private async who(accountId: string | null | undefined): Promise<{ accountId: string; username: string } | null> {
    if (!accountId) return null;
    const a = await this.store.getAccount(accountId);
    return a ? { accountId: a.id, username: displayName(a) } : { accountId, username: "" };
  }

  /** What logs show for a tenant: its hostname, or a stable anonymous label if the owner opted into anonymity. */
  private instanceLabelFor(a: Pick<Account, "id" | "anonymous" | "alias">, instanceUrl: string, previous?: AccountLink | null): string {
    if (a.anonymous && a.alias) return previous?.instanceLabel?.startsWith("anon-") ? previous.instanceLabel : anonInstanceLabel(this.deps.oauth.secret, a.id);
    return new URL(instanceUrl).host;
  }

  /** Turn anonymity on or off (generating a stable alias on first use) and rewrite what logs show. */
  private async setPrivacy(a: Account, anonymous: boolean): Promise<Account> {
    let alias = a.alias ?? null;
    for (let i = 0; i < 25; i++) {
      alias ??= generateAlias();
      const link = await this.store.getLink(a.id);
      const prevDisplay = displayName(a);
      const next = { ...a, anonymous, alias };
      const nextDisplay = displayName(next);
      const prevLabel = link?.instanceLabel ?? (link ? new URL(link.instanceUrl).host : "");
      const nextLabel = link ? this.instanceLabelFor(next, link.instanceUrl, anonymous ? null : link) : "";
      const r = await this.store.setAccountPrivacy(a.id, { anonymous, alias, display: nextDisplay, prevDisplay, instanceLabel: nextLabel, prevInstanceLabel: prevLabel });
      if (r === "ok") {
        await this.event("updated", { accountId: a.id, username: nextDisplay }, anonymous ? "privacy_on" : "privacy_off");
        return next;
      }
      if (r === "missing" || a.alias) throw new Error("Could not update privacy");
      alias = null; // that alias was taken: draw another
    }
    throw new Error("Could not find a free anonymous name");
  }

  // ───────────── resource-server side ─────────────

  challengeHeader(error?: "invalid_token" | "insufficient_scope", scope: Scope = "paperclip:read"): string {
    const parts = [`resource_metadata="${this.metadataUrl}"`, `scope="${scope}"`];
    if (error) parts.unshift(`error="${error}"`);
    return `Bearer ${parts.join(", ")}`;
  }

  /** Resolve a presented access token to its (live) grant. */
  async authenticate(token: string): Promise<Grant | null> {
    if (!token.startsWith("pcb_at_")) return null;
    const rec = await this.store.getAccess(sha256Hex(token));
    const grant = rec && (await this.store.getGrant(rec.grantId));
    if (!grant || grant.revoked) return null;
    await this.store.touchGrant(grant.id);
    return grant;
  }

  /** Per-grant call budget, shared across processes. */
  allowCall(grantId: string): Promise<boolean> {
    return this.store.hit(`call:${grantId}`, this.deps.oauth.callsPerMinute, 60_000);
  }

  /** The Paperclip client for a grant. In account mode the credential and instance come from the account's link. */
  async resolveClient(grant: Grant): Promise<{ client: PaperclipClient; instanceHost?: string }> {
    if (!this.accounts || !grant.accountId) {
      const sealed = grant.sealedCredential ? await this.currentKey(this.heldOnGrant(grant, grant.sealedCredential)) : null;
      const apiKey = sealed ? this.keyring.unseal(sealed) : null;
      if (!this.multi) return { client: new PaperclipClient({ ...this.deps.config, apiKey }) };
      if (!grant.instanceUrl) throw new Error("Grant has no Paperclip instance");
      const origin = this.checkedInstance(grant.instanceUrl).origin;
      return { client: new PaperclipClient({ ...this.deps.config, apiUrl: `${origin}/api`, apiKey, companyId: null }, this.safeFetch), instanceHost: new URL(origin).host };
    }
    const link = await this.store.getLink(grant.accountId);
    if (!link?.sealedCredential) throw new ReconnectRequired("This account's Paperclip connection has expired; reconnect to continue.");
    const origin = this.checkedInstance(link.instanceUrl).origin; // re-validated on every use (policy can tighten)
    await this.store.touchLink(grant.accountId);
    const apiKey = this.keyring.unseal(await this.currentKey(this.heldOnLink(link, link.sealedCredential)));
    return { client: new PaperclipClient({ ...this.deps.config, apiUrl: `${origin}/api`, apiKey, companyId: null }, this.safeFetch), instanceHost: link.instanceLabel ?? new URL(origin).host };
  }

  /** Convenience for callers that only need the client. */
  async clientFor(grant: Grant): Promise<PaperclipClient> {
    return (await this.resolveClient(grant)).client;
  }

  async listGrants() {
    return (await this.store.listGrants()).filter((g) => !g.revoked);
  }

  async revokeGrant(id: string) {
    const g = await this.store.getGrant(id);
    if (!g) return;
    const sealed = await this.store.revokeGrant(id);
    if (g.accountId) {
      // The Paperclip key belongs to the ACCOUNT and survives disconnecting a client: that is what lets the user come back.
      if ((await this.store.countLiveGrants(g.accountId)) === 0) await this.event("left", { accountId: g.accountId, username: g.username }, "disconnected");
      return;
    }
    if (!sealed) return;
    try {
      void this.loginFor(g.instanceUrl).revoke(this.keyring.unseal(sealed));
    } catch {
      /* instance no longer allowed / key gone: nothing more we can do */
    }
  }

  /** Revoke idle grants and idle account connections, delete their stored credentials, renew Paperclip keys close to expiry, prune telemetry. Run periodically. */
  async sweep(): Promise<number> {
    const days = this.deps.oauth.idleRevokeDays;
    await this.store.prune();
    let n = 0;
    if (days) {
      const cutoff = this.now() - days * DAY_MS;
      const idle = await this.store.listIdleGrants(cutoff);
      for (const g of idle) await this.revokeGrant(g.id);
      n += idle.length;
      for (const l of await this.store.listIdleLinks(cutoff)) {
        await this.dropConnection(l, "idle");
        n += 1;
      }
    }
    await this.rotateExpiring();
    return n;
  }

  /** Forget an account's stored Paperclip credential (the username stays) and tell its Paperclip to revoke the key. */
  private async dropConnection(l: AccountLink, reason: string): Promise<void> {
    const acct = await this.store.getAccount(l.accountId);
    const sealed = await this.store.dropLinkCredential(l.accountId);
    await this.store.revokeAccountGrants(l.accountId);
    await this.revokeUpstream(l.instanceUrl, sealed);
    await this.event("left", { accountId: l.accountId, username: acct ? displayName(acct) : "" }, reason);
  }

  private async revokeUpstream(instanceUrl: string | null, sealed: string | null) {
    if (!sealed) return;
    try {
      void this.loginFor(instanceUrl).revoke(this.keyring.unseal(sealed));
    } catch {
      /* best effort */
    }
  }

  // ───────────── Paperclip key rotation ─────────────
  // Paperclip expires the board keys it issues (30 days by default). Each stored key is renewed about a week before
  // that: the old key asks Paperclip for a new one, the new one is swapped in only if the old one is still stored
  // (compare-and-swap), and only then is the old one revoked. Any failure leaves the working key in place.

  private heldOnLink(l: AccountLink, sealed: string): HeldKey {
    return { kind: "link", id: l.accountId, instanceUrl: l.instanceUrl, sealed, expiresAt: credentialExpiry(l.credentialExpiresAt, l.connectedAt) };
  }

  private heldOnGrant(g: Grant, sealed: string): HeldKey {
    return { kind: "grant", id: g.id, instanceUrl: g.instanceUrl, sealed, expiresAt: credentialExpiry(g.credentialExpiresAt, g.createdAt) };
  }

  /** The sealed key to call Paperclip with: the stored one, or its replacement when it was due and got renewed. */
  private async currentKey(k: HeldKey): Promise<string> {
    if (k.expiresAt === null || k.expiresAt - this.now() > ROTATE_BEFORE_MS) return k.sealed;
    const slot = `${k.kind}:${k.id}`;
    let run = this.rotations.get(slot);
    if (!run) {
      if ((this.rotateRetryAt.get(slot) ?? 0) > this.now()) return k.sealed;
      run = this.rotate(k, slot).finally(() => this.rotations.delete(slot));
      this.rotations.set(slot, run);
    }
    return (await run) ?? k.sealed;
  }

  /** Renew every stored key that expires within the rotation window, so keys of people who rarely call get renewed too. */
  private async rotateExpiring(): Promise<void> {
    const before = this.now() + ROTATE_BEFORE_MS;
    for (const l of await this.store.listExpiringLinks(before)) if (l.sealedCredential) await this.currentKey(this.heldOnLink(l, l.sealedCredential));
    for (const g of await this.store.listExpiringGrants(before)) if (g.sealedCredential) await this.currentKey(this.heldOnGrant(g, g.sealedCredential));
  }

  /** One rotation. Resolves to the new sealed key, or null to keep using the stored one. Never throws. */
  private async rotate(k: HeldKey, slot: string): Promise<string | null> {
    let outcome: "rotated" | "failed" | null = null;
    let who: { accountId?: string | null; username?: string | null } | null = null;
    try {
      // One rotation per key across every process: whoever takes the claim does it; the others keep the old key, which still works.
      if (!(await this.store.hit(`rotate:${slot}`, 1, ROTATE_RETRY_MS))) {
        this.rotateRetryAt.set(slot, this.now() + ROTATE_RETRY_MS);
        return null;
      }
      const token = this.keyring.unseal(k.sealed);
      if (k.kind === "grant" && token === this.deps.config.apiKey) {
        // The operator's own PAPERCLIP_API_KEY (bridge admin token sign-in): not ours to replace.
        await this.store.swapCredential(k, k.sealed, k.sealed, null);
        return null;
      }
      let name = "Papercliped";
      if (k.kind === "link") {
        const a = await this.store.getAccount(k.id);
        if (a) name = `Papercliped (${a.username})`;
        who = a ? { accountId: a.id, username: displayName(a) } : { accountId: k.id, username: "" };
      } else {
        const g = await this.store.getGrant(k.id);
        if (g) name = `Papercliped (${g.username ?? g.clientName})`;
        who = g ? { accountId: g.accountId ?? null, username: g.username ?? null } : null;
      }
      const login = this.loginFor(k.instanceUrl);
      outcome = "failed";
      const info = await login.keyInfo(token);
      if (info.state === "unsupported" || info.expiresAt === null) {
        // Older Paperclip, or a key that never expires: nothing to renew, now or later.
        outcome = null;
        await this.store.swapCredential(k, k.sealed, k.sealed, null);
        return null;
      }
      if (info.expiresAt !== undefined && info.expiresAt - this.now() > ROTATE_BEFORE_MS) {
        outcome = null; // the stored expiry was an estimate; Paperclip's own is later
        await this.store.swapCredential(k, k.sealed, k.sealed, info.expiresAt);
        return null;
      }
      const made = await login.createKey(token, name);
      if (made.state === "unsupported") {
        outcome = null;
        await this.store.swapCredential(k, k.sealed, k.sealed, null);
        return null;
      }
      const next = this.keyring.seal(made.token);
      if (!(await this.store.swapCredential(k, k.sealed, next, made.expiresAt === undefined ? this.now() + PAPERCLIP_KEY_TTL_MS : made.expiresAt))) {
        // Reconnected, rotated elsewhere or disconnected meanwhile: what is stored now wins; drop the key we just made.
        outcome = null;
        await login.revoke(made.token);
        return null;
      }
      outcome = "rotated";
      this.revokeReplaced(login, token);
      return next;
    } catch (e) {
      outcome = "failed";
      this.rotateRetryAt.set(slot, this.now() + ROTATE_RETRY_MS);
      // Paperclip no longer accepts this key (expired or revoked): it can never be renewed, so stop trying. Using it
      // still gets the reconnect hint, and reconnecting stores a fresh key with a fresh expiry.
      if (e instanceof LoginError && e.status === 401) await this.store.swapCredential(k, k.sealed, k.sealed, null).catch(() => false);
      return null;
    } finally {
      if (outcome) await this.event("key", who, outcome);
    }
  }

  /** Revoke a key that rotation replaced, after a grace period for calls still using it. Best effort: it expires on its own anyway. */
  private revokeReplaced(login: PaperclipLogin, token: string): void {
    const grace = this.deps.rotationGraceMs ?? ROTATE_GRACE_MS;
    if (grace <= 0) {
      const run = login.revoke(token);
      const tracked = run.finally(() => this.background.delete(tracked));
      this.background.add(tracked);
      return;
    }
    setTimeout(() => void login.revoke(token), grace).unref();
  }

  // ───────────── account management (the Paperclip plugin's connection manager) ─────────────
  // Everything here acts on ONE account and is reached only through ManageRoutes, with a plugin token or the secret key.

  /** Username + secret key, throttled exactly like the sign-in page (shared counters, so there is no cheaper way to guess). */
  async manageLogin(req: IncomingMessage, username: string, secret: string): Promise<{ ok: true; account: Account } | { ok: false; reason: "throttled" | "invalid" }> {
    const typed = username.trim().slice(0, 64);
    const key = usernameKey(typed);
    if (!(await this.limit(`login:ip:${this.ip(req)}`, 20)) || !(await this.limit(`login:user:${key}`, 8, 15 * 60_000))) {
      await this.event("login_failed", null, "rate_limited");
      return { ok: false, reason: "throttled" };
    }
    const account = typed ? await this.store.getAccountByKey(key) : undefined;
    const valid = account && !account.disabled ? await verifySecretKey(secret, account.secretHash) : (await burnVerify(secret), false);
    if (!account || !valid) {
      await this.event("login_failed", account ? { accountId: account.id, username: displayName(account) } : null, "bad_credentials");
      return { ok: false, reason: "invalid" };
    }
    await this.store.touchAccountLogin(account.id, this.now());
    await this.event("login", { accountId: account.id, username: displayName(account) }, "manager");
    return { ok: true, account };
  }

  /** Re-prove the secret key for a sensitive action. Shares the per-account throttle. */
  async manageReauth(accountId: string, secret: string): Promise<boolean> {
    const a = await this.store.getAccount(accountId);
    if (!a || a.disabled || !(await this.limit(`login:user:${a.usernameKey}`, 8, 15 * 60_000))) return false;
    return verifySecretKey(secret, a.secretHash);
  }

  // ── the Paperclip plugin link: the plugin signs in once with username + secret key and gets a long-lived plugin token ──
  // The token is stored as a hash on a synthetic grant (client "paperclip-plugin", NO scopes), so it appears in no tool list,
  // cannot call any Paperclip tool, and is revoked like any grant. It only opens the manage API for its own account.

  /** A plugin token for an account whose owner just proved the secret key. */
  async manageLinkPlugin(a: Account, meta: { instanceHost: string | null; paperclipUserId: string | null }): Promise<{ token: string; linkId: string }> {
    const id = `pcb_pg_${randomToken(10)}`;
    const token = `pcb_pl_${randomToken(32)}`;
    await this.store.putGrant({ id, clientId: "paperclip-plugin", clientName: "Paperclip plugin", userId: meta.paperclipUserId, scopes: [], resource: "manage", instanceUrl: meta.instanceHost ? `https://${meta.instanceHost}` : null, sealedCredential: null, accountId: a.id, username: displayName(a), createdAt: this.now(), lastUsedAt: this.now(), revoked: false });
    await this.store.putAccess(sha256Hex(token), { grantId: id, expiresAt: this.now() + 180 * DAY_MS });
    await this.event("updated", { accountId: a.id, username: displayName(a) }, "plugin_linked");
    return { token, linkId: id };
  }

  /** The account (and link id) a plugin token belongs to (null if unknown, expired, revoked, or not a plugin token). */
  async managePluginPrincipal(token: string): Promise<{ account: Account; linkId: string } | null> {
    if (!token.startsWith("pcb_pl_") || token.length > 200) return null;
    const rec = await this.store.getAccess(sha256Hex(token));
    if (!rec || rec.expiresAt < this.now()) return null;
    const g = await this.store.getGrant(rec.grantId);
    if (!g || g.revoked || g.clientId !== "paperclip-plugin" || !g.accountId) return null;
    const a = await this.store.getAccount(g.accountId);
    if (!a || a.disabled) return null;
    await this.store.touchGrant(g.id);
    return { account: a, linkId: g.id };
  }

  async manageListPluginLinks(accountId: string) {
    return (await this.store.listAccountGrants(accountId)).filter((g) => g.clientId === "paperclip-plugin" && !g.revoked).map((g) => ({ id: g.id, host: g.instanceUrl ? new URL(g.instanceUrl).host : null, paperclipUserId: g.userId, createdAt: g.createdAt, lastUsedAt: g.lastUsedAt }));
  }

  async manageRevokePluginLink(a: Account, id: string): Promise<boolean> {
    const g = await this.store.getGrant(id);
    if (!g || g.revoked || g.accountId !== a.id || g.clientId !== "paperclip-plugin") return false;
    await this.store.revokeGrant(id);
    await this.event("updated", { accountId: a.id, username: displayName(a) }, "plugin_unlinked");
    return true;
  }

  manageAccount(accountId: string) {
    return this.store.getAccount(accountId);
  }

  async manageConnections(accountId: string) {
    return (await this.store.listAccountGrants(accountId))
      .filter((g) => !g.revoked && g.clientId !== "paperclip-plugin")
      .map((g) => {
        const p = readSessionPolicy(g.policy, KNOWN_TOOLS);
        return { id: g.id, app: g.clientName, label: p.label, level: levelOf(g.scopes), tools: p.tools, agents: p.agents, createdAt: g.createdAt, lastUsedAt: g.lastUsedAt };
      });
  }

  /** What the policy engine checks on every call for this grant: the account's switch plus this session's limits. */
  async policyFor(grant: Grant): Promise<ExecPolicy> {
    const account = grant.accountId ? await this.store.getAccount(grant.accountId) : undefined;
    return { account: readAccountPolicy(account?.policy), session: readSessionPolicy(grant.policy, KNOWN_TOOLS) };
  }

  async manageGetPolicy(a: Account): Promise<AccountPolicy> {
    return readAccountPolicy((await this.store.getAccount(a.id))?.policy);
  }

  /** Replace the access switch and per-agent overrides. Throws PolicyInputError on anything invalid. Takes effect on the next call. */
  async manageSetPolicy(a: Account, raw: unknown): Promise<AccountPolicy> {
    const next = parseAccountPolicy(raw);
    if (!(await this.store.setAccountPolicy(a.id, next))) throw new Error("No such account");
    await this.event("updated", { accountId: a.id, username: displayName(a) }, `mode_${next.mode}`);
    return next;
  }

  /** Change one session: its name, tools, agents and (optionally) its access level. False if it isn't this account's live session. */
  async manageSetSession(a: Account, grantId: string, change: { label?: unknown; tools?: unknown; agents?: unknown; level?: Scope | null }): Promise<SessionPolicy | null> {
    const g = await this.store.getGrant(grantId);
    if (!g || g.revoked || g.accountId !== a.id || g.clientId === "paperclip-plugin") return null;
    const before = readSessionPolicy(g.policy, KNOWN_TOOLS);
    const next = parseSessionPolicy({ label: change.label === undefined ? before.label : change.label, tools: change.tools === undefined ? before.tools : change.tools, agents: change.agents === undefined ? before.agents : change.agents }, KNOWN_TOOLS);
    if (!(await this.store.setGrantPolicy(g.id, next))) return null;
    if (change.level) await this.store.setGrantScopes(g.id, scopesUpTo(change.level));
    await this.event("updated", { accountId: a.id, username: displayName(a) }, "session_limits");
    return next;
  }

  /** The tools, as the control room lists them: what each does and which surface it is on. */
  manageTools() {
    return ALL_TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description.slice(0, 240), access: t.access, surface: surfaceOfTool(t) }));
  }

  /** The newest tool calls through this account's sessions (names and outcomes only; never arguments or results). */
  async manageActivity(a: Account, opts: { session?: string; limit: number }) {
    const grants = (await this.store.listAccountGrants(a.id)).filter((g) => g.clientId !== "paperclip-plugin");
    const ids = opts.session ? grants.filter((g) => g.id === opts.session).map((g) => g.id) : grants.map((g) => g.id);
    const byId = new Map(grants.map((g) => [g.id, readSessionPolicy(g.policy, KNOWN_TOOLS).label ?? g.clientName]));
    const rows = await this.store.recentCallsForGrants(ids, Math.min(Math.max(1, opts.limit), 200));
    return rows.map((r) => ({ at: r.at, tool: r.name, ok: r.ok, blocked: r.errorClass === "policy_blocked", status: r.status, error: r.errorClass, ms: r.totalMs, session: r.grantId, app: (r.grantId && byId.get(r.grantId)) || r.client }));
  }

  /** Change what a connected app may do: Read only or Full control. */
  async manageSetLevel(a: Account, grantId: string, level: Scope): Promise<boolean> {
    const g = await this.store.getGrant(grantId);
    if (!g || g.revoked || g.accountId !== a.id || g.clientId === "paperclip-plugin") return false;
    if (!(await this.store.setGrantScopes(g.id, scopesUpTo(level)))) return false;
    await this.event("updated", { accountId: a.id, username: displayName(a) }, `level_${level.split(":")[1]}`);
    return true;
  }

  async manageRevoke(a: Account, grantId: string): Promise<boolean> {
    const g = await this.store.getGrant(grantId);
    if (!g || g.revoked || g.accountId !== a.id || g.clientId === "paperclip-plugin") return false;
    await this.revokeGrant(g.id);
    return true;
  }

  manageSetPrivacy(a: Account, anonymous: boolean): Promise<Account> {
    return a.anonymous === anonymous ? Promise.resolve(a) : this.setPrivacy(a, anonymous);
  }

  /** A fresh secret key, shown once. The old one stops working at once. */
  async manageRotateSecret(a: Account): Promise<string> {
    const secret = generateSecretKey();
    await this.store.setAccountSecret(a.id, await hashSecretKey(normalizeSecretKey(secret)!));
    // A new secret key means "I may be compromised": every plugin link goes too (the caller relinks the plugin it came from).
    for (const g of await this.store.listAccountGrants(a.id)) if (g.clientId === "paperclip-plugin" && !g.revoked) await this.store.revokeGrant(g.id);
    await this.event("updated", { accountId: a.id, username: displayName(a) }, "secret_rotated");
    return secret;
  }

  /** Forget the stored Paperclip key (asking that Paperclip to revoke it) and disconnect every app. The account stays. */
  async manageDisconnectPaperclip(a: Account): Promise<void> {
    const l = await this.store.getLink(a.id);
    if (l) await this.dropConnection(l, "disconnected");
    else await this.store.revokeAccountGrants(a.id);
  }

  async manageDeleteAccount(a: Account): Promise<void> {
    const gone = await this.store.deleteAccount(a.id);
    if (gone) await this.revokeUpstream(gone.instanceUrl, gone.sealedCredential);
    await this.event("left", { accountId: a.id, username: displayName(a) }, "deleted");
  }

  async manageInstanceLabel(accountId: string): Promise<{ label: string | null; connected: boolean }> {
    const l = await this.store.getLink(accountId);
    return { label: l ? (l.instanceLabel ?? new URL(l.instanceUrl).host) : null, connected: !!l?.sealedCredential };
  }

  // ───────────── operator tools ─────────────

  async listUsers(limit = 1000) {
    const out = [];
    for (const a of await this.store.listAccounts(limit)) {
      const link = await this.store.getLink(a.id);
      out.push({ id: a.id, username: a.username, anonymous: !!a.anonymous, alias: a.alias ?? null, createdAt: a.createdAt, lastLoginAt: a.lastLoginAt, instance: link ? new URL(link.instanceUrl).host : null, connected: !!link?.sealedCredential, liveGrants: await this.store.countLiveGrants(a.id) });
    }
    return out;
  }

  /** Delete an account entirely: grants, stored credential (revoked upstream), username. */
  async deleteUser(username: string): Promise<boolean> {
    const a = await this.store.getAccountByKey(usernameKey(username));
    if (!a) return false;
    const gone = await this.store.deleteAccount(a.id);
    if (gone) await this.revokeUpstream(gone.instanceUrl, gone.sealedCredential);
    await this.event("left", { accountId: a.id, username: displayName(a) }, "deleted");
    return true;
  }

  /** Re-seal every stored credential with the current key (after rotating BRIDGE_SECRET). */
  async rotateKeys(): Promise<number> {
    let n = 0;
    for (const g of await this.store.listGrants()) {
      if (g.revoked || !g.sealedCredential || !this.keyring.needsRotation(g.sealedCredential)) continue;
      await this.store.putGrant({ ...g, sealedCredential: this.keyring.seal(this.keyring.unseal(g.sealedCredential)) });
      n += 1;
    }
    for (const a of await this.store.listAccounts(1_000_000)) {
      const l = await this.store.getLink(a.id);
      if (!l?.sealedCredential || !this.keyring.needsRotation(l.sealedCredential)) continue;
      await this.store.putLink({ ...l, sealedCredential: this.keyring.seal(this.keyring.unseal(l.sealedCredential)) });
      n += 1;
    }
    return n;
  }

  // ───────────── per-tenant plumbing ─────────────

  private checkedInstance(raw: string): URL {
    const u = parseInstanceUrl(raw, this.deps.oauth.instance);
    if (!hostAllowed(u.hostname, this.deps.oauth.instance.allowHosts)) throw new UnsafeUrlError("This service is not open to that host yet.");
    return u;
  }

  /** Wait for plugin installs that are still running (tests and graceful shutdown). */
  async drainBackground(): Promise<void> {
    await Promise.allSettled([...this.background]);
  }

  /**
   * Install the Papercliped plugin into the user's Paperclip after they approved the sign-in and ticked the box.
   * Runs after the page has been answered: npm can take a while on their side, and the connection must not wait for it
   * or fail because of it. The outcome is recorded as a "plugin" event and never carries anything but a short word.
   */
  private installPluginLater(p: PendingRecord, token: string): void {
    const instanceUrl = p.instanceUrl;
    if (!instanceUrl) return;
    const accountId = p.accountId ?? null;
    const run = (async () => {
      let outcome = "failed";
      try {
        const login = this.pluginLoginFor(instanceUrl);
        const now = await login.pluginState(token, PLUGIN_KEY);
        if (now.state === "unsupported") outcome = "unsupported";
        else if (now.state === "installed") outcome = "already";
        else outcome = await login.installPlugin(token, PLUGIN_PACKAGE, VERSION);
      } catch {
        outcome = "failed";
      }
      await this.event("plugin", await this.who(accountId), outcome);
    })();
    const tracked = run.finally(() => this.background.delete(tracked));
    this.background.add(tracked);
  }

  private pluginLoginFor(instanceUrl: string): PaperclipLogin {
    if (this.deps.loginFor) return this.deps.loginFor(instanceUrl);
    const origin = this.checkedInstance(instanceUrl).origin; // re-validated: policy can tighten between steps
    return new PaperclipLogin({ apiUrl: `${origin}/api`, publicOrigin: origin, fetch: this.installFetch, timeoutMs: PLUGIN_INSTALL_MS });
  }

  private loginFor(instanceUrl: string | null): PaperclipLogin {
    if (this.deps.loginFor) return this.deps.loginFor(instanceUrl);
    const { config, oauth } = this.deps;
    if (!this.multi) {
      return new PaperclipLogin({ apiUrl: config.apiUrl, publicOrigin: oauth.paperclipPublicUrl ?? new URL(config.apiUrl).origin, fetch, timeoutMs: config.timeoutMs });
    }
    if (!instanceUrl) throw new Error("No Paperclip instance chosen");
    const origin = this.checkedInstance(instanceUrl).origin;
    return new PaperclipLogin({ apiUrl: `${origin}/api`, publicOrigin: origin, fetch: this.safeFetch, timeoutMs: config.timeoutMs });
  }

  // ───────────── routing ─────────────

  /** Returns true if the request was an OAuth endpoint and has been answered. */
  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    const m = req.method ?? "GET";
    try {
      if (m === "GET" && (p === "/.well-known/oauth-protected-resource" || p === "/.well-known/oauth-protected-resource/mcp"))
        return this.json(res, 200, this.protectedResourceMetadata());
      if (m === "GET" && p === "/.well-known/oauth-authorization-server") return this.json(res, 200, this.serverMetadata());
      if (m === "POST" && p === "/register") return await this.register(req, res);
      if (m === "GET" && p === "/authorize") return await this.authorize(req, res, url);
      if (m === "GET" && p === "/authorize/status") return await this.authorizeStatus(req, res, url);
      if (m === "POST" && p === "/token") return await this.token(req, res);
      if (m === "POST" && p === "/revoke") return await this.revoke(req, res);
      if (m === "POST" && p.startsWith("/authorize/")) {
        const step = p.slice("/authorize/".length);
        if (this.accounts) {
          if (step === "login") return await this.stepLogin(req, res);
          if (step === "connect") return await this.stepConnect(req, res);
          if (step === "instance") return await this.stepInstance(req, res);
          if (step === "approved") return await this.stepApproved(req, res);
          if (step === "username") return await this.stepUsername(req, res);
          if (step === "welcome") return await this.stepWelcome(req, res);
          if (step === "continue") return await this.stepContinue(req, res);
          if (step === "decision") return await this.decisionAccount(req, res);
        } else if (step === "decision") return await this.decisionSingle(req, res);
        if (step === "instance" || step === "login" || step === "connect") return this.html(res, 404, errorPage("Not found", "This bridge is bound to a single Paperclip instance."));
      }
    } catch (err) {
      if (err instanceof OAuthError) {
        this.json(res, err.status, { error: err.code, error_description: err.message });
        return true;
      }
      throw err;
    }
    return false;
  }

  // ───────────── metadata ─────────────

  private protectedResourceMetadata() {
    return { resource: this.resource, authorization_servers: [this.deps.oauth.issuer], scopes_supported: [...SCOPES], bearer_methods_supported: ["header"], resource_name: "Papercliped" };
  }

  private serverMetadata() {
    const i = this.deps.oauth.issuer;
    return {
      issuer: i,
      authorization_endpoint: `${i}/authorize`,
      token_endpoint: `${i}/token`,
      registration_endpoint: `${i}/register`,
      revocation_endpoint: `${i}/revoke`,
      scopes_supported: [...SCOPES, "offline_access"],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      authorization_response_iss_parameter_supported: true,
    };
  }

  // ───────────── helpers ─────────────

  private ip = (req: IncomingMessage) => clientIp(req, this.deps.oauth.proxyHops);
  private limit = (key: string, n: number, windowMs = 60_000) => this.store.hit(key, n, windowMs);

  private json(res: ServerResponse, status: number, body: unknown): true {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", Pragma: "no-cache" });
    res.end(JSON.stringify(body));
    return true;
  }

  private html(res: ServerResponse, status: number, body: string, nonce?: string, formOrigin?: string): true {
    res.writeHead(status, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": `default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'self'; ${nonce ? `script-src 'nonce-${nonce}'; connect-src 'self'; ` : ""}form-action 'self'${formOrigin ? ` ${formOrigin}` : ""}; frame-ancestors 'none'; base-uri 'none'`,
    });
    res.end(body);
    return true;
  }

  private async readBody(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    let n = 0;
    for await (const c of req) {
      n += (c as Buffer).length;
      if (n > MAX_FORM_BYTES) throw new OAuthError("invalid_request", "Body too large", 413);
      chunks.push(c as Buffer);
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  private async readForm(req: IncomingMessage): Promise<URLSearchParams> {
    if (!(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/x-www-form-urlencoded"))
      throw new OAuthError("invalid_request", "Content-Type must be application/x-www-form-urlencoded");
    return new URLSearchParams(await this.readBody(req));
  }

  private redirectOk(raw: string): string | null {
    if (raw.length > 512) return "redirect_uri too long";
    const u = parseUri(raw);
    if (!u || u.hash || u.username || u.password) return "redirect_uri is not a valid absolute URI";
    if (u.protocol === "http:" && LOOPBACK.has(u.hostname)) return null;
    if (u.protocol !== "https:") return "redirect_uri must be https (or http on loopback)";
    const hosts = this.deps.oauth.redirectHosts;
    if (hosts.includes("*") || hosts.includes(u.hostname.toLowerCase())) return null;
    return `redirect host ${u.hostname} is not allowed on this bridge (see BRIDGE_OAUTH_REDIRECT_HOSTS)`;
  }

  /** Exact match, except loopback redirects ignore the port (RFC 8252 §7.3). */
  private redirectMatches(registered: string[], presented: string): boolean {
    const p = parseUri(presented);
    return registered.some((r) => {
      if (r === presented) return true;
      const u = parseUri(r);
      return !!u && !!p && u.protocol === "http:" && p.protocol === "http:" && LOOPBACK.has(u.hostname) && u.hostname === p.hostname && u.pathname === p.pathname && u.search === p.search;
    });
  }

  private ownResource = (r: string) => r === this.resource || r === this.deps.oauth.issuer || r === `${this.deps.oauth.issuer}/`;

  private redirectWith(res: ServerResponse, redirectUri: string, params: Record<string, string | undefined>): true {
    const u = new URL(redirectUri);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v);
    u.searchParams.set("iss", this.deps.oauth.issuer);
    res.writeHead(302, { Location: u.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    res.end();
    return true;
  }

  private unsealChallenge(p: PendingRecord): Challenge | null {
    return p.sealedChallenge ? (JSON.parse(this.keyring.unseal(p.sealedChallenge)) as Challenge) : null;
  }

  // ───────────── POST /register (RFC 7591, public clients only) ─────────────

  private async register(req: IncomingMessage, res: ServerResponse): Promise<true> {
    if (!(await this.limit(`reg:${this.ip(req)}`, 20))) throw new OAuthError("invalid_request", "Too many registrations", 429);
    let body: any;
    try {
      body = JSON.parse(await this.readBody(req));
    } catch {
      throw new OAuthError("invalid_client_metadata", "Body must be JSON");
    }
    const uris: unknown = body?.redirect_uris;
    if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10 || !uris.every((u) => typeof u === "string"))
      throw new OAuthError("invalid_redirect_uri", "redirect_uris must be a non-empty array of strings");
    for (const u of uris as string[]) {
      const why = this.redirectOk(u);
      if (why) throw new OAuthError("invalid_redirect_uri", why);
    }
    if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== "none")
      throw new OAuthError("invalid_client_metadata", "Only public clients (token_endpoint_auth_method=none) are supported");
    const name = typeof body.client_name === "string" && body.client_name.trim() ? body.client_name.trim().slice(0, 100) : "Unnamed application";
    const id = `pcb_c_${randomToken(16)}`;
    const t = this.now();
    await this.store.putClient({ id, name, redirectUris: uris as string[], createdAt: t, lastUsedAt: t });
    return this.json(res, 201, {
      client_id: id,
      client_id_issued_at: Math.floor(t / 1000),
      client_name: name,
      redirect_uris: uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: SCOPES.join(" "),
    });
  }

  // ───────────── GET /authorize ─────────────

  private async authorize(req: IncomingMessage, res: ServerResponse, url: URL): Promise<true> {
    const q = url.searchParams;
    const client = await this.store.getClient(q.get("client_id") ?? "");
    const redirectUri = q.get("redirect_uri") ?? "";
    // Until client + redirect_uri are trusted we must NOT redirect: show an error page instead.
    if (!client) return this.html(res, 400, errorPage("Unknown application", "This application is not registered. Remove and re-add the connector."));
    if (!redirectUri || !this.redirectMatches(client.redirectUris, redirectUri))
      return this.html(res, 400, errorPage("Invalid redirect", "The redirect address does not match the application's registration."));

    const state = q.get("state") ?? undefined;
    const fail = (error: string, description: string) => this.redirectWith(res, redirectUri, { error, error_description: description, state });
    if (q.get("response_type") !== "code") return fail("unsupported_response_type", "response_type must be code");
    const challenge = q.get("code_challenge") ?? "";
    if (!isValidCodeChallenge(challenge) || q.get("code_challenge_method") !== "S256") return fail("invalid_request", "PKCE with code_challenge_method=S256 is required");
    const resource = q.get("resource");
    if (resource && !this.ownResource(resource)) return fail("invalid_target", "Unknown resource");

    if (!(await this.limit(`authz:${this.ip(req)}`, 30))) return this.html(res, 429, errorPage("Too many requests", "Please wait a minute and try again."));
    if ((await this.store.countPending()) >= MAX_PENDING) return this.html(res, 503, errorPage("Busy", "Too many sign-ins in progress. Try again shortly."));

    const asked = (q.get("scope") ?? "").split(/\s+/).map(normalizeScope).filter(isScope);
    const requestedMax = asked.length ? levelOf(asked) : "paperclip:read";
    const rid = randomToken(24);
    const p: PendingRecord = { clientId: client.id, clientName: client.name, redirectUri, state, codeChallenge: challenge, requestedMax, csrf: randomToken(24), attempts: 0, expiresAt: this.now() + PENDING_TTL_MS };
    await this.store.touchClient(client.id);
    await this.event("started", null);

    if (this.accounts) {
      p.stage = "choose";
      await this.store.putPending(rid, p);
      return this.renderStage(res, rid, p);
    }
    if (this.deps.oauth.login === "paperclip") {
      try {
        // The name shows on Paperclip's approval page; include the real redirect host so a client can't pass itself off as another app.
        const ch = await this.loginFor(null).createChallenge(`${client.name} (via bridge, returns to ${new URL(redirectUri).host})`);
        p.sealedChallenge = this.keyring.seal(JSON.stringify(ch));
      } catch (e) {
        await this.event("connect_failed", null, "unreachable");
        return this.html(res, 502, errorPage("Cannot reach Paperclip", `The bridge could not start a sign-in with Paperclip: ${(e as Error).message}`));
      }
    }
    await this.store.putPending(rid, p);
    return this.renderConsent(res, rid, p, false);
  }

  // ───────────── single-instance consent (legacy flow) ─────────────

  private renderConsent(res: ServerResponse, rid: string, p: PendingRecord, approved: boolean, error?: string): true {
    const nonce = randomToken(12);
    const u = new URL(p.redirectUri);
    const ch = this.unsealChallenge(p);
    return this.html(
      res,
      error ? 400 : 200,
      consentPage({
        rid,
        csrf: p.csrf,
        clientName: p.clientName,
        redirectHost: u.host,
        loopbackOnly: u.protocol === "http:" && LOOPBACK.has(u.hostname),
        requestedMax: normalizeScope(p.requestedMax) as Scope,
        login: this.deps.oauth.login,
        approvalUrl: ch?.approvalUrl,
        approved,
        nonce,
        error,
        instanceHost: p.instanceUrl ? new URL(p.instanceUrl).host : undefined,
      }),
      nonce,
      u.origin,
    );
  }

  private async authorizeStatus(req: IncomingMessage, res: ServerResponse, url: URL): Promise<true> {
    if (!(await this.limit(`stat:${this.ip(req)}`, 120))) return this.json(res, 429, { error: "rate_limited" });
    const p = await this.store.getPending(url.searchParams.get("rid") ?? "");
    const ch = p && this.unsealChallenge(p);
    if (!p || !ch) return this.json(res, 200, { approved: false });
    try {
      return this.json(res, 200, { approved: (await this.login(p.instanceUrl ?? null).status(ch)) === "approved" });
    } catch {
      return this.json(res, 200, { approved: false });
    }
  }

  private login = (instanceUrl: string | null) => this.loginFor(instanceUrl);

  private async decisionSingle(req: IncomingMessage, res: ServerResponse): Promise<true> {
    const ip = this.ip(req);
    if (!(await this.limit(`dec:${ip}`, 20))) return this.html(res, 429, errorPage("Too many attempts", "Please wait a minute and try again."));
    const f = await this.readForm(req);
    const rid = f.get("rid") ?? "";
    const p = await this.store.getPending(rid);
    if (!p) return this.html(res, 400, errorPage("Request expired", "This authorization request expired. Start the connection again from the app."));
    if (!safeEqual(f.get("csrf") ?? "", p.csrf)) return this.html(res, 400, errorPage("Invalid request", "Security token mismatch. Start again from the app."));
    if (f.get("action") === "deny") {
      await this.store.deletePending(rid);
      await this.event("connect_failed", null, "denied");
      return this.redirectWith(res, p.redirectUri, { error: "access_denied", error_description: "The user denied the request", state: p.state });
    }
    const allowed = grantableScopes();
    const level = (f.get("level") ?? "") as Scope;
    if (!allowed.includes(level)) return this.renderConsent(res, rid, p, false, "Choose an access level.");

    let credential: string | null;
    let userId: string | null = null;
    if (this.deps.oauth.login === "paperclip") {
      const ch = this.unsealChallenge(p)!;
      const login = this.loginFor(null);
      let status: Awaited<ReturnType<PaperclipLogin["status"]>>;
      try {
        status = await login.status(ch);
      } catch (e) {
        return this.renderConsent(res, rid, p, false, `Could not check Paperclip: ${(e as Error).message}`);
      }
      if (status === "cancelled" || status === "expired") {
        await this.store.deletePending(rid);
        await this.event("connect_failed", null, "expired");
        return this.html(res, 400, errorPage("Sign-in ended", `The Paperclip approval was ${status}. Start the connection again from the app.`));
      }
      if (status !== "approved") return this.renderConsent(res, rid, p, false, "Not approved in Paperclip yet. Approve it in the Paperclip tab, then press Allow again.");
      try {
        userId = (await login.whoami(ch.boardApiToken)).userId;
      } catch (e) {
        return this.renderConsent(res, rid, p, false, `Paperclip did not accept the approved credential: ${(e as Error).message}`);
      }
      credential = ch.boardApiToken;
    } else {
      if (!(await this.limit(`pw:${ip}`, 5))) return this.html(res, 429, errorPage("Too many attempts", "Wait a minute before trying the token again."));
      if (!safeEqual(f.get("password") ?? "", this.deps.bridgeToken ?? "\0")) return this.renderConsent(res, rid, p, false, "Incorrect bridge admin token.");
      credential = this.deps.config.apiKey;
    }

    const code = `pcb_ac_${randomToken(32)}`;
    await this.store.putCode(sha256Hex(code), {
      clientId: p.clientId,
      redirectUri: p.redirectUri,
      codeChallenge: p.codeChallenge,
      scopes: scopesUpTo(level),
      clientName: p.clientName,
      userId,
      instanceUrl: p.instanceUrl ?? null,
      sealedCredential: credential ? this.keyring.seal(credential) : null,
      expiresAt: this.now() + CODE_TTL_MS,
    });
    await this.store.deletePending(rid);
    return this.redirectWith(res, p.redirectUri, { code, state: p.state });
  }

  // ───────────── account flow (multi-tenant) ─────────────

  private page(res: ServerResponse, status: number, html: string, p: PendingRecord, nonce?: string): true {
    return this.html(res, status, html, nonce, new URL(p.redirectUri).origin);
  }

  private ctx(rid: string, p: PendingRecord, error?: string) {
    return { rid, csrf: p.csrf, clientName: p.clientName, redirectHost: new URL(p.redirectUri).host, error };
  }

  /** Render whatever page matches the pending request's current stage (also used to recover from back-button / double-submits). */
  private async renderStage(res: ServerResponse, rid: string, p: PendingRecord, error?: string, extra: { value?: string; notice?: string } = {}): Promise<true> {
    const status = error ? 400 : 200;
    const c = this.ctx(rid, p, error);
    switch (p.stage) {
      case "instance":
        return this.page(res, status, instancePage({ ...c, value: extra.value, notice: extra.notice, installPlugin: p.installPlugin }), p);
      case "approve": {
        const ch = this.unsealChallenge(p);
        if (!ch || !p.instanceUrl) {
          p.stage = "instance";
          await this.store.putPending(rid, p);
          return this.renderStage(res, rid, p, error);
        }
        const nonce = randomToken(12);
        return this.page(res, status, approvePage({ ...c, approvalUrl: ch.approvalUrl, instanceHost: new URL(p.instanceUrl).host, approved: false, nonce }), p, nonce);
      }
      case "username":
        return this.page(res, status, usernamePage({ ...c, value: extra.value }), p);
      case "welcome":
        return this.page(res, status, welcomePage({ ...c, username: p.username ?? "" }), p);
      case "secret": // the key can only be shown once, at creation: a reload goes on to the next step
        p.stage = "consent";
        await this.store.putPending(rid, p);
        return this.renderStage(res, rid, p, error ?? "Your secret key can't be shown again. If you didn't save it, connect your Paperclip next time to get a new one.");
      case "consent": {
        const link = p.accountId ? await this.store.getLink(p.accountId) : undefined;
        const u = new URL(p.redirectUri);
        const acct = p.accountId ? await this.store.getAccount(p.accountId) : undefined;
        return this.page(res, status, scopePage({ ...c, requestedMax: normalizeScope(p.requestedMax) as Scope, loopbackOnly: u.protocol === "http:" && LOOPBACK.has(u.hostname), instanceHost: link ? new URL(link.instanceUrl).host : "your Paperclip", username: p.username ?? "", anonymous: !!acct?.anonymous, alias: acct?.alias ?? null}), p);
      }
      default:
        return this.page(res, status, choosePage(c), p);
    }
  }

  /** Common front matter for every account-flow POST: rate limit, parse, find the request, check CSRF, handle Cancel. */
  private async loadStep(req: IncomingMessage, res: ServerResponse, stages: string[]): Promise<Step | null> {
    if (!(await this.limit(`step:${this.ip(req)}`, 120))) {
      this.html(res, 429, errorPage("Too many attempts", "Please wait a minute and try again."));
      return null;
    }
    const f = await this.readForm(req);
    const rid = f.get("rid") ?? "";
    const p = await this.store.getPending(rid);
    if (!p) {
      this.html(res, 400, errorPage("Request expired", "This sign-in expired. Start the connection again from the app."));
      return null;
    }
    if (!safeEqual(f.get("csrf") ?? "", p.csrf)) {
      this.html(res, 400, errorPage("Invalid request", "Security token mismatch. Start again from the app."));
      return null;
    }
    if (f.get("action") === "deny") {
      await this.store.deletePending(rid);
      await this.event("connect_failed", await this.who(p.accountId), "denied");
      this.redirectWith(res, p.redirectUri, { error: "access_denied", error_description: "The user cancelled", state: p.state });
      return null;
    }
    if (!p.stage || !stages.includes(p.stage)) {
      await this.renderStage(res, rid, p); // out of order: show where they actually are
      return null;
    }
    return { f, p, rid };
  }

  /** Swap in a new Paperclip credential for an account, revoking the one it replaces. */
  private async replaceLink(accountId: string, instanceUrl: string, paperclipUserId: string, credential: string): Promise<boolean> {
    const old = await this.store.getLink(accountId);
    const t = this.now();
    const acct = await this.store.getAccount(accountId);
    const instanceLabel = acct ? this.instanceLabelFor(acct, instanceUrl, old) : new URL(instanceUrl).host;
    const ok = await this.store.putLink({ accountId, instanceUrl, paperclipUserId, sealedCredential: this.keyring.seal(credential), credentialExpiresAt: t + PAPERCLIP_KEY_TTL_MS, createdAt: old?.createdAt ?? t, connectedAt: t, lastUsedAt: t, instanceLabel });
    if (ok && old?.sealedCredential) {
      let same = false;
      try {
        same = this.keyring.unseal(old.sealedCredential) === credential;
      } catch {
        /* unreadable old key: just revoke it */
      }
      if (!same) await this.revokeUpstream(old.instanceUrl, old.sealedCredential);
    }
    return ok;
  }

  // POST /authorize/login — username + secret key
  private async stepLogin(req: IncomingMessage, res: ServerResponse): Promise<true> {
    const s = await this.loadStep(req, res, ["choose"]);
    if (!s) return true;
    const { f, p, rid } = s;
    const typed = (f.get("username") ?? "").trim().slice(0, 64);
    const key = usernameKey(typed);
    const generic = "That username and secret key don't match.";
    const throttled = !(await this.limit(`login:ip:${this.ip(req)}`, 20)) || !(await this.limit(`login:user:${key}`, 8, 15 * 60_000));
    if (throttled) {
      await this.event("login_failed", null, "rate_limited");
      return this.page(res, 429, choosePage({ ...this.ctx(rid, p, "Too many attempts. Please wait a few minutes and try again."), username: typed }), p);
    }
    const account = typed ? await this.store.getAccountByKey(key) : undefined;
    const valid = account && !account.disabled ? await verifySecretKey(f.get("secret"), account.secretHash) : (await burnVerify(f.get("secret")), false);
    if (!account || !valid) {
      await this.event("login_failed", account ? { accountId: account.id, username: displayName(account) } : null, "bad_credentials");
      return this.page(res, 400, choosePage({ ...this.ctx(rid, p, generic), username: typed }), p);
    }
    await this.store.touchAccountLogin(account.id, this.now());
    await this.event("login", { accountId: account.id, username: displayName(account) }, new URL(p.redirectUri).host);
    p.accountId = account.id;
    p.username = account.username;
    p.path = "login";

    // Do we still hold a working Paperclip key for this account?
    const link = await this.store.getLink(account.id);
    let alive = false;
    let unreachable = false;
    if (link?.sealedCredential) {
      try {
        await this.login(link.instanceUrl).whoami(this.keyring.unseal(link.sealedCredential));
        alive = true;
      } catch (e) {
        if (!(e instanceof LoginError && (e.status === 401 || e.status === 403))) unreachable = true;
      }
    }
    if (alive) {
      p.stage = "consent";
      await this.store.putPending(rid, p);
      return this.renderStage(res, rid, p);
    }
    if (unreachable) {
      p.stage = "choose";
      p.accountId = undefined;
      p.username = undefined;
      await this.store.putPending(rid, p);
      return this.page(res, 502, choosePage({ ...this.ctx(rid, p, "We couldn't reach your Paperclip right now. Try again in a minute, or connect your Paperclip again."), username: typed }), p);
    }
    // Key missing/expired: reconnect, but keep the username.
    p.stage = "instance";
    await this.store.putPending(rid, p);
    return this.renderStage(res, rid, p, undefined, { value: link ? new URL(link.instanceUrl).host : "", notice: "Your Paperclip connection has expired. Reconnect it to continue; your username stays the same." });
  }

  // POST /authorize/connect — "Connect your Paperclip"
  private async stepConnect(req: IncomingMessage, res: ServerResponse): Promise<true> {
    const s = await this.loadStep(req, res, ["choose"]);
    if (!s) return true;
    s.p.stage = "instance";
    s.p.path = "connect";
    await this.store.putPending(s.rid, s.p);
    return this.renderStage(res, s.rid, s.p);
  }

  // POST /authorize/instance — which Paperclip? validate, probe, start the approval there
  private async stepInstance(req: IncomingMessage, res: ServerResponse): Promise<true> {
    if (!(await this.limit(`inst:${this.ip(req)}`, 20))) return this.html(res, 429, errorPage("Too many attempts", "Please wait a minute and try again."));
    const s = await this.loadStep(req, res, ["instance"]);
    if (!s) return true;
    const { f, p, rid } = s;
    // Each attempt makes the bridge contact a stranger-supplied host: bound them per request.
    if (p.attempts >= MAX_INSTANCE_ATTEMPTS) {
      await this.store.deletePending(rid);
      await this.event("connect_failed", await this.who(p.accountId), "too_many_attempts");
      return this.html(res, 429, errorPage("Too many attempts", "Too many addresses tried. Start again from the app."));
    }
    p.attempts += 1;
    p.installPlugin = f.get("install_plugin") === "on";
    const typed = (f.get("instance") ?? "").slice(0, 300);
    const fail = async (why: string, detail: string) => {
      await this.store.putPending(rid, p);
      if (p.attempts === 1) await this.event("connect_failed", await this.who(p.accountId), detail);
      return this.renderStage(res, rid, p, why, { value: typed });
    };

    let origin: URL;
    try {
      origin = this.checkedInstance(typed);
    } catch (e) {
      return fail(e instanceof UnsafeUrlError ? e.message : "Invalid address.", "invalid_instance");
    }
    const login = this.loginFor(origin.origin);
    try {
      const probe = await login.probe();
      if (!probe.ok) return fail(probe.reason, "unreachable");
      const ch = await login.createChallenge(`${p.clientName} (via Papercliped, returns to ${new URL(p.redirectUri).host})`);
      p.instanceUrl = origin.origin;
      p.sealedChallenge = this.keyring.seal(JSON.stringify(ch));
    } catch (e) {
      return fail(e instanceof LoginError ? e.message : "Papercliped could not complete a sign-in with that Paperclip.", "unreachable");
    }
    p.stage = "approve";
    await this.store.putPending(rid, p);
    return this.renderStage(res, rid, p);
  }

  // POST /authorize/approved — did they approve in Paperclip? who are they?
  private async stepApproved(req: IncomingMessage, res: ServerResponse): Promise<true> {
    const s = await this.loadStep(req, res, ["approve"]);
    if (!s) return true;
    const { p, rid } = s;
    const ch = this.unsealChallenge(p);
    if (!ch || !p.instanceUrl) {
      p.stage = "instance";
      await this.store.putPending(rid, p);
      return this.renderStage(res, rid, p);
    }
    const login = this.loginFor(p.instanceUrl);
    let status: Awaited<ReturnType<PaperclipLogin["status"]>>;
    try {
      status = await login.status(ch);
    } catch (e) {
      return this.renderStage(res, rid, p, `Could not check Paperclip: ${(e as Error).message}`);
    }
    if (status === "cancelled" || status === "expired") {
      await this.store.deletePending(rid);
      await this.event("connect_failed", await this.who(p.accountId), "expired");
      return this.html(res, 400, errorPage("Sign-in ended", `The Paperclip approval was ${status}. Start the connection again from the app.`));
    }
    if (status !== "approved") return this.renderStage(res, rid, p, "Not approved in Paperclip yet. Approve it in the other tab, then press Continue.");

    let userId: string | null;
    try {
      userId = (await login.whoami(ch.boardApiToken)).userId;
    } catch (e) {
      return this.renderStage(res, rid, p, `Paperclip did not accept the approved credential: ${(e as Error).message}`);
    }
    if (!userId) return this.renderStage(res, rid, p, "Paperclip did not say who you are, so we can't link a username to it.");
    if (p.installPlugin) this.installPluginLater(p, ch.boardApiToken);

    const owner = await this.store.getLinkByIdentity(p.instanceUrl, userId);
    if (p.accountId) {
      // Reconnecting an account the user already signed in to with their secret key.
      if (owner && owner.accountId !== p.accountId) {
        p.stage = "choose";
        p.accountId = undefined;
        p.username = undefined;
        p.sealedChallenge = undefined;
        await this.store.putPending(rid, p);
        return this.page(res, 400, choosePage(this.ctx(rid, p, "That Paperclip account is already linked to a different Papercliped username. Log in with that username and its secret key.")), p);
      }
      if (!(await this.replaceLink(p.accountId, p.instanceUrl, userId, ch.boardApiToken))) return this.renderStage(res, rid, p, "Could not save your connection. Please try again.");
      await this.event("updated", await this.who(p.accountId), "reconnect");
      p.sealedChallenge = undefined;
      p.stage = "consent";
      await this.store.putPending(rid, p);
      return this.renderStage(res, rid, p);
    }
    if (owner) {
      // Known Paperclip identity: signing in with Paperclip's approval IS the proof, so log them straight in.
      const acct = await this.store.getAccount(owner.accountId);
      if (!acct || acct.disabled) return this.renderStage(res, rid, p, "This account is unavailable.");
      if (!(await this.replaceLink(acct.id, p.instanceUrl, userId, ch.boardApiToken))) return this.renderStage(res, rid, p, "Could not save your connection. Please try again.");
      await this.store.touchAccountLogin(acct.id, this.now());
      await this.event("updated", { accountId: acct.id, username: displayName(acct) }, "reconnect");
      p.accountId = acct.id;
      p.username = acct.username;
      p.sealedChallenge = undefined;
      p.stage = "welcome";
      await this.store.putPending(rid, p);
      return this.renderStage(res, rid, p);
    }
    p.paperclipUserId = userId;
    p.stage = "username";
    await this.store.putPending(rid, p);
    return this.renderStage(res, rid, p);
  }

  // POST /authorize/username — new user picks a name; we create the account and mint the secret key
  private async stepUsername(req: IncomingMessage, res: ServerResponse): Promise<true> {
    if (!(await this.limit(`signup:${this.ip(req)}`, 10))) return this.html(res, 429, errorPage("Too many attempts", "Please wait a minute and try again."));
    const s = await this.loadStep(req, res, ["username"]);
    if (!s) return true;
    const { f, p, rid } = s;
    const typed = (f.get("username") ?? "").slice(0, 64);
    const v = validateUsername(typed);
    if (!v.ok) return this.renderStage(res, rid, p, v.reason, { value: typed });
    const ch = this.unsealChallenge(p);
    if (!ch || !p.instanceUrl || !p.paperclipUserId) {
      p.stage = "instance";
      await this.store.putPending(rid, p);
      return this.renderStage(res, rid, p);
    }
    const secret = generateSecretKey();
    const t = this.now();
    const wantsAnon = f.get("anonymous") === "on";
    const account: Account = { id: `pcb_a_${randomToken(12)}`, username: v.username, usernameKey: v.key, secretHash: await hashSecretKey(normalizeSecretKey(secret)!), createdAt: t, lastLoginAt: t, disabled: false, anonymous: false, alias: null };
    let created = false;
    for (let i = 0; i < 25 && !created; i++) {
      if (wantsAnon) {
        account.anonymous = true;
        account.alias = generateAlias();
      }
      try {
        created = await this.store.createAccount(account);
      } catch (e) {
        if (!(e instanceof AliasTakenError)) throw e; // draw another alias
        continue;
      }
      if (!created) return this.renderStage(res, rid, p, "That username is taken. Please choose another.", { value: typed });
    }
    if (!created) return this.renderStage(res, rid, p, "Could not reserve an anonymous name right now. Please try again.", { value: typed });
    const linked = await this.store.putLink({ accountId: account.id, instanceUrl: p.instanceUrl, paperclipUserId: p.paperclipUserId, sealedCredential: this.keyring.seal(ch.boardApiToken), credentialExpiresAt: t + PAPERCLIP_KEY_TTL_MS, createdAt: t, connectedAt: t, lastUsedAt: t, instanceLabel: this.instanceLabelFor(account, p.instanceUrl) });
    if (!linked) {
      await this.store.deleteAccount(account.id); // lost a race for this Paperclip identity
      p.stage = "choose";
      p.sealedChallenge = undefined;
      await this.store.putPending(rid, p);
      return this.page(res, 409, choosePage(this.ctx(rid, p, "That Paperclip account was just linked to another username. Log in with it instead.")), p);
    }
    await this.event("joined", { accountId: account.id, username: displayName(account) }, this.instanceLabelFor(account, p.instanceUrl));
    p.accountId = account.id;
    p.username = account.username;
    p.path = "new";
    p.sealedChallenge = undefined; // the credential now lives only on the account link
    p.stage = "secret";
    await this.store.putPending(rid, p);
    const nonce = randomToken(12);
    return this.page(res, 200, secretPage({ ...this.ctx(rid, p), username: account.username, secret, rotated: false, nonce }), p, nonce); // shown here, once, and never stored
  }

  // POST /authorize/welcome — returning user: continue, or make a new secret key
  private async stepWelcome(req: IncomingMessage, res: ServerResponse): Promise<true> {
    const s = await this.loadStep(req, res, ["welcome"]);
    if (!s) return true;
    const { f, p, rid } = s;
    if (f.get("action") === "rotate" && p.accountId) {
      const secret = generateSecretKey();
      await this.store.setAccountSecret(p.accountId, await hashSecretKey(normalizeSecretKey(secret)!));
      await this.event("updated", await this.who(p.accountId), "secret_rotated");
      p.stage = "secret";
      await this.store.putPending(rid, p);
      const nonce = randomToken(12);
      return this.page(res, 200, secretPage({ ...this.ctx(rid, p), username: p.username ?? "", secret, rotated: true, nonce }), p, nonce);
    }
    p.stage = "consent";
    await this.store.putPending(rid, p);
    return this.renderStage(res, rid, p);
  }

  // POST /authorize/continue — after the secret key screen
  private async stepContinue(req: IncomingMessage, res: ServerResponse): Promise<true> {
    const s = await this.loadStep(req, res, ["secret"]);
    if (!s) return true;
    s.p.stage = "consent";
    await this.store.putPending(s.rid, s.p);
    return this.renderStage(res, s.rid, s.p);
  }

  // POST /authorize/decision — choose the access level and issue the code
  private async decisionAccount(req: IncomingMessage, res: ServerResponse): Promise<true> {
    const s = await this.loadStep(req, res, ["consent"]);
    if (!s) return true;
    const { f, p, rid } = s;
    const allowed = grantableScopes();
    const level = (f.get("level") ?? "") as Scope;
    if (!allowed.includes(level)) return this.renderStage(res, rid, p, "Choose an access level.");
    const link = p.accountId ? await this.store.getLink(p.accountId) : undefined;
    if (!p.accountId || !link?.sealedCredential) {
      p.stage = "instance";
      await this.store.putPending(rid, p);
      return this.renderStage(res, rid, p, undefined, { notice: "Your Paperclip connection is missing. Reconnect to continue." });
    }
    let acct = (await this.store.getAccount(p.accountId))!;
    if (f.get("privacy_present") === "1") {
      const want = f.get("anonymous") === "on";
      if (want !== !!acct.anonymous) acct = await this.setPrivacy(acct, want);
    }
    const code = `pcb_ac_${randomToken(32)}`;
    await this.store.putCode(sha256Hex(code), {
      clientId: p.clientId,
      redirectUri: p.redirectUri,
      codeChallenge: p.codeChallenge,
      scopes: scopesUpTo(level),
      clientName: p.clientName,
      userId: null,
      instanceUrl: link.instanceUrl,
      sealedCredential: null, // the credential stays on the account link
      accountId: p.accountId,
      username: displayName(acct), // grants carry the DISPLAY name: that is what audit rows and the operator dashboard see
      path: p.path ?? "connect",
      expiresAt: this.now() + CODE_TTL_MS,
    });
    await this.store.deletePending(rid);
    return this.redirectWith(res, p.redirectUri, { code, state: p.state });
  }

  // ───────────── POST /token ─────────────

  private async token(req: IncomingMessage, res: ServerResponse): Promise<true> {
    if (!(await this.limit(`tok:${this.ip(req)}`, 60))) throw new OAuthError("invalid_request", "Rate limited", 429);
    const f = await this.readForm(req);
    switch (f.get("grant_type")) {
      case "authorization_code":
        return this.json(res, 200, await this.exchangeCode(f));
      case "refresh_token":
        return this.json(res, 200, await this.exchangeRefresh(f));
      default:
        throw new OAuthError("unsupported_grant_type", "grant_type must be authorization_code or refresh_token");
    }
  }

  private async exchangeCode(f: URLSearchParams) {
    const hash = sha256Hex(f.get("code") ?? "");
    const taken = await this.store.takeCode(hash);
    if (taken.status === "missing") throw new OAuthError("invalid_grant", "Invalid or expired authorization code");
    if (taken.status === "replay") {
      // Replay of an already-used code: assume theft and kill whatever it produced.
      if (taken.grantId) await this.revokeGrant(taken.grantId);
      throw new OAuthError("invalid_grant", "Authorization code already used");
    }
    const entry = taken.record;
    if (f.get("client_id") !== entry.clientId) throw new OAuthError("invalid_grant", "client_id mismatch");
    if (f.get("redirect_uri") !== entry.redirectUri) throw new OAuthError("invalid_grant", "redirect_uri mismatch");
    if (!verifyPkce(f.get("code_verifier") ?? "", entry.codeChallenge)) throw new OAuthError("invalid_grant", "PKCE verification failed");

    const t = this.now();
    const grant: Grant = {
      id: `pcb_g_${randomToken(12)}`,
      clientId: entry.clientId,
      clientName: entry.clientName,
      userId: entry.userId,
      scopes: entry.scopes,
      resource: this.resource,
      instanceUrl: entry.instanceUrl,
      sealedCredential: entry.sealedCredential,
      // A key from an approved sign-in expires with Paperclip's default; the operator's own PAPERCLIP_API_KEY is never rotated.
      credentialExpiresAt: entry.sealedCredential && this.keyring.unseal(entry.sealedCredential) !== this.deps.config.apiKey ? t + PAPERCLIP_KEY_TTL_MS : null,
      accountId: entry.accountId ?? null,
      username: entry.username ?? null,
      createdAt: t,
      lastUsedAt: t,
      revoked: false,
    };
    await this.store.putGrant(grant);
    await this.store.setCodeGrant(hash, grant.id);
    await this.event("completed", { accountId: grant.accountId, username: grant.username }, entry.path ?? "connect");
    return this.issue(grant);
  }

  private async exchangeRefresh(f: URLSearchParams) {
    const hash = sha256Hex(f.get("refresh_token") ?? "");
    const rec = await this.store.getRefresh(hash);
    const grant = rec && (await this.store.getGrant(rec.grantId));
    if (!rec || !grant || grant.revoked) throw new OAuthError("invalid_grant", "Invalid refresh token");
    if (rec.consumed || !(await this.store.consumeRefresh(hash))) {
      await this.revokeGrant(grant.id); // reuse of a rotated token ⇒ treat the whole grant as compromised
      throw new OAuthError("invalid_grant", "Refresh token already used");
    }
    if (f.get("client_id") !== grant.clientId) throw new OAuthError("invalid_grant", "client_id mismatch");
    const asked = (f.get("scope") ?? "").split(/\s+/).filter(Boolean).map(normalizeScope);
    if (asked.some((s) => !isScope(s) || !scopeAllows(grant.scopes, s))) throw new OAuthError("invalid_scope", "Requested scope exceeds the original grant");
    return this.issue(grant);
  }

  private async issue(grant: Grant) {
    const t = this.now();
    const access = `pcb_at_${randomToken(32)}`;
    const refresh = `pcb_rt_${randomToken(32)}`;
    await this.store.putAccess(sha256Hex(access), { grantId: grant.id, expiresAt: t + this.deps.oauth.accessTtlSec * 1000 });
    await this.store.putRefresh(sha256Hex(refresh), { grantId: grant.id, expiresAt: t + this.deps.oauth.refreshTtlSec * 1000 });
    return { access_token: access, token_type: "Bearer", expires_in: this.deps.oauth.accessTtlSec, refresh_token: refresh, scope: normalizeScopes(grant.scopes).join(" ") };
  }

  // ───────────── POST /revoke (RFC 7009) ─────────────

  private async revoke(req: IncomingMessage, res: ServerResponse): Promise<true> {
    if (!(await this.limit(`rev:${this.ip(req)}`, 30))) throw new OAuthError("invalid_request", "Rate limited", 429);
    const f = await this.readForm(req);
    const rec = await this.store.findAnyToken(sha256Hex(f.get("token") ?? ""));
    if (rec) await this.revokeGrant(rec.grantId);
    return this.json(res, 200, {}); // always 200: don't reveal whether the token existed
  }
}
