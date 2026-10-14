import type { IncomingMessage, ServerResponse } from "node:http";
import { PolicyInputError } from "../access/policy.js";
import { displayName } from "../accounts/alias.js";
import type { Account } from "../accounts/types.js";
import type { OAuthProvider } from "../oauth/provider.js";
import type { Scope } from "../oauth/scopes.js";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

/** A DNS name or IPv4 literal, optionally with a port; undefined when it is anything else. */
function cleanHost(v: unknown): string | null | undefined {
  if (typeof v !== "string") return undefined;
  const h = v.trim().toLowerCase();
  if (!h) return null;
  if (h.length > 255 || !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/.test(h)) return undefined;
  try {
    return new URL(`https://${h}`).host;
  } catch {
    return undefined;
  }
}
const cleanUid = (v: unknown): string | null | undefined => (v == null ? null : typeof v === "string" && v.length <= 100 ? v : undefined);

export interface ManageOptions {
  now?: () => number;
}

/**
 * The manage API behind the Papercliped plugin for Paperclip (there is no web page for it any more: managing happens inside
 * Paperclip). The plugin signs in once with username + secret key and gets a plugin token; with it, it can list and change
 * connected apps, switch anonymity, and list or remove plugin links. Sensitive actions (new secret key, disconnect Paperclip,
 * delete account) need the secret key again in the request. Every action is limited to the token's own account.
 *
 * Only bearer tokens are accepted, and a cross-site page cannot attach one without a CORS preflight (which we never approve),
 * so there is no cookie and no CSRF surface.
 */
export class ManageRoutes {
  constructor(private p: OAuthProvider, _o: ManageOptions = {}) {}

  private json(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): true {
    res.writeHead(status, { "Content-Type": "application/json", ...HEADERS, ...extra });
    res.end(JSON.stringify(body));
    return true;
  }

  private async body(req: IncomingMessage): Promise<Record<string, unknown> | null> {
    if (!/^application\/json\b/i.test(String(req.headers["content-type"] ?? ""))) return null;
    let raw = "";
    for await (const c of req) {
      raw += c;
      if (raw.length > 8192) return null;
    }
    try {
      const j = JSON.parse(raw || "{}");
      return j && typeof j === "object" && !Array.isArray(j) ? j : null;
    } catch {
      return null;
    }
  }

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const m = req.method ?? "GET";
    // The old browser page: managing now happens in Paperclip, with the plugin.
    if (path === "/manage") {
      res.writeHead(302, { Location: "/docs/paperclip-plugin", ...HEADERS });
      res.end();
      return true;
    }
    if (!path.startsWith("/api/manage")) return false;
    const route = path.slice("/api/manage".length) || "/";

    // The plugin proves the secret key once and gets its token. Throttled exactly like the sign-in page.
    if (m === "POST" && route === "/plugin-link/sign-in") {
      const b = await this.body(req);
      if (!b) return this.json(res, 400, { error: "Send JSON" });
      const host = b.instanceHost == null ? null : cleanHost(b.instanceHost);
      const uid = cleanUid(b.paperclipUserId);
      if (host === undefined || uid === undefined) return this.json(res, 400, { error: "Invalid instanceHost or paperclipUserId" });
      const r = await this.p.manageLogin(req, String(b.username ?? ""), String(b.secret ?? ""));
      if (!r.ok) return r.reason === "throttled" ? this.json(res, 429, { error: "Too many attempts. Wait a few minutes." }) : this.json(res, 401, { error: "That username and secret key don't match." });
      const { token } = await this.p.manageLinkPlugin(r.account, { instanceHost: host, paperclipUserId: uid });
      return this.json(res, 200, { token });
    }

    const bearer = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization ?? ""))?.[1] ?? null;
    const pr = bearer ? await this.p.managePluginPrincipal(bearer) : null;
    if (!pr) return this.json(res, 401, { error: "Link the Papercliped plugin again" });
    const a: Account = pr.account;
    const linkId = pr.linkId;
    if (!(await this.p.store.hit(`manage:${a.id}`, 120, 60_000))) return this.json(res, 429, { error: "Slow down" });

    if (m === "GET" && route === "/me") {
      const link = await this.p.manageInstanceLabel(a.id);
      return this.json(res, 200, { name: displayName(a), anonymous: !!a.anonymous, alias: a.alias ?? null, paperclip: link.label, connected: link.connected, createdAt: a.createdAt });
    }

    if (m === "GET" && (route === "/connections" || route === "/sessions")) {
      const list = await this.p.manageConnections(a.id);
      return this.json(res, 200, route === "/sessions" ? { sessions: list } : { connections: list });
    }

    // The control room: the access switch, per-session limits, the tool list and recent calls.
    if (route === "/policy" && (m === "GET" || m === "POST" || m === "PUT")) {
      if (m === "GET") return this.json(res, 200, await this.p.manageGetPolicy(a));
      const b = await this.body(req);
      if (!b) return this.json(res, 400, { error: "Send JSON" });
      try {
        return this.json(res, 200, await this.p.manageSetPolicy(a, b));
      } catch (e) {
        return e instanceof PolicyInputError ? this.json(res, 400, { error: e.message }) : this.json(res, 500, { error: "Could not save the access settings" });
      }
    }
    if (m === "GET" && route === "/tools") return this.json(res, 200, { tools: this.p.manageTools() });
    if (m === "GET" && route === "/activity") {
      const session = url.searchParams.get("session") ?? undefined;
      if (session !== undefined && !/^[A-Za-z0-9_-]{1,80}$/.test(session)) return this.json(res, 400, { error: "Invalid session" });
      const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
      return this.json(res, 200, { calls: await this.p.manageActivity(a, { session, limit: Number.isFinite(limit) ? limit : 50 }) });
    }
    const sess = /^\/sessions\/([A-Za-z0-9_-]{1,80})$/.exec(route);
    if (sess && m === "POST") {
      const b = await this.body(req);
      if (!b) return this.json(res, 400, { error: "Send JSON" });
      const level: Scope | null | undefined = b.level === undefined ? undefined : b.level === "read" ? "paperclip:read" : b.level === "control" ? "paperclip:control" : null;
      if (level === null) return this.json(res, 400, { error: "level must be read or control" });
      try {
        const next = await this.p.manageSetSession(a, sess[1], { label: b.label, tools: b.tools, agents: b.agents, level });
        return next ? this.json(res, 200, next) : this.json(res, 404, { error: "No such session" });
      } catch (e) {
        return e instanceof PolicyInputError ? this.json(res, 400, { error: e.message }) : this.json(res, 500, { error: "Could not save the session" });
      }
    }
    if (sess && m === "DELETE") return (await this.p.manageRevoke(a, sess[1])) ? this.json(res, 200, { ok: true }) : this.json(res, 404, { error: "No such session" });
    const c = /^\/connections\/([A-Za-z0-9_-]{1,80})$/.exec(route);
    if (c && m === "POST") {
      const b = await this.body(req);
      const level: Scope | null = b?.level === "read" ? "paperclip:read" : b?.level === "control" ? "paperclip:control" : null;
      if (!level) return this.json(res, 400, { error: "level must be read or control" });
      return (await this.p.manageSetLevel(a, c[1], level)) ? this.json(res, 200, { ok: true }) : this.json(res, 404, { error: "No such connection" });
    }
    if (c && m === "DELETE") return (await this.p.manageRevoke(a, c[1])) ? this.json(res, 200, { ok: true }) : this.json(res, 404, { error: "No such connection" });

    if (m === "GET" && route === "/plugin-links") return this.json(res, 200, { links: (await this.p.manageListPluginLinks(a.id)).map((l) => ({ id: l.id, host: l.host, createdAt: l.createdAt, lastUsedAt: l.lastUsedAt, current: l.id === linkId })) });
    const pl = /^\/plugin-links\/([A-Za-z0-9_-]{1,80})$/.exec(route);
    if (pl && m === "DELETE") {
      const id = pl[1] === "self" ? linkId : pl[1];
      return (await this.p.manageRevokePluginLink(a, id)) ? this.json(res, 200, { ok: true }) : this.json(res, 404, { error: "No such link" });
    }

    if (m === "POST" && route === "/privacy") {
      const b = await this.body(req);
      if (!b || typeof b.anonymous !== "boolean") return this.json(res, 400, { error: "anonymous must be true or false" });
      try {
        const next = await this.p.manageSetPrivacy(a, b.anonymous);
        return this.json(res, 200, { anonymous: !!next.anonymous, alias: next.alias ?? null, name: displayName(next) });
      } catch {
        return this.json(res, 500, { error: "Could not update privacy" });
      }
    }

    // Sensitive actions: prove the secret key again.
    const sensitive = new Set(["/secret/rotate", "/paperclip/disconnect", "/account/delete"]);
    if (m === "POST" && sensitive.has(route)) {
      const b = await this.body(req);
      if (!b) return this.json(res, 400, { error: "Send JSON" });
      if (!(await this.p.manageReauth(a.id, String(b.secret ?? "")))) return this.json(res, 403, { error: "That secret key is not right (or too many attempts)." });
      if (route === "/secret/rotate") {
        // Every plugin link ends with the old key; this plugin gets a fresh token so it stays linked.
        const links = await this.p.manageListPluginLinks(a.id);
        const here = links.find((l) => l.id === linkId);
        const secret = await this.p.manageRotateSecret(a);
        const fresh = (await this.p.manageAccount(a.id))!;
        const { token } = await this.p.manageLinkPlugin(fresh, { instanceHost: here?.host ?? null, paperclipUserId: here?.paperclipUserId ?? null });
        return this.json(res, 200, { secret, token });
      }
      if (route === "/paperclip/disconnect") {
        await this.p.manageDisconnectPaperclip(a);
        return this.json(res, 200, { ok: true });
      }
      if (String(b.confirm ?? "").toLowerCase() !== a.username.toLowerCase()) return this.json(res, 400, { error: "Type your username to confirm." });
      await this.p.manageDeleteAccount(a);
      return this.json(res, 200, { ok: true });
    }
    return this.json(res, 404, { error: "Not found" });
  }
}
