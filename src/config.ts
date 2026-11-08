import type { PgOptions } from "./oauth/pg-store.js";
import { DEFAULT_URL_POLICY, type UrlPolicy } from "./net/safe-fetch.js";

export interface BridgeConfig {
  /** Paperclip base URL, normalised to end in /api. Single-instance mode only. */
  apiUrl: string;
  /** Board API token (`paperclipai auth login`) or agent key. Optional in local trusted mode. */
  apiKey: string | null;
  /** Default company for company-scoped tools. */
  companyId: string | null;
  /** When true, every tool that mutates Paperclip is refused. */
  readOnly: boolean;
  /** Per-request timeout against the Paperclip API. */
  timeoutMs: number;
}

export interface InstancePolicy extends UrlPolicy {
  /** If set, only these hosts (or `*.suffix` patterns) may be connected — for private betas. */
  allowHosts: string[] | null;
}

export interface OAuthConfig {
  /** Canonical public origin of the bridge (the OAuth issuer). */
  issuer: string;
  /** Secret used to seal stored Paperclip credentials. */
  secret: string;
  /** Older secrets that can still open stored credentials (rotation). */
  previousSecrets: string[];
  /**
   * single: the bridge fronts the one Paperclip at PAPERCLIP_API_URL.
   * multi:  public service — each user supplies their own (public, https) Paperclip URL on the consent page.
   */
  mode: "single" | "multi";
  /** Hosted mode: route NEW MCP sign-ins through central Papercliped identity. Off until coordinated rollout. */
  centralAuth?: { publicKey: string } | null;
  /** Papercliped accounts (username + secret key, stored Paperclip connection). On in multi-tenant mode. */
  accounts: boolean;
  /** paperclip: sign in via Paperclip's approval flow · static: operator types BRIDGE_TOKEN (single mode only). */
  login: "paperclip" | "static";
  /** JSON file for clients/grants/tokens (single-process). Ignored when `database` is set. */
  dataFile: string | null;
  /** Postgres store (required for multi-tenant). */
  database: PgOptions | null;
  /** Browser-reachable Paperclip origin for the approval link (single mode). */
  paperclipPublicUrl: string | null;
  accessTtlSec: number;
  refreshTtlSec: number;
  /** Revoke (and delete the stored credential of) grants unused for this many days. 0 = never. */
  idleRevokeDays: number;
  /** Max tool calls per grant per minute. */
  callsPerMinute: number;
  /** Hostnames allowed as https redirect targets for registered clients; "*" allows any https host. */
  redirectHosts: string[];
  /** How many reverse proxies sit in front (Render = 1). The client IP is taken that many entries from the right of X-Forwarded-For. 0 = ignore the header. */
  proxyHops: number;
  instance: InstancePolicy;
}

export interface HttpConfig {
  host: string;
  port: number;
  /** Bearer token for the bridge's own HTTP endpoints (single mode / static access). */
  bridgeToken: string | null;
  /** Public base URL used in the generated OpenAPI `servers` entry. */
  publicUrl: string | null;
  /** Null unless BRIDGE_OAUTH=1. */
  oauth: OAuthConfig | null;
  audit: {
    /** Telemetry rows (audit, community events, node samples) older than this are deleted hourly. */
    retentionDays: number;
    /** Also print audit lines on stderr. */
    stderr: boolean;
  };
}

const nonEmpty = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
const truthy = (v: string | undefined) => /^(1|true|yes|on)$/i.test(v?.trim() ?? "");
const posInt = (v: string | undefined, d: number) => (Number(v) > 0 ? Math.floor(Number(v)) : d);
const list = (v: string | undefined) => (v ? v.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean) : []);

export function normalizeApiUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  return {
    apiUrl: normalizeApiUrl(nonEmpty(env.PAPERCLIP_API_URL) ?? "http://localhost:3100"),
    apiKey: nonEmpty(env.PAPERCLIP_API_KEY),
    companyId: nonEmpty(env.PAPERCLIP_COMPANY_ID),
    readOnly: truthy(env.PAPERCLIP_READ_ONLY),
    timeoutMs: posInt(env.PAPERCLIP_TIMEOUT_MS, 30_000),
  };
}

const DEFAULT_REDIRECT_HOSTS = ["claude.ai", "claude.com", "chatgpt.com", "chat.openai.com", "platform.openai.com"];
const isLoopbackHost = (h: string) => ["localhost", "127.0.0.1", "[::1]", "::1"].includes(h);

export function readDatabase(env: NodeJS.ProcessEnv): PgOptions | null {
  const connectionString = nonEmpty(env.DATABASE_URL);
  if (!connectionString) return null;
  const ssl = (nonEmpty(env.DATABASE_SSL) ?? "verify") as string;
  if (!["off", "require", "verify"].includes(ssl)) throw new Error("DATABASE_SSL must be off, require or verify");
  const ca = nonEmpty(env.DATABASE_CA)?.replace(/\\n/g, "\n");
  return { connectionString, ssl: ssl as PgOptions["ssl"], ca: ca ?? undefined, max: posInt(env.DATABASE_POOL_MAX, 10) };
}

export function readOAuthConfig(env: NodeJS.ProcessEnv, publicUrl: string | null, bridgeToken: string | null): OAuthConfig | null {
  if (!truthy(env.BRIDGE_OAUTH)) return null;
  if (!publicUrl) throw new Error("BRIDGE_OAUTH=1 requires BRIDGE_PUBLIC_URL (the https origin clients reach the bridge at)");
  const u = new URL(publicUrl);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && isLoopbackHost(u.hostname))) {
    throw new Error("BRIDGE_PUBLIC_URL must be https (http is allowed only for localhost development)");
  }
  if (u.pathname !== "/" || u.search || u.hash) throw new Error("BRIDGE_PUBLIC_URL must be an origin with no path");
  const secret = nonEmpty(env.BRIDGE_SECRET);
  if (!secret || secret.length < 32) throw new Error("BRIDGE_OAUTH=1 requires BRIDGE_SECRET of at least 32 characters (`openssl rand -hex 32`)");
  const previousSecrets = (env.BRIDGE_SECRET_PREVIOUS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (previousSecrets.some((s) => s.length < 32)) throw new Error("BRIDGE_SECRET_PREVIOUS entries must be at least 32 characters");

  const mode = (nonEmpty(env.BRIDGE_MODE) ?? "single") as string;
  if (mode !== "single" && mode !== "multi") throw new Error("BRIDGE_MODE must be 'single' or 'multi'");
  const login = (nonEmpty(env.BRIDGE_LOGIN) ?? "paperclip") as string;
  const centralEnabled = truthy(env.BRIDGE_CENTRAL_AUTH);
  const centralPublicKey = nonEmpty(env.BRIDGE_CENTRAL_AUTH_PUBLIC_KEY);
  if (centralEnabled && (mode !== "multi" || !centralPublicKey))
    throw new Error("Hosted central auth requires BRIDGE_MODE=multi and BRIDGE_CENTRAL_AUTH_PUBLIC_KEY");
  if (login !== "paperclip" && login !== "static") throw new Error("BRIDGE_LOGIN must be 'paperclip' or 'static'");
  const database = readDatabase(env);

  if (mode === "multi") {
    if (login !== "paperclip") throw new Error("BRIDGE_MODE=multi requires BRIDGE_LOGIN=paperclip (a shared admin token cannot be used on a public service)");
    if (bridgeToken) throw new Error("BRIDGE_TOKEN must not be set in multi-tenant mode: a static token would grant control of whichever instance it is configured for");
    if (!database && !truthy(env.BRIDGE_ALLOW_EPHEMERAL)) throw new Error("BRIDGE_MODE=multi requires DATABASE_URL (set BRIDGE_ALLOW_EPHEMERAL=1 only for local experiments)");
  } else if (login === "static" && !bridgeToken) {
    throw new Error("BRIDGE_LOGIN=static requires BRIDGE_TOKEN (the operator password on the consent page)");
  }

  const issuerHost = u.hostname;
  const hosts = nonEmpty(env.BRIDGE_OAUTH_REDIRECT_HOSTS);
  const allowHosts = list(env.BRIDGE_INSTANCE_ALLOWLIST);
  return {
    issuer: u.origin,
    secret,
    previousSecrets,
    mode,
    accounts: mode === "multi",
    centralAuth: centralEnabled ? { publicKey: centralPublicKey! } : null,
    login,
    dataFile: nonEmpty(env.BRIDGE_DATA_FILE),
    database,
    paperclipPublicUrl: nonEmpty(env.PAPERCLIP_PUBLIC_URL)?.replace(/\/+$/, "") ?? null,
    accessTtlSec: posInt(env.BRIDGE_ACCESS_TTL_SEC, 3600),
    refreshTtlSec: posInt(env.BRIDGE_REFRESH_TTL_SEC, 30 * 24 * 3600),
    idleRevokeDays: env.BRIDGE_IDLE_REVOKE_DAYS === "0" ? 0 : posInt(env.BRIDGE_IDLE_REVOKE_DAYS, 30),
    callsPerMinute: posInt(env.BRIDGE_CALLS_PER_MINUTE, 120),
    redirectHosts: hosts ? list(hosts) : DEFAULT_REDIRECT_HOSTS,
    proxyHops: env.BRIDGE_PROXY_HOPS !== undefined ? Math.max(0, Math.floor(Number(env.BRIDGE_PROXY_HOPS)) || 0) : 0,
    instance: {
      allowedPorts: list(env.BRIDGE_ALLOWED_PORTS).map(Number).filter((n) => n > 0 && n < 65536).length
        ? list(env.BRIDGE_ALLOWED_PORTS).map(Number).filter((n) => n > 0 && n < 65536)
        : DEFAULT_URL_POLICY.allowedPorts,
      denyHosts: [issuerHost, ...list(env.BRIDGE_INSTANCE_DENYLIST)],
      allowHosts: allowHosts.length ? allowHosts : null,
    },
  };
}

export function readHttpConfig(env: NodeJS.ProcessEnv = process.env): HttpConfig {
  const publicUrl = nonEmpty(env.BRIDGE_PUBLIC_URL)?.replace(/\/+$/, "") ?? null;
  const bridgeToken = nonEmpty(env.BRIDGE_TOKEN);
  const onPaas = !!nonEmpty(env.PORT); // Render/Heroku/Fly style: must bind all interfaces
  return {
    host: nonEmpty(env.BRIDGE_HOST) ?? (onPaas ? "0.0.0.0" : "127.0.0.1"),
    port: posInt(env.BRIDGE_PORT ?? env.PORT, 3939),
    bridgeToken,
    publicUrl,
    oauth: readOAuthConfig(env, publicUrl, bridgeToken),
    audit: {
      retentionDays: posInt(env.BRIDGE_AUDIT_RETENTION_DAYS, 30),
      stderr: env.BRIDGE_AUDIT_STDERR === undefined ? true : truthy(env.BRIDGE_AUDIT_STDERR),
    },
  };
}

/** `*.example.com` matches any subdomain; a bare host matches itself. */
export function hostAllowed(host: string, allow: string[] | null): boolean {
  if (!allow) return true;
  const h = host.toLowerCase();
  return allow.some((p) => (p.startsWith("*.") ? h.endsWith(p.slice(1)) && h.length > p.length - 1 : h === p));
}
