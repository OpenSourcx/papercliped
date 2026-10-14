import { existsSync, readFileSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { SITE_CSP } from "./csp.js";
import { roleOf, type HostMap } from "./hosts.js";

export interface WebAppOptions {
  /** The built website (web/dist): index.html, routes.json, assets. */
  dir: string;
  hosts: HostMap;
  /** Where forum.<domain> sends people. Defaults to the marketing host's /community page. */
  forumUrl?: string | null;
}

/** Paths the bridge itself serves on every host; the website never answers them. */
const PROTOCOL = /^\/(mcp|actions\/|openapi\.json$|register$|authorize|token$|revoke$|\.well-known\/|api\/|manage$|healthz$|readyz$)/;
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json", ".zip": "application/zip",
};
const HEADERS = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "DENY" };

/**
 * Serves the React website and does the host routing:
 *   marketing host  → the site; /docs/* moves to the docs host when there is one
 *   docs host       → the docs landing at / and each page at /<page>; old /docs/* and /topics/* links redirect there;
 *                     other pages go to the marketing host
 *   api host        → protocol endpoints only (handled elsewhere); pages redirect to the marketing host
 *   forum host      → redirects to the forum
 * Hosts not in PUBLIC_HOSTS (and a bridge with no PUBLIC_HOSTS) get the whole site, as before.
 */
export class WebAppRoutes {
  private index: string;
  private routes: Set<string>;
  /** Doc page slugs ("permissions", "faq"…), from the /docs/<slug> entries in routes.json. */
  private docSlugs: Set<string>;

  constructor(private o: WebAppOptions) {
    this.index = readFileSync(join(o.dir, "index.html"), "utf8");
    this.routes = new Set(JSON.parse(readFileSync(join(o.dir, "routes.json"), "utf8")) as string[]);
    this.docSlugs = new Set([...this.routes].filter((r) => r.startsWith("/docs/")).map((r) => r.slice("/docs/".length)));
  }

  /** Finds web/dist next to the package, or WEB_DIST. Null when the website isn't built (then the bridge's own pages are used). */
  static locate(env: NodeJS.ProcessEnv, fallback: string): string | null {
    const dir = env.WEB_DIST?.trim() || fallback;
    return existsSync(join(dir, "index.html")) && existsSync(join(dir, "routes.json")) ? dir : null;
  }

  private canonical(role: "marketing" | "docs") {
    return this.o.hosts[role][0];
  }

  private redirect(res: ServerResponse, to: string, permanent = true): true {
    res.writeHead(permanent ? 301 : 302, { Location: to, "Cache-Control": permanent ? "public, max-age=3600" : "no-store", ...HEADERS });
    res.end();
    return true;
  }

  /** The page shell, with the host map for the app's links (see web/src/lib/hosts.ts). */
  private shell(res: ServerResponse, status: number, head: boolean): true {
    const map = JSON.stringify({ marketing: this.canonical("marketing"), docs: this.canonical("docs") }).replace(/"/g, "&quot;");
    res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", "Content-Security-Policy": SITE_CSP, ...HEADERS });
    res.end(head ? undefined : this.index.replace('<meta name="pcl-hosts" content="{}" />', `<meta name="pcl-hosts" content="${map}" />`));
    return true;
  }

  private file(res: ServerResponse, path: string, head: boolean): boolean {
    let rel: string;
    try {
      rel = normalize(decodeURIComponent(path)).replace(/^([/\\])+/, "");
    } catch {
      return false;
    }
    if (!rel || rel.split(/[/\\]/).includes("..") || rel === "index.html" || rel === "routes.json") return false;
    const full = join(this.o.dir, rel);
    if (!full.startsWith(this.o.dir.endsWith(sep) ? this.o.dir : this.o.dir + sep)) return false;
    let st;
    try {
      st = statSync(full);
    } catch {
      return false;
    }
    if (!st.isFile()) return false;
    const immutable = rel.startsWith("assets" + sep) || rel.startsWith("assets/") || rel.startsWith("fonts");
    res.writeHead(200, {
      "Content-Type": TYPES[extname(full).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": String(st.size),
      "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=3600",
      ...(rel.endsWith(".html") ? { "Content-Security-Policy": SITE_CSP } : {}),
      ...(immutable && rel.startsWith("fonts") ? { "Access-Control-Allow-Origin": "*" } : {}),
      ...HEADERS,
    });
    res.end(head ? undefined : readFileSync(full));
    return true;
  }

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== "GET" && req.method !== "HEAD") return false;
    const head = req.method === "HEAD";
    const raw = url.pathname;
    const path = raw.length > 1 ? raw.replace(/\/+$/, "") : raw;
    if (PROTOCOL.test(path)) return false;
    const host = String(req.headers.host ?? "").toLowerCase();
    const role = roleOf(this.o.hosts, host);
    const q = url.search;
    const mk = this.canonical("marketing");
    const docs = this.canonical("docs");
    const isDocs = /^\/(docs|topics)(\/|$)/.test(path);
    const docsRest = isDocs ? path.replace(/^\/(docs|topics)\/?/, "") : "";

    if (role === "forum") return this.redirect(res, this.o.forumUrl || (mk ? `https://${mk}/community` : "/"), false);
    if (role === "api") return mk ? this.redirect(res, `https://${mk}${path === "/" ? "/" : path}${q}`, false) : false;
    if (role === "marketing" && mk && host !== mk) return this.redirect(res, `https://${mk}${raw}${q}`); // www → apex

    if (role === "docs") {
      if (isDocs) return this.redirect(res, `/${docsRest}${q}`); // old /docs/x and /topics/x links
      if (path === "/" || this.docSlugs.has(path.slice(1))) return this.shell(res, 200, head);
      if (this.routes.has(path) && mk) return this.redirect(res, `https://${mk}${path}${q}`);
    } else if (isDocs) {
      // Marketing (or unlisted) host: docs move to the docs host when there is one. /topics is an old spelling.
      if (docs) return this.redirect(res, `https://${docs}/${docsRest}${q}`);
      if (/^\/topics(\/|$)/.test(path)) return this.redirect(res, `/docs${docsRest ? `/${docsRest}` : ""}${q}`);
    }

    if (path !== "/" && this.file(res, raw, head)) return true;
    if (this.routes.has(path)) return this.shell(res, 200, head);
    if (extname(path)) return false; // a missing file: let the bridge answer 404
    return this.shell(res, 404, head); // the app shows its not-found page
  }
}
