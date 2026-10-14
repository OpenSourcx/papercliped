import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { esc, THEME } from "../oauth/pages.js";
import { VERSION } from "../version.js";
import { randomToken } from "../oauth/crypto.js";
import { FAVICON_LINK, FAVICON_SVG } from "./favicon.js";
import { LANDING_CSS, LANDING_SCRIPT, landingBody } from "./landing.js";
import { renderMarkdown } from "./markdown.js";

export interface SiteOptions {
  /** Public origin, e.g. https://papercliped.co */
  url: string;
  /** Where people reach the operator (privacy requests, vulnerability reports). */
  contact: string;
  /** Effective date shown on the legal pages (YYYY-MM-DD). */
  /** Where AI apps connect (the OAuth issuer), for {{MCP}} in the pages; defaults to url. */
  mcpUrl?: string;
  effective: string;
  /** Directory holding privacy.md, terms.md and docs/*.md. */
  dir?: URL;
  /** Aggregate counts for the landing page. Only numbers: never names. */
  stats?: () => Promise<{ users: number; connections: number }>;
}

const NAV: { slug: string; title: string }[] = [
  { slug: "getting-started", title: "Getting started" },
  { slug: "what-is-papercliped", title: "What is Papercliped?" },
  { slug: "signup", title: "Create your account" },
  { slug: "hosting", title: "Host your Paperclip" },
  { slug: "connect-your-paperclip", title: "At home, with a tunnel" },
  { slug: "host-vps", title: "VPS with Docker" },
  { slug: "host-railway", title: "Railway" },
  { slug: "host-render", title: "Render" },
  { slug: "host-fly", title: "Fly.io" },
  { slug: "host-coolify", title: "Coolify" },
  { slug: "other-ai-apps", title: "Any AI app (MCP)" },
  { slug: "chatgpt", title: "ChatGPT setup" },
  { slug: "prompts", title: "Prompt gallery" },
  { slug: "permissions", title: "Permissions" },
  { slug: "control-room", title: "The control room" },
  { slug: "access-modes", title: "API only, Full or Agent only" },
  { slug: "manage", title: "Manage connections" },
  { slug: "paperclip-plugin", title: "Paperclip plugin" },
  { slug: "anonymous-mode", title: "Anonymous mode" },
  { slug: "self-hosting", title: "Run it yourself" },
  { slug: "tools", title: "Tool reference" },
  { slug: "manage-api", title: "Manage API" },
  { slug: "public-api", title: "Public API and status" },
  { slug: "environment", title: "Environment variables" },
  { slug: "cli", title: "Command line" },
  { slug: "limits-and-errors", title: "Limits and errors" },
  { slug: "security", title: "Security" },
  { slug: "faq", title: "FAQ" },
  { slug: "troubleshooting", title: "Troubleshooting" },
];

const CLIP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;

const CSS = `
:root{--bg:${THEME.bg};--ink:${THEME.ink};--ink2:${THEME.ink2};--muted:${THEME.muted};--line:${THEME.line}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--ink)}a:focus-visible{outline:2px solid var(--ink2);outline-offset:2px}
header{display:flex;flex-wrap:wrap;align-items:center;gap:8px 24px;padding:18px max(20px,5vw);border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:8px;font-weight:600;font-size:17px;text-decoration:none}.brand svg{width:20px;height:20px}
header nav{display:flex;flex-wrap:wrap;gap:4px 18px;font-size:14px}header nav a{color:var(--ink2);text-decoration:none}header nav a:hover,header nav a[aria-current]{color:var(--ink);text-decoration:underline}
.wrap{display:flex;gap:48px;padding:36px max(20px,5vw) 60px;max-width:1100px;margin:0 auto}
aside{flex:0 0 190px;font-size:14px}aside a{display:block;padding:5px 0;color:var(--ink2);text-decoration:none}aside a[aria-current]{color:var(--ink);font-weight:600}
@media (max-width:760px){.wrap{display:block}aside{margin-bottom:20px}aside a{display:inline-block;margin-right:14px}}
article{min-width:0;max-width:720px;flex:1}
h1{font-size:30px;line-height:1.2;margin:0 0 14px}h2{font-size:20px;margin:34px 0 8px}h3{font-size:16px;margin:24px 0 6px}
p,ul,ol{margin:0 0 14px}li{margin:3px 0}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em;background:rgba(71,70,60,.09);padding:1px 5px;border-radius:4px}
pre{background:rgba(71,70,60,.09);border:1px solid var(--line);border-radius:8px;padding:12px 14px;overflow-x:auto;margin:0 0 16px}pre code{background:none;padding:0}
.tw{overflow-x:auto;margin:0 0 16px}table{border-collapse:collapse;width:100%;font-size:14.5px}th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}th{background:rgba(71,70,60,.07)}
.hero{padding:70px max(20px,5vw) 40px;max-width:1100px;margin:0 auto}.hero h1{font-size:40px;max-width:640px}.hero p{max-width:600px;color:var(--ink2);font-size:18px}
.cta{display:inline-block;margin:10px 12px 0 0;padding:11px 20px;border:1px solid var(--ink2);border-radius:8px;background:var(--ink2);color:var(--bg);text-decoration:none;font-weight:600}.cta.ghost{background:transparent;color:var(--ink)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;padding:10px max(20px,5vw) 50px;max-width:1100px;margin:0 auto}
.card{border:1px solid var(--line);border-radius:10px;padding:16px 18px}.card h2{margin:0 0 6px;font-size:17px}.card p{margin:0;color:var(--ink2);font-size:14.5px}
footer{border-top:1px solid var(--line);padding:22px max(20px,5vw);font-size:13.5px;color:var(--muted)}footer a{color:var(--muted)}
`;

const SECURITY_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "public, max-age=300",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
};
const CSP = (nonce?: string) => `default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; ${nonce ? `script-src 'nonce-${nonce}'; connect-src 'self'; ` : ""}base-uri 'none'; frame-ancestors 'none'; form-action 'none'`;

export class SiteRoutes {
  private pages = new Map<string, { title: string; html: string }>();

  constructor(private o: SiteOptions) {
    const dir = o.dir ?? new URL("../../site/", import.meta.url);
    const fill = (md: string) => md.replaceAll("{{MCP}}", o.mcpUrl ?? o.url).replaceAll("{{URL}}", o.url).replaceAll("{{CONTACT}}", o.contact).replaceAll("{{DATE}}", o.effective);
    const load = (rel: string) => renderMarkdown(fill(readFileSync(new URL(rel, dir), "utf8")));
    this.pages.set("/privacy", { title: "Privacy", html: load("privacy.md") });
    this.pages.set("/terms", { title: "Terms", html: load("terms.md") });
    for (const n of NAV) this.pages.set(`/docs/${n.slug}`, { title: n.title, html: load(`docs/${n.slug}.md`) });
  }

  private layout(title: string, body: string, current: string, script?: { nonce: string; code: string; css: string }): string {
    const nav = `<nav aria-label="Main"><a href="/docs/getting-started"${current.startsWith("/docs") ? " aria-current=page" : ""}>Docs</a><a href="/privacy"${current === "/privacy" ? " aria-current=page" : ""}>Privacy</a><a href="/terms"${current === "/terms" ? " aria-current=page" : ""}>Terms</a><a href="https://github.com/OpenSourcx/papercliped" rel="noopener noreferrer">GitHub</a></nav>`;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(title)} · Papercliped</title>${FAVICON_LINK}<meta name="description" content="Connect Claude and ChatGPT to your Paperclip: control agents, sync and get reports, with permissions you choose."><style>${CSS}${script?.css ?? ""}</style></head><body><header><a class="brand" href="/">${CLIP}<span>Papercliped</span></a>${nav}</header>${body}<footer>Papercliped ${esc(VERSION)} · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/docs/security">Security</a></footer>${script ? `<script nonce="${script.nonce}">${script.code}</script>` : ""}</body></html>`;
  }

  private doc(path: string): string {
    const p = this.pages.get(path)!;
    const side = path.startsWith("/docs/")
      ? `<aside aria-label="Docs">${NAV.map((n) => `<a href="/docs/${n.slug}"${path === `/docs/${n.slug}` ? " aria-current=page" : ""}>${esc(n.title)}</a>`).join("")}</aside>`
      : "";
    return this.layout(p.title, `<div class="wrap">${side}<article>${p.html}</article></div>`, path);
  }

  private home(nonce: string): string {
    return this.layout("Control your Paperclip from Claude", landingBody(), "/", { nonce, code: LANDING_SCRIPT, css: LANDING_CSS });
  }

  private statsCache: { at: number; v: { users: number; connections: number } | null } = { at: 0, v: null };
  private async stats(): Promise<{ users: number; connections: number } | null> {
    if (!this.o.stats) return null;
    if (Date.now() - this.statsCache.at > 60_000) {
      this.statsCache = { at: Date.now(), v: await this.o.stats().catch(() => null) };
    }
    return this.statsCache.v;
  }

  /** True when the request was served. */
  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== "GET" && req.method !== "HEAD") return false;
    let path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
    const head = req.method === "HEAD";
    if (path === "/favicon.svg" || path === "/favicon.ico") {
      res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" });
      res.end(head ? undefined : FAVICON_SVG);
      return true;
    }
    if (path === "/api/public/stats") {
      const v = await this.stats();
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "public, max-age=30", "X-Content-Type-Options": "nosniff" });
      res.end(head ? undefined : JSON.stringify(v ?? {}));
      return true;
    }
    if (path === "/docs") path = "/docs/getting-started";
    if (path === "/") {
      const nonce = randomToken(12); // the landing page has a script, so it carries a per-request nonce and is not cached
      res.writeHead(200, { ...SECURITY_HEADERS, "Cache-Control": "no-store", "Content-Security-Policy": CSP(nonce) });
      res.end(head ? undefined : this.home(nonce));
      return true;
    }
    if (!this.pages.has(path)) return false;
    res.writeHead(200, { ...SECURITY_HEADERS, "Content-Security-Policy": CSP() });
    res.end(head ? undefined : this.doc(path));
    return true;
  }

  paths(): string[] {
    return ["/", ...this.pages.keys()];
  }
}
