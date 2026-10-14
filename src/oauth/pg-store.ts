import pg from "pg";
import type { AccountPolicy, SessionPolicy } from "../access/policy.js";
import { AliasTakenError, type Account, type AccountLink, type NodeSample, type PrivacyChange, type UserEvent, type UserEventBucket } from "../accounts/types.js";
import { FAULT_CLASSES, HIST_EDGES, type AuditRow, type BreakdownRow, type SeriesBucket, type Totals } from "../telemetry/types.js";
import type { CodeRecord, CodeTake, CredentialHolder, Grant, OAuthClient, PendingRecord, Store, TokenRecord, UserCounts } from "./store.js";

const MAX_CLIENTS = 1000;
const CLIENT_IDLE_MS = 7 * 24 * 3600 * 1000;
const TOUCH_PERSIST_MS = 5 * 60_000;
const CODE_REPLAY_WINDOW_MS = 5 * 60_000;

export interface PgOptions {
  connectionString: string;
  /** off: no TLS (local only) · require: encrypted, certificate not verified · verify: encrypted and verified (default). */
  ssl?: "off" | "require" | "verify";
  /** PEM of the CA to trust (Supabase: download "SSL certificate" from Database settings). */
  ca?: string;
  max?: number;
}

export function sslOption(o: Pick<PgOptions, "ssl" | "ca">): pg.PoolConfig["ssl"] {
  const mode = o.ssl ?? "verify";
  if (mode === "off") return false;
  if (mode === "require") return { rejectUnauthorized: false };
  return { rejectUnauthorized: true, ...(o.ca ? { ca: o.ca } : {}) };
}

const num = (v: unknown) => Number(v);

const toGrant = (r: any): Grant => ({
  id: r.id,
  clientId: r.client_id,
  clientName: r.client_name,
  userId: r.user_id,
  scopes: r.scopes,
  resource: r.resource,
  instanceUrl: r.instance_url,
  sealedCredential: r.sealed_credential,
  credentialExpiresAt: r.credential_expires_at == null ? null : num(r.credential_expires_at),
  accountId: r.account_id ?? null,
  username: r.username ?? null,
  createdAt: num(r.created_at),
  lastUsedAt: num(r.last_used_at),
  revoked: r.revoked,
  policy: r.policy ?? null,
});

/**
 * Postgres-backed Store (schema `bridge`, see migrations/001_init.sql). Safe to share between several bridge
 * processes: consuming a code or refresh token, and rate-limit counting, are single atomic statements.
 * Works through Supabase's transaction pooler (no prepared statements or session state are used).
 */
export class PgStore implements Store {
  protected pool: pg.Pool;

  constructor(
    opts: PgOptions | pg.Pool,
    protected now: () => number = Date.now,
  ) {
    this.pool =
      opts instanceof pg.Pool
        ? opts
        : new pg.Pool({ connectionString: opts.connectionString, ssl: sslOption(opts), max: opts.max ?? 10, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000 });
    this.pool.on("error", (e) => console.error("postgres pool error:", e.message));
  }

  protected q = (text: string, params: unknown[] = []) => this.pool.query(text, params);

  async putClient(c: OAuthClient) {
    await this.q(
      `insert into bridge.clients (id, name, redirect_uris, created_at, last_used_at) values ($1,$2,$3,$4,$5)
       on conflict (id) do update set name = excluded.name, redirect_uris = excluded.redirect_uris, last_used_at = excluded.last_used_at`,
      [c.id, c.name, c.redirectUris, c.createdAt, c.lastUsedAt],
    );
    await this.pruneClients();
  }
  async getClient(id: string) {
    const r = await this.q("select * from bridge.clients where id = $1", [id]);
    const x = r.rows[0];
    return x ? { id: x.id, name: x.name, redirectUris: x.redirect_uris, createdAt: num(x.created_at), lastUsedAt: num(x.last_used_at) } : undefined;
  }
  async touchClient(id: string) {
    await this.q("update bridge.clients set last_used_at = $2 where id = $1", [id, this.now()]);
  }
  private async pruneClients() {
    const t = this.now();
    // Disposable = no live grant. Drop idle ones, then oldest-first beyond the cap.
    await this.q(
      `delete from bridge.clients c where not exists (select 1 from bridge.grants g where g.client_id = c.id and not g.revoked)
         and (c.last_used_at < $1 or c.id in (
               select id from bridge.clients o where not exists (select 1 from bridge.grants g where g.client_id = o.id and not g.revoked)
               order by last_used_at desc offset $2))`,
      [t - CLIENT_IDLE_MS, MAX_CLIENTS],
    );
  }

  async putGrant(g: Grant) {
    await this.q(
      `insert into bridge.grants (id, client_id, client_name, user_id, scopes, resource, instance_url, sealed_credential, created_at, last_used_at, revoked, account_id, username, credential_expires_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       on conflict (id) do update set sealed_credential = excluded.sealed_credential, credential_expires_at = excluded.credential_expires_at, scopes = excluded.scopes, revoked = excluded.revoked, last_used_at = excluded.last_used_at`,
      [g.id, g.clientId, g.clientName, g.userId, g.scopes, g.resource, g.instanceUrl, g.sealedCredential, g.createdAt, g.lastUsedAt, g.revoked, g.accountId ?? null, g.username ?? null, g.credentialExpiresAt ?? null],
    );
  }
  async getGrant(id: string) {
    const r = await this.q("select * from bridge.grants where id = $1", [id]);
    return r.rows[0] ? toGrant(r.rows[0]) : undefined;
  }
  async touchGrant(id: string) {
    const t = this.now();
    await this.q("update bridge.grants set last_used_at = $2 where id = $1 and last_used_at < $3", [id, t, t - TOUCH_PERSIST_MS]);
  }
  async revokeGrant(id: string) {
    const c = await this.pool.connect();
    try {
      await c.query("begin");
      const old = await c.query("select sealed_credential from bridge.grants where id = $1 for update", [id]);
      await c.query("update bridge.grants set revoked = true, sealed_credential = null where id = $1", [id]);
      await c.query("delete from bridge.tokens where grant_id = $1", [id]);
      await c.query("commit");
      return (old.rows[0]?.sealed_credential as string | null) ?? null;
    } catch (e) {
      await c.query("rollback").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }
  async listGrants() {
    return (await this.q("select * from bridge.grants order by created_at")).rows.map(toGrant);
  }
  async listIdleGrants(cutoff: number) {
    return (await this.q("select * from bridge.grants where not revoked and last_used_at < $1", [cutoff])).rows.map(toGrant);
  }

  private async putToken(kind: "access" | "refresh", hash: string, r: TokenRecord) {
    await this.q("insert into bridge.tokens (hash, kind, grant_id, expires_at, consumed) values ($1,$2,$3,$4,false)", [hash, kind, r.grantId, r.expiresAt]);
  }
  private async getToken(kind: "access" | "refresh", hash: string): Promise<TokenRecord | undefined> {
    const r = await this.q("select grant_id, expires_at, consumed from bridge.tokens where hash = $1 and kind = $2 and expires_at > $3", [hash, kind, this.now()]);
    const x = r.rows[0];
    return x ? { grantId: x.grant_id, expiresAt: num(x.expires_at), consumed: x.consumed } : undefined;
  }
  putAccess = (hash: string, r: TokenRecord) => this.putToken("access", hash, r);
  getAccess = (hash: string) => this.getToken("access", hash);
  putRefresh = (hash: string, r: TokenRecord) => this.putToken("refresh", hash, r);
  getRefresh = (hash: string) => this.getToken("refresh", hash);
  async consumeRefresh(hash: string) {
    const r = await this.q("update bridge.tokens set consumed = true where hash = $1 and kind = 'refresh' and not consumed returning hash", [hash]);
    return r.rowCount === 1;
  }
  async findAnyToken(hash: string) {
    const r = await this.q("select grant_id, expires_at, consumed from bridge.tokens where hash = $1", [hash]);
    const x = r.rows[0];
    return x ? { grantId: x.grant_id, expiresAt: num(x.expires_at), consumed: x.consumed } : undefined;
  }

  async putPending(rid: string, p: PendingRecord) {
    await this.q("insert into bridge.pending (rid, data, expires_at) values ($1,$2,$3) on conflict (rid) do update set data = excluded.data, expires_at = excluded.expires_at", [rid, JSON.stringify(p), p.expiresAt]);
  }
  async getPending(rid: string) {
    const r = await this.q("select data from bridge.pending where rid = $1 and expires_at > $2", [rid, this.now()]);
    return r.rows[0]?.data as PendingRecord | undefined;
  }
  async deletePending(rid: string) {
    await this.q("delete from bridge.pending where rid = $1", [rid]);
  }
  async countPending() {
    return num((await this.q("select count(*) as n from bridge.pending where expires_at > $1", [this.now()])).rows[0].n);
  }

  async putCode(hash: string, c: CodeRecord) {
    await this.q("insert into bridge.codes (hash, data, expires_at) values ($1,$2,$3)", [hash, JSON.stringify(c), c.expiresAt]);
  }
  async takeCode(hash: string): Promise<CodeTake> {
    // Atomic single-use, and scrub the sealed credential from the row as it is consumed.
    const taken = await this.q(
      `with old as (select hash, data from bridge.codes where hash = $1 and not used and expires_at > $2 for update)
       update bridge.codes c set used = true, data = c.data - 'sealedCredential' from old where c.hash = old.hash returning old.data`,
      [hash, this.now()],
    );
    if (taken.rows[0]) return { status: "ok", record: taken.rows[0].data as CodeRecord };
    const prior = await this.q("select used, grant_id from bridge.codes where hash = $1", [hash]);
    if (prior.rows[0]?.used) return { status: "replay", grantId: prior.rows[0].grant_id ?? undefined };
    return { status: "missing" };
  }
  async setCodeGrant(hash: string, grantId: string) {
    await this.q("update bridge.codes set grant_id = $2 where hash = $1", [hash, grantId]);
  }

  async hit(key: string, limit: number, windowMs: number) {
    const t = this.now();
    const r = await this.q(
      `insert into bridge.rate_limits (key, n, reset_at) values ($1, 1, $2)
       on conflict (key) do update set
         n = case when bridge.rate_limits.reset_at <= $3 then 1 else bridge.rate_limits.n + 1 end,
         reset_at = case when bridge.rate_limits.reset_at <= $3 then $2 else bridge.rate_limits.reset_at end
       returning n`,
      [key, t + windowMs, t],
    );
    return num(r.rows[0].n) <= limit;
  }

  async prune() {
    const t = this.now();
    await this.q("delete from bridge.tokens where expires_at <= $1", [t]);
    await this.q("delete from bridge.pending where expires_at <= $1", [t]);
    await this.q("delete from bridge.codes where expires_at <= $1", [t - CODE_REPLAY_WINDOW_MS]);
    await this.q("delete from bridge.rate_limits where reset_at <= $1", [t]);
    await this.pruneClients();
  }

  // ───────────── accounts ─────────────

  private static toAccount(x: any): Account {
    return { id: x.id, username: x.username, usernameKey: x.username_key, secretHash: x.secret_hash, createdAt: num(x.created_at), lastLoginAt: x.last_login_at == null ? null : num(x.last_login_at), disabled: x.disabled, anonymous: !!x.anonymous, alias: x.alias ?? null, beta: !!x.beta, policy: x.policy ?? null };
  }
  private static toLink(x: any): AccountLink {
    return { accountId: x.account_id, instanceUrl: x.instance_url, paperclipUserId: x.paperclip_user_id, sealedCredential: x.sealed_credential, credentialExpiresAt: x.credential_expires_at == null ? null : num(x.credential_expires_at), createdAt: num(x.created_at), connectedAt: num(x.connected_at), lastUsedAt: num(x.last_used_at), instanceLabel: x.instance_label ?? null };
  }

  async createAccount(a: Account) {
    try {
      const r = await this.q(
        "insert into bridge.accounts (id, username, username_key, secret_hash, created_at, last_login_at, disabled, anonymous, alias) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (username_key) do nothing returning id",
        [a.id, a.username, a.usernameKey, a.secretHash, a.createdAt, a.lastLoginAt, a.disabled, !!a.anonymous, a.alias ?? null],
      );
      return r.rowCount === 1;
    } catch (e) {
      if ((e as { code?: string; constraint?: string }).code === "23505" && (e as { constraint?: string }).constraint === "accounts_alias_idx") throw new AliasTakenError(a.alias ?? "");
      throw e;
    }
  }
  async setAccountBeta(id: string, beta: boolean) {
    await this.q("update bridge.accounts set beta = $2 where id = $1", [id, beta]);
  }
  async listAccountGrants(accountId: string) {
    return (await this.q("select * from bridge.grants where account_id = $1 order by created_at", [accountId])).rows.map(toGrant);
  }
  async setGrantScopes(id: string, scopes: string[]) {
    return ((await this.q("update bridge.grants set scopes = $2 where id = $1 and not revoked", [id, scopes])).rowCount ?? 0) === 1;
  }
  async setGrantPolicy(id: string, policy: SessionPolicy | null) {
    return ((await this.q("update bridge.grants set policy = $2 where id = $1 and not revoked", [id, policy === null ? null : JSON.stringify(policy)])).rowCount ?? 0) === 1;
  }
  async setAccountPolicy(id: string, policy: AccountPolicy) {
    return ((await this.q("update bridge.accounts set policy = $2 where id = $1", [id, JSON.stringify(policy)])).rowCount ?? 0) === 1;
  }
  async recentCallsForGrants(grantIds: readonly string[], limit: number) {
    if (grantIds.length === 0) return [];
    return (await this.q("select * from bridge.audit_events where kind = 'tool' and grant_id = any($1) order by id desc limit $2", [[...grantIds], limit])).rows.map(PgStore.toRow);
  }
  async setAccountPrivacy(id: string, c: PrivacyChange) {
    const cl = await this.pool.connect();
    try {
      await cl.query("begin");
      const r = await cl.query("update bridge.accounts set anonymous = $2, alias = $3 where id = $1 returning id", [id, c.anonymous, c.alias]);
      if (!r.rowCount) {
        await cl.query("rollback");
        return "missing" as const;
      }
      await cl.query("update bridge.account_links set instance_label = $2 where account_id = $1", [id, c.instanceLabel]);
      await cl.query("update bridge.grants set username = $2 where account_id = $1", [id, c.display]);
      await cl.query("update bridge.user_events set username = $2, detail = case when detail = $3 then $4 else detail end where account_id = $1", [id, c.display, c.prevInstanceLabel, c.instanceLabel]);
      await cl.query("update bridge.audit_events set username = $1, instance = case when instance = $2 then $3 else instance end where username = $4", [c.display, c.prevInstanceLabel, c.instanceLabel, c.prevDisplay]);
      await cl.query("commit");
      return "ok" as const;
    } catch (e) {
      await cl.query("rollback").catch(() => {});
      if ((e as { code?: string }).code === "23505") return "alias_taken" as const;
      throw e;
    } finally {
      cl.release();
    }
  }
  async getAccountByKey(usernameKey: string) {
    const r = await this.q("select * from bridge.accounts where username_key = $1", [usernameKey]);
    return r.rows[0] ? PgStore.toAccount(r.rows[0]) : undefined;
  }
  async getAccount(id: string) {
    const r = await this.q("select * from bridge.accounts where id = $1", [id]);
    return r.rows[0] ? PgStore.toAccount(r.rows[0]) : undefined;
  }
  async setAccountSecret(id: string, secretHash: string) {
    await this.q("update bridge.accounts set secret_hash = $2 where id = $1", [id, secretHash]);
  }
  async touchAccountLogin(id: string, at: number) {
    await this.q("update bridge.accounts set last_login_at = $2 where id = $1", [id, at]);
  }
  async countAccounts() {
    return num((await this.q("select count(*) as n from bridge.accounts")).rows[0].n);
  }
  async listAccounts(limit: number) {
    return (await this.q("select * from bridge.accounts order by created_at limit $1", [limit])).rows.map(PgStore.toAccount);
  }
  async deleteAccount(id: string) {
    const c = await this.pool.connect();
    try {
      await c.query("begin");
      const link = await c.query("select instance_url, sealed_credential from bridge.account_links where account_id = $1 for update", [id]);
      const acct = await c.query("select id from bridge.accounts where id = $1 for update", [id]);
      if (!acct.rowCount) {
        await c.query("rollback");
        return null;
      }
      await c.query("delete from bridge.tokens where grant_id in (select id from bridge.grants where account_id = $1)", [id]);
      await c.query("update bridge.grants set revoked = true, sealed_credential = null where account_id = $1", [id]);
      await c.query("delete from bridge.accounts where id = $1", [id]); // cascades to the link
      await c.query("commit");
      return { sealedCredential: (link.rows[0]?.sealed_credential as string | null) ?? null, instanceUrl: (link.rows[0]?.instance_url as string | null) ?? null };
    } catch (e) {
      await c.query("rollback").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }
  async putLink(l: AccountLink) {
    try {
      await this.q(
        `insert into bridge.account_links (account_id, instance_url, paperclip_user_id, sealed_credential, created_at, connected_at, last_used_at, instance_label, credential_expires_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict (account_id) do update set instance_url = excluded.instance_url, paperclip_user_id = excluded.paperclip_user_id, sealed_credential = excluded.sealed_credential, credential_expires_at = excluded.credential_expires_at, connected_at = excluded.connected_at, last_used_at = excluded.last_used_at, instance_label = excluded.instance_label`,
        [l.accountId, l.instanceUrl, l.paperclipUserId, l.sealedCredential, l.createdAt, l.connectedAt, l.lastUsedAt, l.instanceLabel ?? null, l.credentialExpiresAt ?? null],
      );
      return true;
    } catch (e) {
      if ((e as { code?: string }).code === "23505") return false; // identity already owned by another account
      throw e;
    }
  }
  async getLink(accountId: string) {
    const r = await this.q("select * from bridge.account_links where account_id = $1", [accountId]);
    return r.rows[0] ? PgStore.toLink(r.rows[0]) : undefined;
  }
  async getLinkByIdentity(instanceUrl: string, paperclipUserId: string) {
    const r = await this.q("select * from bridge.account_links where instance_url = $1 and paperclip_user_id = $2", [instanceUrl, paperclipUserId]);
    return r.rows[0] ? PgStore.toLink(r.rows[0]) : undefined;
  }
  async touchLink(accountId: string) {
    const t = this.now();
    await this.q("update bridge.account_links set last_used_at = $2 where account_id = $1 and last_used_at < $3", [accountId, t, t - TOUCH_PERSIST_MS]);
  }
  async dropLinkCredential(accountId: string) {
    const r = await this.q(
      "with old as (select sealed_credential from bridge.account_links where account_id = $1 for update) update bridge.account_links l set sealed_credential = null from old where l.account_id = $1 returning old.sealed_credential",
      [accountId],
    );
    return (r.rows[0]?.sealed_credential as string | null) ?? null;
  }
  async listIdleLinks(cutoff: number) {
    return (await this.q("select * from bridge.account_links where sealed_credential is not null and last_used_at < $1", [cutoff])).rows.map(PgStore.toLink);
  }
  async listExpiringLinks(before: number) {
    return (await this.q("select * from bridge.account_links where sealed_credential is not null and credential_expires_at < $1", [before])).rows.map(PgStore.toLink);
  }
  async listExpiringGrants(before: number) {
    return (await this.q("select * from bridge.grants where not revoked and sealed_credential is not null and credential_expires_at < $1", [before])).rows.map(toGrant);
  }
  async swapCredential(h: CredentialHolder, expect: string, next: string, expiresAt: number | null) {
    const sql =
      h.kind === "link"
        ? "update bridge.account_links set sealed_credential = $3, credential_expires_at = $4 where account_id = $1 and sealed_credential = $2"
        : "update bridge.grants set sealed_credential = $3, credential_expires_at = $4 where id = $1 and sealed_credential = $2 and not revoked";
    return ((await this.q(sql, [h.id, expect, next, expiresAt])).rowCount ?? 0) === 1;
  }
  async revokeAccountGrants(accountId: string) {
    const c = await this.pool.connect();
    try {
      await c.query("begin");
      const r = await c.query("update bridge.grants set revoked = true, sealed_credential = null where account_id = $1 and not revoked returning id", [accountId]);
      if (r.rowCount) await c.query("delete from bridge.tokens where grant_id = any($1::text[])", [r.rows.map((x) => x.id)]);
      await c.query("commit");
      return r.rowCount ?? 0;
    } catch (e) {
      await c.query("rollback").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }
  async countLiveGrants(accountId: string) {
    return num((await this.q("select count(*) as n from bridge.grants where account_id = $1 and not revoked", [accountId])).rows[0].n);
  }

  async insertUserEvent(e: UserEvent) {
    await this.q("insert into bridge.user_events (ts, account_id, username, kind, detail) values ($1,$2,$3,$4,$5)", [e.at, e.accountId, e.username, e.kind, e.detail]);
  }
  async userEventsRecent(afterId: number, limit: number): Promise<UserEvent[]> {
    const r = await this.q("select * from bridge.user_events where id > $1 order by id desc limit $2", [afterId, limit]);
    return r.rows.map((x) => ({ id: num(x.id), at: num(x.ts), accountId: x.account_id, username: x.username, kind: x.kind, detail: x.detail }));
  }
  async userEventCounts(from: number, to: number): Promise<UserCounts> {
    const k = await this.q("select kind, count(*)::int as n from bridge.user_events where ts >= $1 and ts < $2 group by kind", [from, to]);
    const f = await this.q("select kind, coalesce(detail, 'unknown') as detail, count(*)::int as n from bridge.user_events where ts >= $1 and ts < $2 and kind in ('connect_failed','login_failed') group by 1, 2", [from, to]);
    return { byKind: Object.fromEntries(k.rows.map((x) => [x.kind, x.n])), failures: Object.fromEntries(f.rows.map((x) => [`${x.kind}:${x.detail}`, x.n])) };
  }
  async userEventSeries(from: number, to: number, bucketMs: number): Promise<UserEventBucket[]> {
    const r = await this.q(
      `select (ts / $3::bigint) * $3::bigint as t,
              (count(*) filter (where kind = 'completed'))::int as completed,
              (count(*) filter (where kind in ('connect_failed', 'login_failed')))::int as failed,
              (count(*) filter (where kind = 'joined'))::int as joined
         from bridge.user_events where ts >= $1 and ts < $2 and kind in ('completed','connect_failed','login_failed','joined') group by 1 order by 1`,
      [from, to, bucketMs],
    );
    return r.rows.map((x) => ({ t: num(x.t), completed: x.completed, failed: x.failed, joined: x.joined }));
  }
  async recordNodeSample(x: NodeSample) {
    await this.q("insert into bridge.node_samples (ts, node, db_ping_ms, loop_lag_p99_ms, rss_mb, heap_mb, uptime_s, version) values ($1,$2,$3,$4,$5,$6,$7,$8)", [x.at, x.node, x.dbPingMs, x.loopLagP99Ms, x.rssMb, x.heapMb, x.uptimeS, x.version]);
  }
  async nodeSamples(since: number): Promise<NodeSample[]> {
    const r = await this.q("select * from bridge.node_samples where ts >= $1 order by ts desc limit 1000", [since]);
    return r.rows.map((x) => ({ at: num(x.ts), node: x.node, dbPingMs: x.db_ping_ms, loopLagP99Ms: x.loop_lag_p99_ms, rssMb: x.rss_mb, heapMb: x.heap_mb, uptimeS: x.uptime_s, version: x.version }));
  }
  async liveGrantCount() {
    return num((await this.q("select count(*) as n from bridge.grants where not revoked")).rows[0].n);
  }
  async heartbeat() {
    await this.q("insert into bridge.heartbeat (id, at) values (1, $1) on conflict (id) do update set at = excluded.at", [this.now()]);
  }

  async auditActiveUsers(from: number, to: number) {
    return num((await this.q("select count(distinct username) as n from bridge.audit_events where ts >= $1 and ts < $2 and username is not null", [from, to])).rows[0].n);
  }

  // ───────────── audit ─────────────

  async insertAudit(rows: AuditRow[]) {
    if (!rows.length) return;
    const col = <T>(f: (r: AuditRow) => T) => rows.map(f);
    await this.q(
      `insert into bridge.audit_events (ts, node, kind, name, mutation, ok, status, error_class, total_ms, upstream_ms, upstream_calls, scope, grant_id, client, instance, user_id, username)
       select * from unnest($1::bigint[], $2::text[], $3::text[], $4::text[], $5::boolean[], $6::boolean[], $7::int[], $8::text[], $9::int[], $10::int[], $11::int[], $12::text[], $13::text[], $14::text[], $15::text[], $16::text[], $17::text[])`,
      [col((r) => r.at), col((r) => r.node), col((r) => r.kind), col((r) => r.name), col((r) => r.mutation), col((r) => r.ok), col((r) => r.status), col((r) => r.errorClass), col((r) => r.totalMs), col((r) => r.upstreamMs), col((r) => r.upstreamCalls), col((r) => r.scope), col((r) => r.grantId), col((r) => r.client), col((r) => r.instance), col((r) => r.userId), col((r) => r.username)],
    );
  }

  private static readonly AGG = `
    count(*)::int as count,
    (count(*) filter (where not ok))::int as errors,
    (count(*) filter (where error_class = any($FAULTS::text[])))::int as faults,
    coalesce(percentile_cont(0.5)  within group (order by total_ms), 0)::float8 as p50,
    coalesce(percentile_cont(0.95) within group (order by total_ms), 0)::float8 as p95,
    coalesce(percentile_cont(0.99) within group (order by total_ms), 0)::float8 as p99,
    coalesce(percentile_cont(0.95) within group (order by upstream_ms) filter (where upstream_calls > 0), 0)::float8 as upstream_p95,
    coalesce(percentile_cont(0.95) within group (order by total_ms - coalesce(upstream_ms, 0)), 0)::float8 as bridge_p95`;
  private agg = (faultsParam: number) => PgStore.AGG.replace("$FAULTS", `$${faultsParam}`);

  async auditSeries(kind: "tool" | "http", from: number, to: number, bucketMs: number): Promise<SeriesBucket[]> {
    const r = await this.q(
      `select (ts / $3::bigint) * $3::bigint as t,
              count(*)::int as count,
              (count(*) filter (where not ok))::int as errors,
              (count(*) filter (where error_class = any($5::text[])))::int as faults,
              coalesce(percentile_cont(0.5)  within group (order by total_ms), 0)::float8 as p50,
              coalesce(percentile_cont(0.95) within group (order by total_ms), 0)::float8 as p95,
              coalesce(percentile_cont(0.99) within group (order by total_ms), 0)::float8 as p99,
              coalesce(avg(coalesce(upstream_ms, 0)), 0)::float8 as avg_upstream,
              coalesce(avg(total_ms - coalesce(upstream_ms, 0)), 0)::float8 as avg_bridge
         from bridge.audit_events where kind = $4 and ts >= $1 and ts < $2 group by 1 order by 1`,
      [from, to, bucketMs, kind, FAULT_CLASSES],
    );
    return r.rows.map((x) => ({ t: num(x.t), count: x.count, errors: x.errors, faults: x.faults, p50: x.p50, p95: x.p95, p99: x.p99, avgUpstream: x.avg_upstream, avgBridge: x.avg_bridge }));
  }

  async auditTotals(kind: "tool" | "http", from: number, to: number): Promise<Totals> {
    const r = await this.q(
      `select ${this.agg(4)}, (count(*) filter (where mutation))::int as mutations from bridge.audit_events where kind = $3 and ts >= $1 and ts < $2`,
      [from, to, kind, FAULT_CLASSES],
    );
    const x = r.rows[0];
    return { count: x.count, errors: x.errors, faults: x.faults, mutations: x.mutations, p50: x.p50, p95: x.p95, p99: x.p99, upstreamP95: x.upstream_p95, bridgeP95: x.bridge_p95 };
  }

  async auditBreakdown(kind: "tool" | "http", by: "name" | "instance" | "errorClass" | "username", from: number, to: number, limit: number): Promise<BreakdownRow[]> {
    const col = by === "name" ? "name" : by === "instance" ? "instance" : by === "username" ? "username" : "error_class";
    const extra = by === "errorClass" ? "and not ok" : "";
    const r = await this.q(
      `select ${col} as key, ${this.agg(5)} from bridge.audit_events
        where kind = $3 and ts >= $1 and ts < $2 and ${col} is not null ${extra}
        group by ${col} order by count(*) desc limit $4`,
      [from, to, kind, limit, FAULT_CLASSES],
    );
    return r.rows.map((x) => ({ key: x.key, count: x.count, errors: x.errors, faults: x.faults, p50: x.p50, p95: x.p95, upstreamP95: x.upstream_p95 }));
  }

  async auditHistogram(kind: "tool" | "http", from: number, to: number): Promise<number[]> {
    const r = await this.q(
      "select width_bucket(total_ms, $4::int[]) as b, count(*)::int as n from bridge.audit_events where kind = $3 and ts >= $1 and ts < $2 group by 1",
      [from, to, kind, HIST_EDGES],
    );
    const out = new Array(HIST_EDGES.length + 1).fill(0);
    for (const x of r.rows) out[x.b] = x.n;
    return out;
  }

  private static toRow(x: any): AuditRow {
    return { id: num(x.id), at: num(x.ts), node: x.node, kind: x.kind, name: x.name, mutation: x.mutation, ok: x.ok, status: x.status, errorClass: x.error_class, totalMs: x.total_ms, upstreamMs: x.upstream_ms, upstreamCalls: x.upstream_calls, scope: x.scope, grantId: x.grant_id, client: x.client, instance: x.instance, userId: x.user_id, username: x.username ?? null };
  }
  async auditSlowest(kind: "tool" | "http", from: number, to: number, limit: number) {
    return (await this.q("select * from bridge.audit_events where kind = $3 and ts >= $1 and ts < $2 order by total_ms desc limit $4", [from, to, kind, limit])).rows.map(PgStore.toRow);
  }
  async auditRecent(afterId: number, limit: number, kind?: "tool" | "http") {
    return (await this.q("select * from bridge.audit_events where id > $1 and ($3::text is null or kind = $3) order by id desc limit $2", [afterId, limit, kind ?? null])).rows.map(PgStore.toRow);
  }
  async pruneAudit(beforeMs: number) {
    await this.q("delete from bridge.user_events where ts < $1", [beforeMs]);
    await this.q("delete from bridge.node_samples where ts < $1", [beforeMs]);
    return (await this.q("delete from bridge.audit_events where ts < $1", [beforeMs])).rowCount ?? 0;
  }

  async ping() {
    await this.q("select 1");
  }
  async close() {
    await this.pool.end();
  }
}
