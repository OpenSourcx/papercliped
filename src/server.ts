import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { PaperclipClient } from "./client.js";
import type { BridgeConfig, HttpConfig } from "./config.js";
import { executeTool, type AuditEvent, type ExecOptions } from "./execute.js";
import { createMcpServer } from "./mcp.js";
import type { ExecPolicy } from "./access/policy.js";
import { safeEqual } from "./oauth/crypto.js";
import { OAuthProvider } from "./oauth/provider.js";
import type { PublicApiRoutes } from "./public-api/routes.js";
import type { WebAppRoutes } from "./web/routes.js";
import { ManageRoutes } from "./manage/routes.js";
import { SiteRoutes } from "./site/site.js";
import { buildOpenApi } from "./openapi.js";
import type { AuditRecorder } from "./telemetry/recorder.js";

const MAX_BODY_BYTES = 1_000_000;

export interface ServerOptions {
  client?: PaperclipClient;
  /** Inject a provider (tests). Created from `http.oauth` otherwise. */
  oauth?: OAuthProvider | null;
  /** Tool-call audit callback (tests, custom sinks). Without a recorder or callback, one JSON line per call goes to stderr. */
  audit?: (e: AuditEvent) => void;
  /** Persists tool-call and HTTP events for the dashboard. */
  recorder?: AuditRecorder;
  /** Public pages: landing, docs, privacy, terms. */
  site?: SiteRoutes;
  /** Public, aggregate-only statistics (/api/public/v1/*). */
  publicApi?: PublicApiRoutes;
  /** The React website (web/dist) with host routing; when absent the bridge serves its own Markdown pages. */
  web?: WebAppRoutes;
  /** The beta connection manager (/manage and /api/manage). */
  manage?: ManageRoutes;
}

/** Route groups worth measuring. Health checks, discovery documents and the dashboard itself are excluded. */
export function routeGroup(path: string): string | null {
  if (path === "/register") return "oauth.register";
  if (path === "/authorize" || path === "/authorize/instance" || path === "/authorize/decision") return "oauth.authorize";
  if (path === "/token") return "oauth.token";
  if (path === "/revoke") return "oauth.revoke";
  if (path === "/mcp") return "mcp";
  if (path.startsWith("/actions/")) return "actions";
  return null;
}

const httpErrorClass = (status: number) => (status === 401 ? "unauthorized" : status === 429 ? "rate_limited" : status >= 500 ? "internal" : "invalid_input");

const stderrAudit = (e: AuditEvent) => process.stderr.write(`${JSON.stringify({ audit: e })}\n`);

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Body too large"), { status: 413 });
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Invalid JSON body"), { status: 400 });
  }
}

/** Who is calling the protected endpoints. */
type Principal = { kind: "static" } | { kind: "oauth"; grantId: string; client: string; userId: string | null; username?: string; instance?: string; scopes: string[]; paperclip: PaperclipClient; policy: ExecPolicy };

export function createHttpServer(config: BridgeConfig, http: HttpConfig, opts: ServerOptions = {}): Server {
  const baseClient = opts.client ?? new PaperclipClient(config);
  const audit = (e: AuditEvent) => {
    opts.audit?.(e);
    opts.recorder?.record(e);
    if (!opts.audit && !opts.recorder) stderrAudit(e);
  };
  const oauth =
    opts.oauth !== undefined ? opts.oauth : http.oauth ? new OAuthProvider({ config, oauth: http.oauth, bridgeToken: http.bridgeToken }) : null;

  async function authenticate(req: IncomingMessage): Promise<Principal | null> {
    const m = /^Bearer (.+)$/i.exec(req.headers.authorization ?? "");
    if (!m) return null;
    const token = m[1].trim();
    if (http.bridgeToken && safeEqual(token, http.bridgeToken)) return { kind: "static" };
    const grant = oauth ? await oauth.authenticate(token) : null;
    if (!grant || !oauth) return null;
    let paperclip: PaperclipClient;
    let instance: string | undefined;
    try {
      ({ client: paperclip, instanceHost: instance } = await oauth.resolveClient(grant));
    } catch {
      return null; // unreadable credential, expired connection, or instance no longer allowed: an invalid token (the user reconnects)
    }
    return { kind: "oauth", grantId: grant.id, client: grant.clientName, userId: grant.userId, username: grant.username ?? undefined, instance, scopes: grant.scopes, paperclip, policy: await oauth.policyFor(grant) };
  }

  const execFor = (p: Principal): { client: PaperclipClient; exec: ExecOptions } =>
    p.kind === "static"
      ? { client: baseClient, exec: { actor: { id: "static-token" }, audit } }
      : { client: p.paperclip, exec: { scopes: p.scopes, policy: p.policy, actor: { id: p.grantId, client: p.client, userId: p.userId, instance: p.instance, username: p.username }, audit } };

  const unauthorized = (res: ServerResponse, invalid: boolean) => {
    const challenge = oauth ? oauth.challengeHeader(invalid ? "invalid_token" : undefined) : "Bearer";
    json(res, 401, { error: invalid ? "Invalid or expired token" : "Missing or invalid bearer token" }, { "WWW-Authenticate": challenge });
  };

  return createServer(async (req, res) => {
    const started = performance.now();
    try {
      const url = new URL(req.url ?? "/", "http://bridge");
      const path = url.pathname;

      const group = routeGroup(path);
      if (group && opts.recorder) {
        res.once("finish", () => {
          const status = res.statusCode;
          // 3xx are the OAuth redirects back to the client — successful.
          opts.recorder!.record({ ts: new Date().toISOString(), kind: "http", tool: group, mutation: false, ok: status < 400, status, errorClass: status < 400 ? undefined : httpErrorClass(status), actor: "http", totalMs: Math.round(performance.now() - started) });
        });
      }

      if (path === "/healthz") return json(res, 200, { ok: true, readOnly: config.readOnly, oauth: !!oauth });
      if (path === "/readyz") {
        try {
          await oauth?.store.ping();
          return json(res, 200, { ready: true });
        } catch {
          return json(res, 503, { ready: false });
        }
      }

      if (path === "/openapi.json" && req.method === "GET") {
        const host = req.headers.host ?? `${http.host}:${http.port}`;
        return json(res, 200, buildOpenApi(http.oauth?.issuer ?? http.publicUrl ?? `http://${host}`));
      }

      if (opts.publicApi && (await opts.publicApi.handle(req, res, url))) return;

      if (opts.web && (await opts.web.handle(req, res, url))) return;

      if (opts.site && (await opts.site.handle(req, res, url))) return;

      if (opts.manage && (await opts.manage.handle(req, res, url))) return;

      if (oauth && (await oauth.handle(req, res, url))) return;

      const principal = await authenticate(req);
      if (!principal) return unauthorized(res, !!req.headers.authorization);
      if (principal.kind === "oauth" && oauth && !(await oauth.allowCall(principal.grantId))) {
        return json(res, 429, { error: "Too many requests for this connection; slow down." }, { "Retry-After": "30" });
      }
      const { client, exec } = execFor(principal);

      // Stateless Streamable HTTP: a fresh server+transport per request, so no session affinity is needed.
      if (path === "/mcp") {
        const server = createMcpServer(config, client, exec);
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        res.on("close", () => {
          void transport.close();
          void server.close();
        });
        await server.connect(transport);
        const body = req.method === "POST" ? await readBody(req) : undefined;
        return await transport.handleRequest(req, res, body);
      }

      const action = /^\/actions\/([a-z0-9_]+)$/.exec(path);
      if (action && req.method === "POST") {
        const out = await executeTool(client, action[1], await readBody(req), exec);
        if (out.ok) return json(res, 200, out.result);
        const extra: Record<string, string> = {};
        const needed = (out.error as any)?.insufficient_scope;
        if (out.status === 403 && needed && oauth) extra["WWW-Authenticate"] = oauth.challengeHeader("insufficient_scope", needed);
        return json(res, out.status, { error: out.error }, extra);
      }

      return json(res, 404, { error: "Not found" });
    } catch (err: any) {
      if (!res.headersSent) json(res, err?.status ?? 500, { error: err?.message ?? "Internal error" });
    }
  });
}
