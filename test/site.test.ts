import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/site/markdown.js";
import { SiteRoutes } from "../src/site/site.js";

describe("markdown renderer", () => {
  it("escapes raw HTML and scripts", () => {
    const html = renderMarkdown('# <script>alert(1)</script>\n\nhello <img src=x onerror=alert(1)> **bold** `<b>`');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>&lt;b&gt;</code>");
  });
  it("only links to http(s), mailto and same-site paths", () => {
    const html = renderMarkdown("[a](javascript:alert(1)) [b](https://x.example/p) [c](/docs/security) [d](//evil.example) [e](data:text/html,x)");
    expect(html).not.toMatch(/href="javascript:/i);
    expect(html).not.toMatch(/href="data:/i);
    expect(html).not.toMatch(/href="\/\/evil/);
    expect(html).toContain('href="https://x.example/p"');
    expect(html).toContain('href="/docs/security"');
  });
  it("renders lists, tables and code fences", () => {
    const html = renderMarkdown("- one\n- two\n\n1. a\n2. b\n\n| h1 | h2 |\n| --- | --- |\n| x | y |\n\n```\n<raw>\n```");
    expect(html).toContain("<ul><li>one</li><li>two</li></ul>");
    expect(html).toContain("<ol><li>a</li><li>b</li></ol>");
    expect(html).toContain("<th>h1</th>");
    expect(html).toContain("<pre><code>&lt;raw&gt;</code></pre>");
  });
  it("renders code blocks inside list items and blockquotes, still escaped", () => {
    const html = renderMarkdown("1. **Run:**\n   ```\n   a <b>\n\n   c\n   ```\n   Then wait.\n2. Next\n\n> Say <i>hi</i>\n> **now**");
    expect(html).toContain("<ol><li><p><strong>Run:</strong></p>\n<pre><code>a &lt;b&gt;\n\nc</code></pre>\n<p>Then wait.</p></li><li>Next</li></ol>");
    expect(html).toContain("<blockquote><p>Say &lt;i&gt;hi&lt;/i&gt; <strong>now</strong></p></blockquote>");
  });
});

describe("public site", () => {
  let srv: Server, base: string, site: SiteRoutes;
  beforeAll(async () => {
    site = new SiteRoutes({ url: "https://papercliped.example.com", contact: "support@example.com", effective: "2026-10-06", stats: async () => ({ users: 42, connections: 7 }) });
    srv = createServer(async (req, res) => {
      if (!(await site.handle(req, res, new URL(req.url!, "http://x")))) res.writeHead(404).end("nope");
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  });
  afterAll(() => srv.close());

  it("serves the landing page, docs, privacy and terms with a strict CSP and no external loads", async () => {
    for (const p of site.paths()) {
      const res = await fetch(`${base}${p}`);
      expect(res.status, p).toBe(200);
      const html = await res.text();
      expect(res.headers.get("content-security-policy")).toMatch(/default-src 'none'/);
      expect(res.headers.get("content-security-policy")).toMatch(/frame-ancestors 'none'/);
      expect(html, p).not.toMatch(/<script(?![^>]*nonce=)/i); // any script carries the per-request nonce
      expect(html, p).not.toMatch(/(src|href)=["']https?:\/\/(?!github\.com|papercliped\.example\.com)/); // nothing third-party is loaded
      expect(html, p).not.toMatch(/\{\{[A-Z]+\}\}/); // every placeholder was filled
    }
  });
  it("/docs goes to the first guide and the privacy page shows the contact and date", async () => {
    expect(await (await fetch(`${base}/docs`)).text()).toContain("Getting started");
    const priv = await (await fetch(`${base}/privacy`)).text();
    expect(priv).toContain("support@example.com");
    expect(priv).toContain("2026-10-06");
    expect(priv).toContain("https://papercliped.example.com");
  });
  it("has a step-by-step page for exposing Paperclip, linked from the other guides", async () => {
    const html = await (await fetch(`${base}/docs/connect-your-paperclip`)).text();
    for (const h of ["At home, with a tunnel", "Choose a tunnel", "Install Paperclip in public mode", "Cloudflare Tunnel (with your domain)", "Tailscale Funnel (no domain)", "Create your account", "Connect Papercliped", "Keep it safe", "Troubleshooting"]) expect(html, h).toContain(h);
    expect(html).toContain("cloudflared tunnel route dns");
    expect(html).toContain("tailscale funnel");
    expect(html).not.toMatch(/subdomain (provided|from) papercliped/i); // no such feature exists
    for (const p of ["/docs/getting-started", "/docs/signup", "/docs/troubleshooting"]) expect(await (await fetch(`${base}${p}`)).text(), p).toContain('href="/docs/hosting"');
  });
  it("has a hosting guide per provider, each ending in connecting Papercliped", async () => {
    const hub = await (await fetch(`${base}/docs/hosting`)).text();
    for (const slug of ["connect-your-paperclip", "host-vps", "host-railway", "host-render", "host-fly", "host-coolify"]) {
      expect(hub, slug).toContain(`href="/docs/${slug}"`);
      const html = await (await fetch(`${base}/docs/${slug}`)).text();
      for (const want of ["PAPERCLIP_DEPLOYMENT_EXPOSURE", "bootstrap-ceo", "/api/health", "Catch me up on my Paperclip"]) expect(html, `${slug}: ${want}`).toContain(want);
    }
  });
  it("every internal link on every page points at a page that exists", async () => {
    const known = new Set(site.paths());
    for (const p of site.paths()) {
      const html = await (await fetch(`${base}${p}`)).text();
      for (const m of html.matchAll(/href="(\/[^"#]*)"/g)) expect(known.has(m[1]) || m[1] === "/docs", `${p} → ${m[1]}`).toBe(true);
    }
  });
  it("the landing page is interactive, says the line, has a nonce'd script and valid JavaScript", async () => {
    const res = await fetch(`${base}/`);
    const html = await res.text();
    expect(html).toContain("Papercliped, not Paperclipped.");
    const nonce = /script-src 'nonce-([^']+)'/.exec(res.headers.get("content-security-policy")!)![1];
    const m = /<script nonce="([^"]+)">([\s\S]*?)<\/script>/.exec(html)!;
    expect(m[1]).toBe(nonce);
    expect(() => new Function(m[2])).not.toThrow();
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(html).toContain('id="mascot"');
    expect(html).toContain("Try the permissions");
    expect(html).toContain('rel="icon"');
    const again = await (await fetch(`${base}/`)).text();
    expect(/<script nonce="([^"]+)">/.exec(again)![1]).not.toBe(nonce); // a fresh nonce each time
  });
  it("shows only aggregate numbers, and serves the favicon", async () => {
    expect(await (await fetch(`${base}/api/public/stats`)).json()).toEqual({ users: 42, connections: 7 });
    for (const p of ["/favicon.svg", "/favicon.ico"]) {
      const r = await fetch(`${base}${p}`);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toBe("image/svg+xml");
      expect(await r.text()).toMatch(/^<svg /);
    }
  });
  it("documents the signup process and the connection manager", async () => {
    const su = await (await fetch(`${base}/docs/signup`)).text();
    expect(su).toContain("Create your account");
    expect(su).toContain("secret key");
    expect(su).toContain("6 to 32 characters");
    expect(await (await fetch(`${base}/docs/manage`)).text()).toContain("Manage connections");
  });
  it("only answers GET/HEAD for its own paths", async () => {
    expect((await fetch(`${base}/privacy`, { method: "POST" })).status).toBe(404);
    expect((await fetch(`${base}/docs/nope`)).status).toBe(404);
    expect((await fetch(`${base}/mcp`)).status).toBe(404);
  });
});
