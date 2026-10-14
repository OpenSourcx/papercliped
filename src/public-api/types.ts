/**
 * The public, aggregate-only Papercliped API (GET /api/public/v1/*). These types are the contract: consumers (the website's
 * status page, the separate domain service and its dashboard) can import or copy them. Additive changes keep
 * `schemaVersion`; anything breaking bumps it and gets a new path (/v2).
 *
 * Aggregate only, by design: no usernames, aliases, account/grant ids, Paperclip hosts, app names, IPs, tokens or free text,
 * and no per-user or per-tenant breakdown. Categories are fixed lists, never values taken from user data.
 */
export const PUBLIC_SCHEMA_VERSION = 1 as const;

export const PUBLIC_WINDOWS = ["1h", "24h", "7d"] as const;
export type PublicWindow = (typeof PUBLIC_WINDOWS)[number];

/** Why a sign-in or connect flow failed. Anything the bridge records outside this list is counted as `other`. */
export const AUTH_FAILURE_REASONS = ["bad_credentials", "rate_limited", "denied", "expired", "unreachable", "invalid_instance", "too_many_attempts", "other"] as const;
export type AuthFailureReason = (typeof AUTH_FAILURE_REASONS)[number];

/** Error classes of tool calls and protocol requests. Anything else is counted as `other`. */
export const ERROR_CLASSES = ["invalid_input", "insufficient_scope", "read_only", "upstream_4xx", "upstream_5xx", "upstream_unreachable", "rate_limited", "unauthorized", "policy_blocked", "internal", "other"] as const;
export type ErrorClass = (typeof ERROR_CLASSES)[number];

/** ok: working normally (or idle). degraded: slower or more faults than usual. down: a major problem (database failing, many faults). */
export type ServiceStatus = "ok" | "degraded" | "down";

export interface PublicStatus {
  schemaVersion: typeof PUBLIC_SCHEMA_VERSION;
  status: ServiceStatus;
  version: string;
  uptimeSeconds: number;
  checkedAt: string; // ISO 8601
}

export interface Latency {
  p50: number;
  p95: number;
  p99: number;
}

export interface PublicStats {
  schemaVersion: typeof PUBLIC_SCHEMA_VERSION;
  window: PublicWindow;
  windowSeconds: number;
  generatedAt: string;
  service: { version: string; uptimeSeconds: number; status: ServiceStatus };
  users: { total: number; active: number; new: number };
  connections: { live: number };
  auth: { flowsStarted: number; flowsCompleted: number; flowsFailed: number; successRate: number | null; failuresByReason: Record<AuthFailureReason, number> };
  requests: { count: number; errors: number; faults: number; successRate: number | null; latencyMs: Latency; callsPerMinute: number; byTool: Record<string, number> };
  errors: { total: number; byClass: Record<ErrorClass, number> };
  load: { eventLoopLagP99Ms: number | null; dbPingMs: number | null; memoryMb: number | null; bridgesReporting: number };
}

export interface PublicSeriesBucket {
  t: string; // bucket start, ISO 8601
  requests: number;
  errors: number;
  faults: number;
  p95Ms: number;
  authCompleted: number;
  authFailed: number;
  newUsers: number;
}
export interface PublicSeries {
  schemaVersion: typeof PUBLIC_SCHEMA_VERSION;
  window: PublicWindow;
  bucketSeconds: number;
  generatedAt: string;
  buckets: PublicSeriesBucket[];
}

export interface PublicErrors {
  schemaVersion: typeof PUBLIC_SCHEMA_VERSION;
  window: PublicWindow;
  generatedAt: string;
  requests: number;
  errorRate: number | null;
  byClass: Record<ErrorClass, number>;
  authFailuresByReason: Record<AuthFailureReason, number>;
}

export interface PublicInfo {
  schemaVersion: typeof PUBLIC_SCHEMA_VERSION;
  service: "papercliped";
  version: string;
  docs: string;
  endpoints: { path: string; description: string }[];
  windows: readonly PublicWindow[];
  rateLimit: { requestsPerMinute: number };
  cacheSeconds: number;
}

/** The project's GitHub repository numbers, fetched by the bridge (cached for an hour) so browsers never call GitHub directly. */
export interface PublicRepo {
  schemaVersion: typeof PUBLIC_SCHEMA_VERSION;
  repo: string; // "OpenSourcx/papercliped"
  url: string;
  stars: number | null; // null when GitHub couldn't be reached yet
  forks: number | null;
  openIssues: number | null;
  fetchedAt: string | null;
}
