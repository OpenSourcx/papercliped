import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AccountPolicy, SessionPolicy } from "../access/policy.js";
import { AliasTakenError, type Account, type AccountLink, type NodeSample, type PrivacyChange, type UserEvent, type UserEventBucket } from "../accounts/types.js";
import { PAPERCLIP_KEY_TTL_MS } from "./paperclip-login.js";
import { HIST_EDGES, isFault, type AuditReader, type AuditRow, type AuditStore, type BreakdownRow, type SeriesBucket, type Totals } from "../telemetry/types.js";

export interface OAuthClient {
  id: string;
  name: string;
  redirectUris: string[];
  createdAt: number;
  lastUsedAt: number;
}

export interface Grant {
  id: string;
  clientId: string;
  clientName: string;
  userId: string | null;
  scopes: string[];
  resource: string;
  /** Origin of the user's Paperclip instance (multi-tenant mode); null in single-instance mode. */
  instanceUrl: string | null;
  /** Sealed Paperclip credential (null when Paperclip needs none, after revocation, or when the account link holds it). */
  sealedCredential: string | null;
  /** When Paperclip expires that credential (ms epoch). null = never (or not one Paperclip issued us); absent (old JSON stores) = createdAt + Paperclip's default TTL. */
  credentialExpiresAt?: number | null;
  /** Papercliped account (multi-tenant mode): the credential then lives on the account's link, not here. */
  accountId?: string | null;
  username?: string | null;
  createdAt: number;
  lastUsedAt: number;
  revoked: boolean;
  /** Per-session limits: a name, which tools, which agents. Absent = no limits beyond the access level. */
  policy?: SessionPolicy | null;
}

/** Where a Paperclip credential is stored: on an account's link, or (without accounts) on a grant. */
export interface CredentialHolder {
  kind: "link" | "grant";
  /** The account id for a link, the grant id for a grant. */
  id: string;
}

/** A stored credential's expiry; old rows without one are assumed to carry Paperclip's default TTL from `issuedAt`. */
export function credentialExpiry(expiresAt: number | null | undefined, issuedAt: number): number | null {
  return expiresAt === undefined ? issuedAt + PAPERCLIP_KEY_TTL_MS : expiresAt;
}

export interface TokenRecord {
  grantId: string;
  expiresAt: number;
  consumed?: boolean;
}

/** In-flight consent request. Anything sensitive is already sealed by the provider; the store treats it as opaque. */
export interface PendingRecord {
  clientId: string;
  clientName: string;
  redirectUri: string;
  state?: string;
  codeChallenge: string;
  requestedMax: string;
  csrf: string;
  /** Multi-tenant: the Paperclip origin chosen on the instance step. */
  instanceUrl?: string;
  /** Sealed JSON of the Paperclip login challenge (contains the pending board token). */
  sealedChallenge?: string;
  /** The user's choice on the instance step: also install the Papercliped plugin into their Paperclip. Unset = never asked (shown ticked). */
  installPlugin?: boolean;
  /** Instance-step attempts, to bound probing through the bridge. */
  attempts: number;
  /** Account flow: where the user is in the sign-in. */
  stage?: string;
  accountId?: string;
  username?: string;
  /** The Paperclip user id learned from the approved challenge. */
  paperclipUserId?: string;
  /** login = signed in with the secret key; connect = via Paperclip approval. */
  path?: "login" | "connect" | "new";
  expiresAt: number;
}

export interface CodeRecord {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  clientName: string;
  userId: string | null;
  instanceUrl: string | null;
  sealedCredential: string | null;
  accountId?: string | null;
  username?: string | null;
  /** How the user got here: new | connect | login (for the community log). */
  path?: string | null;
  expiresAt: number;
}

export type CodeTake = { status: "ok"; record: CodeRecord } | { status: "replay"; grantId?: string } | { status: "missing" };

/**
 * Persistence boundary. Implementations must be safe to share between processes (the Postgres one is);
 * the in-memory/JSON one is single-process. Raw tokens are never stored — only SHA-256 hashes.
 */
export interface UserCounts {
  /** event kind → count in the window */
  byKind: Record<string, number>;
  /** failure reasons: `${kind}:${detail}` → count */
  failures: Record<string, number>;
}

export interface AccountStore {
  /** False if the username (case-insensitively) is taken. Throws AliasTakenError if the alias is. */
  createAccount(a: Account): Promise<boolean>;
  setAccountBeta(id: string, beta: boolean): Promise<void>;
  /** Every grant (live or revoked) of an account, oldest first. */
  listAccountGrants(accountId: string): Promise<Grant[]>;
  /** Replace a LIVE grant's scopes (takes effect on the next call). False if it is missing or revoked. */
  setGrantScopes(id: string, scopes: string[]): Promise<boolean>;
  /** Replace a LIVE grant's per-session limits (null = none). False if it is missing or revoked. */
  setGrantPolicy(id: string, policy: SessionPolicy | null): Promise<boolean>;
  /** Replace the account's access switch and per-agent overrides. False if the account is missing. */
  setAccountPolicy(id: string, policy: AccountPolicy): Promise<boolean>;
  /** The newest tool calls made through these sessions, newest first. */
  recentCallsForGrants(grantIds: readonly string[], limit: number): Promise<AuditRow[]>;
  /** Turn anonymity on/off: updates the account and rewrites what logs, grants and audit rows show. */
  setAccountPrivacy(id: string, change: PrivacyChange): Promise<"ok" | "alias_taken" | "missing">;
  getAccountByKey(usernameKey: string): Promise<Account | undefined>;
  getAccount(id: string): Promise<Account | undefined>;
  setAccountSecret(id: string, secretHash: string): Promise<void>;
  touchAccountLogin(id: string, at: number): Promise<void>;
  countAccounts(): Promise<number>;
  listAccounts(limit: number): Promise<Account[]>;
  /** Removes the account, its link and its grants/tokens. Returns what was stored so the caller can revoke upstream. */
  deleteAccount(id: string): Promise<{ sealedCredential: string | null; instanceUrl: string | null } | null>;

  /** Insert or replace the account's link. False if another account already owns that Paperclip identity. */
  putLink(l: AccountLink): Promise<boolean>;
  getLink(accountId: string): Promise<AccountLink | undefined>;
  getLinkByIdentity(instanceUrl: string, paperclipUserId: string): Promise<AccountLink | undefined>;
  touchLink(accountId: string): Promise<void>;
  /** Forget the stored credential (keeps the account). Returns the sealed credential that was dropped. */
  dropLinkCredential(accountId: string): Promise<string | null>;
  listIdleLinks(cutoff: number): Promise<AccountLink[]>;
  /** Links whose stored credential expires before `before`. */
  listExpiringLinks(before: number): Promise<AccountLink[]>;
  /**
   * Replace a stored Paperclip credential and its expiry, but only while it still holds `expect` (compare-and-swap):
   * false if it was rotated, replaced or dropped meanwhile. Pass `next` = `expect` to change only the expiry.
   */
  swapCredential(holder: CredentialHolder, expect: string, next: string, expiresAt: number | null): Promise<boolean>;
  /** Revoke every live grant (and their tokens) of an account. Returns how many. */
  revokeAccountGrants(accountId: string): Promise<number>;
  countLiveGrants(accountId: string): Promise<number>;

  insertUserEvent(e: UserEvent): Promise<void>;
  /** Newest first; with afterId only newer ones. */
  userEventsRecent(afterId: number, limit: number): Promise<UserEvent[]>;
  userEventCounts(from: number, to: number): Promise<UserCounts>;
  userEventSeries(from: number, to: number, bucketMs: number): Promise<UserEventBucket[]>;

  /** Rewrites one row so a free-tier database sees steady write activity. */
  heartbeat(): Promise<void>;

  recordNodeSample(s: NodeSample): Promise<void>;
  /** Samples at or after `since`, newest first. */
  nodeSamples(since: number): Promise<NodeSample[]>;
  liveGrantCount(): Promise<number>;
}

/** Everything the bridge persists: OAuth state, accounts and audit telemetry. */
export interface Store extends AuditStore, AccountStore {
  putClient(c: OAuthClient): Promise<void>;
  getClient(id: string): Promise<OAuthClient | undefined>;
  touchClient(id: string): Promise<void>;

  putGrant(g: Grant): Promise<void>;
  getGrant(id: string): Promise<Grant | undefined>;
  touchGrant(id: string): Promise<void>;
  /** Mark revoked, drop the sealed credential and every token of the grant. Returns the credential that was dropped. */
  revokeGrant(id: string): Promise<string | null>;
  listGrants(): Promise<Grant[]>;
  /** Live grants not used since `cutoff` (ms epoch). */
  listIdleGrants(cutoff: number): Promise<Grant[]>;
  /** Live grants whose own stored credential expires before `before`. */
  listExpiringGrants(before: number): Promise<Grant[]>;

  putAccess(hash: string, r: TokenRecord): Promise<void>;
  getAccess(hash: string): Promise<TokenRecord | undefined>;
  putRefresh(hash: string, r: TokenRecord): Promise<void>;
  getRefresh(hash: string): Promise<TokenRecord | undefined>;
  /** Atomically mark a refresh token used. False if it was already used (concurrent or replayed). */
  consumeRefresh(hash: string): Promise<boolean>;
  findAnyToken(hash: string): Promise<TokenRecord | undefined>;

  putPending(rid: string, p: PendingRecord): Promise<void>;
  getPending(rid: string): Promise<PendingRecord | undefined>;
  deletePending(rid: string): Promise<void>;
  countPending(): Promise<number>;

  putCode(hash: string, c: CodeRecord): Promise<void>;
  /** Atomically consume a code; a second take reports `replay`. */
  takeCode(hash: string): Promise<CodeTake>;
  setCodeGrant(hash: string, grantId: string): Promise<void>;

  /** Fixed-window counter shared across processes. True if the call is within `limit`. */
  hit(key: string, limit: number, windowMs: number): Promise<boolean>;

  /** Delete expired rows. */
  prune(): Promise<void>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

interface Persisted {
  version: 1;
  clients: Record<string, OAuthClient>;
  grants: Record<string, Grant>;
  access: Record<string, TokenRecord>;
  refresh: Record<string, TokenRecord>;
  accounts?: Record<string, Account>;
  links?: Record<string, AccountLink>;
}

const MAX_USER_EVENTS = 20_000;
const MAX_CLIENTS = 1000;
const CLIENT_IDLE_MS = 7 * 24 * 3600 * 1000;
const TOUCH_PERSIST_MS = 5 * 60_000;
const CODE_REPLAY_WINDOW_MS = 5 * 60_000;

/** Linear-interpolated percentile (same definition as Postgres percentile_cont). `sorted` must be ascending. */
export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
const asc = (xs: number[]) => [...xs].sort((a, b) => a - b);
const bridgeMs = (r: AuditRow) => r.totalMs - (r.upstreamMs ?? 0);
const MAX_AUDIT_ROWS = 20_000;

/** Memory store; with `file` it persists clients/grants/tokens as JSON (0600, atomic rename). Single process only. */
export class MemoryStore implements Store {
  private d: Persisted = { version: 1, clients: {}, grants: {}, access: {}, refresh: {}, accounts: {}, links: {} };
  private events: UserEvent[] = [];
  private eventSeq = 0;
  private pending = new Map<string, PendingRecord>();
  private codes = new Map<string, { rec: CodeRecord; used: boolean; grantId?: string }>();
  private rates = new Map<string, { n: number; resetAt: number }>();
  private lastPersist = new Map<string, number>();

  constructor(
    private file: string | null = null,
    private now: () => number = Date.now,
  ) {
    if (file && existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as Persisted;
      if (parsed?.version === 1) {
        this.d = parsed;
        for (const g of Object.values(this.d.grants)) {
          g.instanceUrl ??= null;
          g.accountId ??= null;
          g.username ??= null;
        }
        this.d.accounts ??= {};
        this.d.links ??= {};
      }
    }
  }

  private save() {
    this.pruneSync();
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.d), { mode: 0o600 });
    renameSync(tmp, this.file);
    chmodSync(this.file, 0o600);
  }

  private pruneSync() {
    const t = this.now();
    for (const m of [this.d.access, this.d.refresh]) for (const [h, r] of Object.entries(m)) if (r.expiresAt <= t) delete m[h];
    const inUse = new Set(Object.values(this.d.grants).filter((g) => !g.revoked).map((g) => g.clientId));
    const disposable = Object.values(this.d.clients)
      .filter((c) => !inUse.has(c.id))
      .sort((x, y) => x.lastUsedAt - y.lastUsedAt);
    let total = Object.keys(this.d.clients).length;
    for (const c of disposable) {
      if (t - c.lastUsedAt > CLIENT_IDLE_MS || total > MAX_CLIENTS) {
        delete this.d.clients[c.id];
        total -= 1;
      }
    }
    for (const [k, v] of this.pending) if (v.expiresAt <= t) this.pending.delete(k);
    for (const [k, v] of this.codes) if (v.rec.expiresAt + CODE_REPLAY_WINDOW_MS <= t) this.codes.delete(k);
    for (const [k, v] of this.rates) if (v.resetAt <= t) this.rates.delete(k);
  }

  async putClient(c: OAuthClient) {
    this.d.clients[c.id] = c;
    this.save();
  }
  async getClient(id: string) {
    return this.d.clients[id];
  }
  async touchClient(id: string) {
    const c = this.d.clients[id];
    if (c) c.lastUsedAt = this.now();
  }

  async putGrant(g: Grant) {
    this.d.grants[g.id] = g;
    this.lastPersist.set(g.id, this.now());
    this.save();
  }
  async getGrant(id: string) {
    return this.d.grants[id];
  }
  async touchGrant(id: string) {
    const g = this.d.grants[id];
    if (!g) return;
    g.lastUsedAt = this.now();
    if (this.now() - (this.lastPersist.get(id) ?? 0) > TOUCH_PERSIST_MS) {
      this.lastPersist.set(id, this.now());
      this.save();
    }
  }
  async revokeGrant(id: string) {
    const g = this.d.grants[id];
    if (!g) return null;
    const dropped = g.sealedCredential;
    g.revoked = true;
    g.sealedCredential = null;
    for (const m of [this.d.access, this.d.refresh]) for (const [h, r] of Object.entries(m)) if (r.grantId === id) delete m[h];
    this.save();
    return dropped;
  }
  async listGrants() {
    return Object.values(this.d.grants);
  }
  async listIdleGrants(cutoff: number) {
    return Object.values(this.d.grants).filter((g) => !g.revoked && g.lastUsedAt < cutoff);
  }
  async listExpiringGrants(before: number) {
    return Object.values(this.d.grants).filter((g) => {
      const exp = g.sealedCredential && !g.revoked ? credentialExpiry(g.credentialExpiresAt, g.createdAt) : null;
      return exp !== null && exp < before;
    });
  }
  async swapCredential(h: CredentialHolder, expect: string, next: string, expiresAt: number | null) {
    const row = h.kind === "link" ? this.lnks[h.id] : this.d.grants[h.id];
    if (!row || row.sealedCredential !== expect || (h.kind === "grant" && (row as Grant).revoked)) return false;
    row.sealedCredential = next;
    row.credentialExpiresAt = expiresAt;
    this.save();
    return true;
  }

  async putAccess(hash: string, r: TokenRecord) {
    this.d.access[hash] = r;
    this.save();
  }
  async getAccess(hash: string) {
    const r = this.d.access[hash];
    return r && r.expiresAt > this.now() ? r : undefined;
  }
  async putRefresh(hash: string, r: TokenRecord) {
    this.d.refresh[hash] = r;
    this.save();
  }
  async getRefresh(hash: string) {
    const r = this.d.refresh[hash];
    return r && r.expiresAt > this.now() ? r : undefined;
  }
  async consumeRefresh(hash: string) {
    const r = this.d.refresh[hash];
    if (!r || r.consumed) return false;
    r.consumed = true;
    this.save();
    return true;
  }
  async findAnyToken(hash: string) {
    return this.d.access[hash] ?? this.d.refresh[hash];
  }

  async putPending(rid: string, p: PendingRecord) {
    this.pending.set(rid, p);
  }
  async getPending(rid: string) {
    const p = this.pending.get(rid);
    return p && p.expiresAt > this.now() ? p : undefined;
  }
  async deletePending(rid: string) {
    this.pending.delete(rid);
  }
  async countPending() {
    return this.pending.size;
  }

  async putCode(hash: string, rec: CodeRecord) {
    this.codes.set(hash, { rec, used: false });
  }
  async takeCode(hash: string): Promise<CodeTake> {
    const e = this.codes.get(hash);
    if (!e) return { status: "missing" };
    if (e.used) return { status: "replay", grantId: e.grantId };
    if (e.rec.expiresAt <= this.now()) return { status: "missing" };
    e.used = true;
    const record = e.rec;
    e.rec = { ...record, sealedCredential: null }; // scrub as it is consumed
    return { status: "ok", record };
  }
  async setCodeGrant(hash: string, grantId: string) {
    const e = this.codes.get(hash);
    if (e) e.grantId = grantId;
  }

  async hit(key: string, limit: number, windowMs: number) {
    const t = this.now();
    const cur = this.rates.get(key);
    if (!cur || cur.resetAt <= t) {
      this.rates.set(key, { n: 1, resetAt: t + windowMs });
      return true;
    }
    cur.n += 1;
    return cur.n <= limit;
  }

  // ── accounts ──
  private get accts() {
    return (this.d.accounts ??= {});
  }
  private get lnks() {
    return (this.d.links ??= {});
  }
  async createAccount(a: Account) {
    if (Object.values(this.accts).some((x) => x.usernameKey === a.usernameKey)) return false;
    if (a.alias && Object.values(this.accts).some((x) => x.alias?.toLowerCase() === a.alias!.toLowerCase())) throw new AliasTakenError(a.alias);
    this.accts[a.id] = { anonymous: false, alias: null, ...a };
    this.save();
    return true;
  }
  async setAccountBeta(id: string, beta: boolean) {
    const a = this.accts[id];
    if (a) {
      a.beta = beta;
      this.save();
    }
  }
  async listAccountGrants(accountId: string) {
    return Object.values(this.d.grants).filter((g) => g.accountId === accountId).sort((a, b) => a.createdAt - b.createdAt);
  }
  async setGrantScopes(id: string, scopes: string[]) {
    const g = this.d.grants[id];
    if (!g || g.revoked) return false;
    g.scopes = [...scopes];
    this.save();
    return true;
  }
  async setGrantPolicy(id: string, policy: SessionPolicy | null) {
    const g = this.d.grants[id];
    if (!g || g.revoked) return false;
    g.policy = policy ? { ...policy, tools: policy.tools && [...policy.tools], agents: policy.agents && [...policy.agents] } : null;
    this.save();
    return true;
  }
  async setAccountPolicy(id: string, policy: AccountPolicy) {
    const a = this.accts[id];
    if (!a) return false;
    a.policy = { mode: policy.mode, agents: { ...policy.agents } };
    this.save();
    return true;
  }
  async recentCallsForGrants(grantIds: readonly string[], limit: number) {
    const ids = new Set(grantIds);
    return this.audit.filter((r) => r.kind === "tool" && r.grantId !== null && ids.has(r.grantId)).slice(-limit).reverse();
  }
  async setAccountPrivacy(id: string, c: PrivacyChange) {
    const a = this.accts[id];
    if (!a) return "missing" as const;
    if (Object.values(this.accts).some((x) => x.id !== id && x.alias?.toLowerCase() === c.alias.toLowerCase())) return "alias_taken" as const;
    a.anonymous = c.anonymous;
    a.alias = c.alias;
    const l = this.lnks[id];
    if (l) l.instanceLabel = c.instanceLabel;
    for (const g of Object.values(this.d.grants)) if (g.accountId === id) g.username = c.display;
    for (const e of this.events) {
      if (e.accountId !== id) continue;
      e.username = c.display;
      if (e.detail === c.prevInstanceLabel) e.detail = c.instanceLabel; // e.g. the host recorded when they joined
    }
    for (const r of this.audit) if (r.username === c.prevDisplay) {
      r.username = c.display;
      if (r.instance === c.prevInstanceLabel) r.instance = c.instanceLabel;
    }
    this.save();
    return "ok" as const;
  }
  async getAccountByKey(usernameKey: string) {
    return Object.values(this.accts).find((x) => x.usernameKey === usernameKey);
  }
  async getAccount(id: string) {
    return this.accts[id];
  }
  async setAccountSecret(id: string, secretHash: string) {
    if (this.accts[id]) this.accts[id].secretHash = secretHash;
    this.save();
  }
  async touchAccountLogin(id: string, at: number) {
    if (this.accts[id]) this.accts[id].lastLoginAt = at;
    this.save();
  }
  async countAccounts() {
    return Object.keys(this.accts).length;
  }
  async listAccounts(limit: number) {
    return Object.values(this.accts).sort((a, b) => a.createdAt - b.createdAt).slice(0, limit);
  }
  async deleteAccount(id: string) {
    const acct = this.accts[id];
    if (!acct) return null;
    const link = this.lnks[id];
    await this.revokeAccountGrants(id);
    delete this.lnks[id];
    delete this.accts[id];
    this.save();
    return { sealedCredential: link?.sealedCredential ?? null, instanceUrl: link?.instanceUrl ?? null };
  }
  async putLink(l: AccountLink) {
    const clash = l.paperclipUserId && Object.values(this.lnks).some((x) => x.accountId !== l.accountId && x.instanceUrl === l.instanceUrl && x.paperclipUserId === l.paperclipUserId);
    if (clash) return false;
    this.lnks[l.accountId] = { ...l };
    this.save();
    return true;
  }
  async getLink(accountId: string) {
    return this.lnks[accountId];
  }
  async getLinkByIdentity(instanceUrl: string, paperclipUserId: string) {
    return Object.values(this.lnks).find((x) => x.instanceUrl === instanceUrl && x.paperclipUserId === paperclipUserId);
  }
  async touchLink(accountId: string) {
    const l = this.lnks[accountId];
    if (!l) return;
    l.lastUsedAt = this.now();
    if (this.now() - (this.lastPersist.get(`link:${accountId}`) ?? 0) > TOUCH_PERSIST_MS) {
      this.lastPersist.set(`link:${accountId}`, this.now());
      this.save();
    }
  }
  async dropLinkCredential(accountId: string) {
    const l = this.lnks[accountId];
    if (!l) return null;
    const old = l.sealedCredential;
    l.sealedCredential = null;
    this.save();
    return old;
  }
  async listIdleLinks(cutoff: number) {
    return Object.values(this.lnks).filter((l) => l.sealedCredential && l.lastUsedAt < cutoff);
  }
  async listExpiringLinks(before: number) {
    return Object.values(this.lnks).filter((l) => {
      const exp = l.sealedCredential ? credentialExpiry(l.credentialExpiresAt, l.connectedAt) : null;
      return exp !== null && exp < before;
    });
  }
  async revokeAccountGrants(accountId: string) {
    let n = 0;
    for (const g of Object.values(this.d.grants)) {
      if (g.accountId === accountId && !g.revoked) {
        await this.revokeGrant(g.id);
        n += 1;
      }
    }
    return n;
  }
  async countLiveGrants(accountId: string) {
    return Object.values(this.d.grants).filter((g) => g.accountId === accountId && !g.revoked).length;
  }

  async insertUserEvent(e: UserEvent) {
    this.events.push({ ...e, id: ++this.eventSeq });
    if (this.events.length > MAX_USER_EVENTS) this.events.splice(0, this.events.length - MAX_USER_EVENTS);
  }
  async userEventsRecent(afterId: number, limit: number) {
    return this.events.filter((e) => (e.id ?? 0) > afterId).slice(-limit).reverse();
  }
  async userEventCounts(from: number, to: number): Promise<UserCounts> {
    const byKind: Record<string, number> = {};
    const failures: Record<string, number> = {};
    for (const e of this.events) {
      if (e.at < from || e.at >= to) continue;
      byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
      if (e.kind === "connect_failed" || e.kind === "login_failed") failures[`${e.kind}:${e.detail ?? "unknown"}`] = (failures[`${e.kind}:${e.detail ?? "unknown"}`] ?? 0) + 1;
    }
    return { byKind, failures };
  }
  async userEventSeries(from: number, to: number, bucketMs: number): Promise<UserEventBucket[]> {
    const m = new Map<number, UserEventBucket>();
    for (const e of this.events) {
      if (e.at < from || e.at >= to || !["completed", "connect_failed", "login_failed", "joined"].includes(e.kind)) continue;
      const t = Math.floor(e.at / bucketMs) * bucketMs;
      const b = m.get(t) ?? { t, completed: 0, failed: 0, joined: 0 };
      if (e.kind === "completed") b.completed += 1;
      else if (e.kind === "joined") b.joined += 1;
      else b.failed += 1;
      m.set(t, b);
    }
    return [...m.values()].sort((a, b) => a.t - b.t);
  }
  async heartbeat() {}

  private samples: NodeSample[] = [];
  async recordNodeSample(s: NodeSample) {
    this.samples.push(s);
    if (this.samples.length > 5000) this.samples.splice(0, this.samples.length - 5000);
  }
  async nodeSamples(since: number) {
    return this.samples.filter((x) => x.at >= since).sort((a, b) => b.at - a.at);
  }
  async liveGrantCount() {
    return Object.values(this.d.grants).filter((g) => !g.revoked).length;
  }

  // ── audit (bounded ring; history is lost on restart — use Postgres for real retention) ──
  private audit: AuditRow[] = [];
  private auditSeq = 0;

  async insertAudit(rows: AuditRow[]) {
    for (const r of rows) this.audit.push({ ...r, id: ++this.auditSeq });
    if (this.audit.length > MAX_AUDIT_ROWS) this.audit.splice(0, this.audit.length - MAX_AUDIT_ROWS);
  }
  private window(kind: string, from: number, to: number) {
    return this.audit.filter((r) => r.kind === kind && r.at >= from && r.at < to);
  }
  private summarize(rows: AuditRow[]) {
    const tot = asc(rows.map((r) => r.totalMs));
    const up = asc(rows.filter((r) => (r.upstreamCalls ?? 0) > 0).map((r) => r.upstreamMs ?? 0));
    return {
      count: rows.length,
      errors: rows.filter((r) => !r.ok).length,
      faults: rows.filter((r) => isFault(r.errorClass)).length,
      p50: percentile(tot, 0.5),
      p95: percentile(tot, 0.95),
      p99: percentile(tot, 0.99),
      upstreamP95: percentile(up, 0.95),
      bridgeP95: percentile(asc(rows.map(bridgeMs)), 0.95),
    };
  }
  async auditSeries(kind: "tool" | "http", from: number, to: number, bucketMs: number): Promise<SeriesBucket[]> {
    const groups = new Map<number, AuditRow[]>();
    for (const r of this.window(kind, from, to)) {
      const t = Math.floor(r.at / bucketMs) * bucketMs;
      (groups.get(t) ?? groups.set(t, []).get(t)!).push(r);
    }
    return [...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, rows]) => {
        const s = this.summarize(rows);
        return {
          t,
          count: s.count,
          errors: s.errors,
          faults: s.faults,
          p50: s.p50,
          p95: s.p95,
          p99: s.p99,
          avgUpstream: rows.reduce((a, r) => a + (r.upstreamMs ?? 0), 0) / rows.length,
          avgBridge: rows.reduce((a, r) => a + bridgeMs(r), 0) / rows.length,
        };
      });
  }
  async auditTotals(kind: "tool" | "http", from: number, to: number): Promise<Totals> {
    const rows = this.window(kind, from, to);
    const s = this.summarize(rows);
    return { count: s.count, errors: s.errors, faults: s.faults, mutations: rows.filter((r) => r.mutation).length, p50: s.p50, p95: s.p95, p99: s.p99, upstreamP95: s.upstreamP95, bridgeP95: s.bridgeP95 };
  }
  async auditBreakdown(kind: "tool" | "http", by: "name" | "instance" | "errorClass" | "username", from: number, to: number, limit: number): Promise<BreakdownRow[]> {
    const groups = new Map<string, AuditRow[]>();
    for (const r of this.window(kind, from, to)) {
      const key = by === "name" ? r.name : by === "instance" ? r.instance : by === "username" ? r.username : r.ok ? null : r.errorClass;
      if (key) (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
    }
    return [...groups.entries()]
      .map(([key, rows]) => {
        const s = this.summarize(rows);
        return { key, count: s.count, errors: s.errors, faults: s.faults, p50: s.p50, p95: s.p95, upstreamP95: s.upstreamP95 };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }
  async auditHistogram(kind: "tool" | "http", from: number, to: number): Promise<number[]> {
    const out = new Array(HIST_EDGES.length + 1).fill(0);
    for (const r of this.window(kind, from, to)) out[HIST_EDGES.filter((e) => r.totalMs >= e).length] += 1;
    return out;
  }
  async auditSlowest(kind: "tool" | "http", from: number, to: number, limit: number) {
    return this.window(kind, from, to).sort((a, b) => b.totalMs - a.totalMs).slice(0, limit);
  }
  async auditRecent(afterId: number, limit: number, kind?: "tool" | "http") {
    return this.audit.filter((r) => (r.id ?? 0) > afterId && (!kind || r.kind === kind)).slice(-limit).reverse();
  }
  async auditActiveUsers(from: number, to: number) {
    return new Set(this.audit.filter((r) => r.at >= from && r.at < to && r.username).map((r) => r.username)).size;
  }
  async pruneAudit(beforeMs: number) {
    const n = this.audit.length;
    this.audit = this.audit.filter((r) => r.at >= beforeMs);
    this.events = this.events.filter((e) => e.at >= beforeMs);
    this.samples = this.samples.filter((x) => x.at >= beforeMs);
    return n - this.audit.length;
  }

  async prune() {
    this.save();
  }
  async ping() {}
  async close() {}
}

/** Back-compat name used by older call sites/tests. */
export { MemoryStore as OAuthStore };
