/** Pure client for the Papercliped bridge's manage API. No Paperclip SDK imports, so it is easy to test against a fake bridge. */

export const DEFAULT_BRIDGE_URL = "https://papercliped.co";

export class BridgeError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "BridgeError";
  }
  /** The token is unknown, expired or revoked: the user has to link again. */
  get unauthorized() {
    return this.status === 401;
  }
}

export interface Connection {
  id: string;
  app: string;
  level: "paperclip:read" | "paperclip:control";
  createdAt: number;
  lastUsedAt: number | null;
}
/** One connected AI app, with the limits set on it. */
export interface Session extends Connection {
  /** A name the person gave it (null = show the app's name). */
  label: string | null;
  /** The tools it may use (null = every tool its level allows). */
  tools: string[] | null;
  /** The agents it applies to (null = everyone). */
  agents: string[] | null;
}
export type Mode = "api" | "full" | "agent";
/** The access switch (the default for every agent) and per-agent overrides ("off" = Papercliped may not touch it). */
export interface Policy {
  mode: Mode;
  agents: Record<string, Mode | "off">;
}
export interface SessionChange {
  label?: string | null;
  tools?: string[] | null;
  agents?: string[] | null;
  level?: "read" | "control";
}
export interface ToolInfo {
  name: string;
  title: string;
  description: string;
  access: "read" | "write" | "destructive";
  surface: "read" | "agent" | "api";
}
export interface CallRow {
  at: number;
  tool: string;
  ok: boolean;
  blocked: boolean;
  status: number | null;
  error: string | null;
  ms: number;
  session: string | null;
  app: string | null;
}
export interface PluginLink {
  id: string;
  host: string | null;
  createdAt: number;
  lastUsedAt: number | null;
  current: boolean;
}
export interface ServiceStatus {
  status: "ok" | "degraded" | "down";
  version: string;
  users: number | null;
  liveConnections: number | null;
  requestSuccessRate: number | null;
  signInSuccessRate: number | null;
  p95Ms: number | null;
  statusPage: string;
}
export interface Me {
  name: string;
  anonymous: boolean;
  alias: string | null;
  paperclip: string | null;
  connected: boolean;
}

/**
 * The bridge URL must be https (the token and, when linking, the secret key travel to it). `allowInsecureLoopback` exists for tests only and
 * the worker never sets it.
 */
export function normalizeBridgeUrl(raw: unknown, opts: { allowInsecureLoopback?: boolean } = {}): string {
  const text = typeof raw === "string" && raw.trim() ? raw.trim() : DEFAULT_BRIDGE_URL;
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    throw new Error("The Papercliped bridge URL is not a valid URL.");
  }
  const loopback = u.hostname === "127.0.0.1" || u.hostname === "localhost";
  if (u.protocol !== "https:" && !(opts.allowInsecureLoopback && u.protocol === "http:" && loopback)) throw new Error("The Papercliped bridge URL must use https.");
  if (u.username || u.password) throw new Error("The Papercliped bridge URL must not contain credentials.");
  if (u.search || u.hash) throw new Error("The Papercliped bridge URL must not contain a query or fragment.");
  return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const MAX_BODY = 1_000_000;

export class BridgeClient {
  constructor(private base: string, private doFetch: FetchLike, private timeoutMs = 10_000) {}

  private async req<T>(method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    let res: Response;
    try {
      res = await this.doFetch(`${this.base}/api/manage${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body), redirect: "error", signal: AbortSignal.timeout(this.timeoutMs) });
    } catch {
      throw new BridgeError("Could not reach the Papercliped bridge.", 0);
    }
    const text = (await res.text()).slice(0, MAX_BODY);
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      /* non-JSON error page */
    }
    if (!res.ok) throw new BridgeError(typeof json?.error === "string" ? json.error.slice(0, 200) : `The bridge answered ${res.status}.`, res.status);
    return json as T;
  }

  /** Sign in once with username + secret key; the bridge answers with a plugin token. The key is not kept anywhere. */
  async signIn(username: string, secret: string, meta: { instanceHost?: string | null; paperclipUserId?: string | null }): Promise<string> {
    const r = await this.req<{ token?: string }>("POST", "/plugin-link/sign-in", { body: { username, secret, instanceHost: meta.instanceHost ?? null, paperclipUserId: meta.paperclipUserId ?? null } });
    return checkToken(r.token);
  }
  me(token: string) {
    return this.req<Me>("GET", "/me", { token });
  }
  async connections(token: string): Promise<Connection[]> {
    return (await this.req<{ connections: Connection[] }>("GET", "/connections", { token })).connections ?? [];
  }
  async sessions(token: string): Promise<Session[]> {
    return (await this.req<{ sessions: Session[] }>("GET", "/sessions", { token })).sessions ?? [];
  }
  /** Change one session: name, tools, agents, level. Anything left out stays as it is. */
  setSession(token: string, id: string, change: SessionChange) {
    return this.req<{ label: string | null; tools: string[] | null; agents: string[] | null }>("POST", `/sessions/${encodeURIComponent(id)}`, { token, body: change });
  }
  policy(token: string) {
    return this.req<Policy>("GET", "/policy", { token });
  }
  setPolicy(token: string, policy: Policy) {
    return this.req<Policy>("POST", "/policy", { token, body: policy });
  }
  async tools(token: string): Promise<ToolInfo[]> {
    return (await this.req<{ tools: ToolInfo[] }>("GET", "/tools", { token })).tools ?? [];
  }
  async activity(token: string, opts: { session?: string; limit?: number } = {}): Promise<CallRow[]> {
    const q = new URLSearchParams();
    if (opts.session) q.set("session", opts.session);
    if (opts.limit) q.set("limit", String(opts.limit));
    return (await this.req<{ calls: CallRow[] }>("GET", `/activity${q.size ? `?${q}` : ""}`, { token })).calls ?? [];
  }
  async setLevel(token: string, id: string, level: "read" | "control"): Promise<void> {
    await this.req("POST", `/connections/${encodeURIComponent(id)}`, { token, body: { level } });
  }
  async disconnect(token: string, id: string): Promise<void> {
    await this.req("DELETE", `/connections/${encodeURIComponent(id)}`, { token });
  }
  setPrivacy(token: string, anonymous: boolean) {
    return this.req<{ anonymous: boolean; alias: string | null; name: string }>("POST", "/privacy", { token, body: { anonymous } });
  }
  /** Public, aggregate-only service numbers (no token): GET /api/public/v1/status and /stats. */
  async serviceStatus(): Promise<ServiceStatus> {
    const get = async (path: string) => {
      let r: Response;
      try {
        r = await this.doFetch(`${this.base}${path}`, { headers: { accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(this.timeoutMs) });
      } catch {
        throw new BridgeError("Could not reach the Papercliped bridge.", 0);
      }
      if (!r.ok) throw new BridgeError(`The bridge answered ${r.status}.`, r.status);
      return (await r.json()) as Record<string, any>;
    };
    const [status, stats] = await Promise.all([get("/api/public/v1/status"), get("/api/public/v1/stats?window=24h")]);
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    return {
      status: status.status === "ok" || status.status === "degraded" || status.status === "down" ? status.status : "down",
      version: typeof status.version === "string" ? status.version.slice(0, 40) : "",
      users: n(stats.users?.total),
      liveConnections: n(stats.connections?.live),
      requestSuccessRate: n(stats.requests?.successRate),
      signInSuccessRate: n(stats.auth?.successRate),
      p95Ms: n(stats.requests?.latencyMs?.p95),
      statusPage: `${this.base}/status`,
    };
  }
  async unlink(token: string): Promise<void> {
    await this.req("DELETE", "/plugin-links/self", { token });
  }
  async links(token: string): Promise<PluginLink[]> {
    return (await this.req<{ links: PluginLink[] }>("GET", "/plugin-links", { token })).links ?? [];
  }
  async removeLink(token: string, id: string): Promise<void> {
    await this.req("DELETE", `/plugin-links/${encodeURIComponent(id)}`, { token });
  }
  /** A new secret key (shown once). Every other plugin link ends; this one gets a fresh token. */
  async rotateSecret(token: string, secret: string): Promise<{ secret: string; token: string }> {
    const r = await this.req<{ secret?: string; token?: string }>("POST", "/secret/rotate", { token, body: { secret } });
    if (typeof r.secret !== "string" || !r.secret.startsWith("pcs_")) throw new BridgeError("The bridge sent an unexpected answer.", 502);
    return { secret: r.secret, token: checkToken(r.token) };
  }
  async disconnectPaperclip(token: string, secret: string): Promise<void> {
    await this.req("POST", "/paperclip/disconnect", { token, body: { secret } });
  }
  async deleteAccount(token: string, secret: string, confirm: string): Promise<void> {
    await this.req("POST", "/account/delete", { token, body: { secret, confirm } });
  }
}

function checkToken(t: unknown): string {
  if (typeof t !== "string" || !t.startsWith("pcb_pl_")) throw new BridgeError("The bridge sent an unexpected answer.", 502);
  return t;
}
