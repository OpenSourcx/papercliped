import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SITE_CSP } from "../src/web/csp.js";
import { parseHosts, roleOf } from "../src/web/hosts.js";
import { WebAppRoutes } from "../src/web/routes.js";

let dir: string, srv: Server, base: string, single: Server, singleBase: string;
const HOSTS = "marketing=papercliped.co,www.papercliped.co;docs=docs.papercliped.co;api=mcp.papercliped.co,api.papercliped.co;forum=forum.papercliped.co";
/** fetch() can't set Host, so use http.request; returns a small fetch-like response. */
function get(b: string, path: string, host?: string, method = "GET"): Promise<{ status: number; headers: { get(k: string): string | null }; text(): Promise<string> }> {
  const u = new URL(b);
  return new Promise((ok, fail) => {
    const req = request({ host: u.hostname, port: u.port, path, method, headers: host ? { host } : {} }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => ok({ status: res.statusCode!, headers: { get: (k) => { const v = res.headers[k.toLowerCase()]; return v == null ? null : String(v); } }, text: async () => body }));
    });
    req.on("error", fail);
    req.end();
  });
}

function serve(web: WebAppRoutes) {
  return createServer(async (req, res) => {
    if (!(await web.handle(req, res, new URL(req.url!, "http://x")))) res.writeHead(418).end("bridge"); // stands for the rest of the bridge
  });
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "pcl-web-"));
  mkdirSync(join(dir, "assets"));
  mkdirSync(join(dir, "fonts"));
  writeFileSync(join(dir, "index.html"), '<!doctype html><html><head><title>Papercliped</title><meta name="description" content="x" /><meta property="og:title" content="x" /><meta property="og:description" content="x" /><meta property="og:url" content="https://papercliped.co/" /><meta name="pcl-hosts" content="{}" /></head><body><div id="root"></div></body></html>');
  writeFileSync(join(dir, "routes.json"), JSON.stringify(["/", "/community", "/changelog", "/status", "/docs", "/docs/faq"]));
  writeFileSync(join(dir, "assets", "index-abc.js"), "console.log(1)");
  writeFileSync(join(dir, "fonts", "inter.woff2"), "x");
  writeFileSync(join(dir, "changelog.xml"), "<feed/>");
  writeFileSync(join(dir, "..", "secret.txt"), "nope");
  srv = serve(new WebAppRoutes({ dir, hosts: parseHosts(HOSTS), forumUrl: "https://github.com/OpenSourcx/papercliped/discussions" }));
  single = serve(new WebAppRoutes({ dir, hosts: parseHosts("") }));
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  await new Promise<void>((r) => single.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  singleBase = `http://127.0.0.1:${(single.address() as AddressInfo).port}`;
});
afterAll(() => {
  srv.close();
  single.close();
});

describe("PUBLIC_HOSTS", () => {
  it("parses roles and rejects bad input", () => {
    const m = parseHosts(HOSTS);
    expect(m.marketing).toEqual(["papercliped.co", "www.papercliped.co"]);
    expect(roleOf(m, "API.papercliped.co")).toBe("api");
    expect(roleOf(m, "papercliped.onrender.com")).toBeNull();
    expect(() => parseHosts("blog=x.co")).toThrow(/unknown role/);
    expect(() => parseHosts("docs=not a host")).toThrow(/not a host/);
    expect(() => parseHosts("docs=a.co;marketing=a.co")).toThrow(/twice/);
  });
});

describe("website routing", () => {
  it("marketing: pages with the strict CSP and the host map; docs move to the docs host", async () => {
    const r = await get(base, "/community", "papercliped.co");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-security-policy")).toBe(SITE_CSP);
    expect(await r.text()).toContain('content="{&quot;marketing&quot;:&quot;papercliped.co&quot;,&quot;docs&quot;:&quot;docs.papercliped.co&quot;}"');
    const d = await get(base, "/docs/faq?x=1", "papercliped.co");
    expect([d.status, d.headers.get("location")]).toEqual([301, "https://docs.papercliped.co/faq?x=1"]);
    expect((await get(base, "/docs", "papercliped.co")).headers.get("location")).toBe("https://docs.papercliped.co/");
    expect((await get(base, "/topics/faq", "papercliped.co")).headers.get("location")).toBe("https://docs.papercliped.co/faq");
  });
  it("serves per-route title, description and canonical (ERR-WEB-001)", async () => {
    const t = await (await get(base, "/community", "papercliped.co")).text();
    expect(t).toContain("<title>Community · Papercliped</title>");
    expect(t).toMatch(/<link rel="canonical" href="https:\/\/papercliped\.co\/community" \/>/);
    expect(t).not.toContain("not Paperclipped");
    const d = await (await get(base, "/faq", "docs.papercliped.co")).text();
    expect(d).toMatch(/rel="canonical" href="https:\/\/docs\.papercliped\.co\/faq"/);
  });
  it("sends HSTS (one year, no subdomains or preload) and a Permissions-Policy (ERR-WEB-004)", async () => {
    const r = await get(base, "/community", "papercliped.co");
    expect(r.headers.get("strict-transport-security")).toBe("max-age=31536000");
    expect(r.headers.get("permissions-policy")).toContain("camera=()");
  });
  it("the design kit is not served in production (ERR-WEB-002)", async () => {
    expect((await get(base, "/kit", "papercliped.co")).status).toBe(404);
  });
  it("www redirects to the apex, keeping the path and query", async () => {
    const r = await get(base, "/changelog?a=b", "www.papercliped.co");
    expect([r.status, r.headers.get("location")]).toEqual([301, "https://papercliped.co/changelog?a=b"]);
  });
  it("docs host: the landing at /, each page at /<page>; old /docs and /topics links redirect; other pages go to the marketing host", async () => {
    const home = await get(base, "/", "docs.papercliped.co");
    expect(home.status).toBe(200);
    expect(home.headers.get("content-security-policy")).toBe(SITE_CSP);
    expect((await get(base, "/faq", "docs.papercliped.co")).status).toBe(200);
    expect((await get(base, "/faq/", "docs.papercliped.co")).status).toBe(200);
    expect((await get(base, "/docs/faq?x=1", "docs.papercliped.co")).headers.get("location")).toBe("/faq?x=1");
    expect((await get(base, "/topics/faq", "docs.papercliped.co")).headers.get("location")).toBe("/faq");
    expect((await get(base, "/topics", "docs.papercliped.co")).headers.get("location")).toBe("/");
    expect((await get(base, "/docs", "docs.papercliped.co")).headers.get("location")).toBe("/");
    expect((await get(base, "/not-a-page", "docs.papercliped.co")).status).toBe(404);
    expect((await get(base, "/assets/index-abc.js", "docs.papercliped.co")).status).toBe(200);
    expect((await get(base, "/community", "docs.papercliped.co")).headers.get("location")).toBe("https://papercliped.co/community");
  });
  it("api and forum hosts", async () => {
    const a = await get(base, "/", "mcp.papercliped.co");
    expect([a.status, a.headers.get("location")]).toEqual([302, "https://papercliped.co/"]);
    expect((await get(base, "/mcp", "mcp.papercliped.co")).status).toBe(418); // protocol endpoints are the bridge's
    const f = await get(base, "/anything", "forum.papercliped.co");
    expect([f.status, f.headers.get("location")]).toEqual([302, "https://github.com/OpenSourcx/papercliped/discussions"]);
  });
  it("never touches protocol, API or bridge paths, on any host", async () => {
    for (const p of ["/mcp", "/authorize", "/authorize/status", "/token", "/register", "/revoke", "/.well-known/oauth-authorization-server", "/openapi.json", "/actions/paperclip_list_agents", "/api/public/v1/status", "/api/manage/me", "/manage", "/healthz", "/readyz"])
      for (const host of ["papercliped.co", "docs.papercliped.co", "papercliped.onrender.com"]) expect((await get(base, p, host)).status, `${host}${p}`).toBe(418);
    expect((await get(base, "/community", "papercliped.co", "POST")).status).toBe(418);
  });
  it("static files: hashed assets cached forever, others an hour; missing files fall through", async () => {
    const js = await get(base, "/assets/index-abc.js", "papercliped.co");
    expect([js.status, js.headers.get("content-type"), js.headers.get("cache-control")]).toEqual([200, "text/javascript; charset=utf-8", "public, max-age=31536000, immutable"]);
    expect((await get(base, "/fonts/inter.woff2", "papercliped.co")).headers.get("content-type")).toBe("font/woff2");
    const x = await get(base, "/changelog.xml", "papercliped.co");
    expect([x.status, x.headers.get("cache-control")]).toEqual([200, "public, max-age=3600"]);
    expect((await get(base, "/assets/missing.js", "papercliped.co")).status).toBe(418);
    const internal = await get(base, "/routes.json", "papercliped.co");
    expect(internal.status).toBe(418); // never served; the bridge answers 404
    expect(await internal.text()).not.toContain("/community");
  });
  it("unknown pages get the app's not-found page with a real 404", async () => {
    const r = await get(base, "/nope", "papercliped.co");
    expect(r.status).toBe(404);
    expect(await r.text()).toContain('<div id="root">');
  });
  it("refuses path traversal", async () => {
    for (const p of ["/../secret.txt", "/%2e%2e/secret.txt", "/assets/..%2f..%2fsecret.txt", "/%2e%2e%2fsecret.txt"]) {
      const r = await get(base, p, "papercliped.co");
      expect(await r.text(), p).not.toContain("nope");
    }
  });
  it("without PUBLIC_HOSTS the whole site is on one host, with /docs paths", async () => {
    expect((await get(singleBase, "/docs/faq")).status).toBe(200);
    expect((await get(singleBase, "/topics/faq")).headers.get("location")).toBe("/docs/faq");
    expect(await (await get(singleBase, "/")).text()).toContain('content="{}"');
  });
  it("HEAD works without a body", async () => {
    const r = await get(base, "/community", "papercliped.co", "HEAD");
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("");
  });
});
