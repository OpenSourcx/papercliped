import { build } from "esbuild";
import type { Plugin } from "vite";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const SITE_URL = "https://papercliped.co";

const VIRTUAL = "virtual:themes.css";
const RESOLVED = "\0virtual:themes.css";
const DOCS = "virtual:docs";
const DOCS_RESOLVED = "\0virtual:docs";
const BOOT = "theme-boot.js";

// The same CSP the bridge sends for these pages, so `vite preview` (and the route check) enforce exactly that.
export { SITE_CSP } from "../../src/web/csp.ts";

async function bootScript(root: string): Promise<string> {
  const r = await build({ entryPoints: [resolve(root, "src/theme/boot.ts")], bundle: true, write: false, format: "iife", minify: true, target: "es2019" });
  return r.outputFiles[0].text;
}

/** Compile one of the site's TS modules on the fly (the config runs in plain Node) and import it. */
async function compile(root: string, file: string) {
  const r = await build({ entryPoints: [resolve(root, file)], bundle: true, write: false, format: "esm", platform: "node", loader: { ".json": "json" } });
  return import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString("base64")}`);
}
/** Every site/docs/*.md rendered for the docs app; last-updated dates come from git when the history is available. */
async function buildDocs(root: string, watch: (f: string) => void) {
  const lib = await compile(root, "src/lib/docsBuild.ts");
  const dir = resolve(root, "../site/docs");
  // In a shallow clone (CI, most deploys) every file would show the latest commit's date, which would be wrong: show none.
  let gitOk = false;
  try {
    gitOk = execFileSync("git", ["rev-parse", "--is-shallow-repository"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() === "false";
  } catch {
    /* not a git checkout */
  }
  return readdirSync(dir).filter((f) => f.endsWith(".md")).sort().map((f) => {
    const file = resolve(dir, f);
    watch(file);
    let updated: string | null = null;
    if (gitOk) try {
      updated = execFileSync("git", ["log", "-1", "--format=%cs", "--", file], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
    } catch {
      /* no git (e.g. a Docker build): no date */
    }
    return lib.buildDoc(f.replace(/\.md$/, ""), readFileSync(file, "utf8"), updated);
  });
}

async function themeStylesheet(root: string): Promise<string> {
  return (await compile(root, "src/theme/css.ts")).themeCss();
}

export function papercliped(): Plugin {
  let root = process.cwd();
  return {
    name: "papercliped",
    configResolved(c) {
      root = c.root;
    },
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : id === DOCS ? DOCS_RESOLVED : null;
    },
    async load(id) {
      if (id === DOCS_RESOLVED) return `export default ${JSON.stringify(await buildDocs(root, (f) => this.addWatchFile(f)))};`;
      if (id !== RESOLVED) return null;
      for (const f of ["css.ts", "palettes.ts"]) this.addWatchFile(resolve(root, "src/theme", f));
      return themeStylesheet(root);
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== `/${BOOT}`) return next();
        res.setHeader("Content-Type", "text/javascript");
        res.end(await bootScript(root));
      });
    },
    async generateBundle() {
      this.emitFile({ type: "asset", fileName: BOOT, source: await bootScript(root) });
      // Changelog feed, sitemap and robots.txt, all generated from the repo at build time.
      const lib = await compile(root, "src/lib/changelog.ts");
      const md = readFileSync(resolve(root, "../CHANGELOG.md"), "utf8");
      const dates = JSON.parse(readFileSync(resolve(root, "src/content/release-dates.json"), "utf8"));
      this.emitFile({ type: "asset", fileName: "changelog.xml", source: lib.atomFeed(lib.parseChangelog(md, dates), SITE_URL) });
      const routes: string[] = JSON.parse(/ROUTES = (\[[^\]]*\])/.exec(readFileSync(resolve(root, "src/App.tsx"), "utf8"))![1]).filter((r: string) => !r.startsWith("/kit"));
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map((r) => `  <url><loc>${SITE_URL}${r}</loc></url>`).join("\n")}\n</urlset>\n` });
      // Every public path the app renders (the design kit is dev-only, so a 404 in production), for the bridge: anything else gets the app's not-found page with a real 404 status.
      const docs = readdirSync(resolve(root, "../site/docs")).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));
      const all = [...JSON.parse(/ROUTES = (\[[^\]]*\])/.exec(readFileSync(resolve(root, "src/App.tsx"), "utf8"))![1]).filter((r: string) => !r.startsWith("/kit")), ...docs.map((d) => `/docs/${d}`)];
      this.emitFile({ type: "asset", fileName: "routes.json", source: JSON.stringify([...new Set(all)].sort()) + "\n" });
      this.emitFile({ type: "asset", fileName: "robots.txt", source: `User-agent: *\nAllow: /\nDisallow: /kit\nDisallow: /__render\nSitemap: ${SITE_URL}/sitemap.xml\n` });
    },
  };
}
