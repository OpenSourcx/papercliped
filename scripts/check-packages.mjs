// Packs both npm packages and installs them the way a user would, so publishing problems show up in CI, not on release day.
// Run after `npm run build` and `npm --prefix plugin run build`:  node scripts/check-packages.mjs
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const out = mkdtempSync(join(tmpdir(), "papercliped-pack-"));
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], shell: process.platform === "win32" });
const fail = (msg) => { console.error(`check-packages: ${msg}`); process.exit(1); };

function pack(dir, mustHave) {
  // npm 10/11 print a list of packed packages; npm 12 prints an object keyed by package name.
  const parsed = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", out], dir));
  const info = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
  const files = new Set(info.files.map((f) => f.path));
  for (const f of mustHave) if (!files.has(f)) fail(`${info.name}@${info.version} is missing ${f}`);
  for (const f of files) if (/(^|\/)(\.env|.*\.pem|.*\.key)$/.test(f) || f.startsWith("test/") || f.startsWith("node_modules/") || f.startsWith("dist/panel/") || f.startsWith("web/")) fail(`${info.name} would publish ${f}`);
  console.log(`packed ${info.name}@${info.version}: ${files.size} files, ${(info.size / 1024).toFixed(0)} kB`);
  return join(out, info.filename);
}

const rootTgz = pack(root, ["package.json", "README.md", "LICENSE", "dist/stdio.js", "dist/http.js", "dist/cli.js", "migrations/001_init.sql", "site/docs/getting-started.md", ".claude-plugin/plugin.json", ".mcp.json"]);
const pluginTgz = pack(join(root, "plugin"), ["package.json", "README.md", "dist/manifest.js", "dist/worker.js", "dist/ui/index.js"]);

// Install both into a scratch project, as a user would.
const app = join(out, "app");
run("mkdir", ["-p", app], out);
writeFileSync(join(app, "package.json"), JSON.stringify({ name: "pack-smoke", private: true, type: "module" }));
run("npm", ["install", "--no-audit", "--no-fund", "--omit=dev", rootTgz, pluginTgz], app);

// The bridge package: its OpenAPI generator runs without a Paperclip and lists the tools.
const spec = JSON.parse(run("node", [join(app, "node_modules/papercliped/dist/openapi-cli.js")], app));
if (!spec.openapi || Object.keys(spec.paths ?? {}).length < 10) fail("papercliped openapi output looks wrong");
for (const bin of ["papercliped", "papercliped-bridge", "papercliped-admin"]) if (!existsSync(join(app, "node_modules/.bin", bin)) && !existsSync(join(app, "node_modules/.bin", `${bin}.cmd`))) fail(`bin ${bin} was not installed`);

// The Paperclip plugin: its manifest loads and every entrypoint it names exists in the installed package.
const pdir = join(app, "node_modules/papercliped-paperclip-plugin");
const { default: manifest } = await import(pathToFileURL(join(pdir, "dist/manifest.js")).href);
if (manifest.id !== "papercliped.remote-control" || manifest.apiVersion !== 1) fail("plugin manifest looks wrong");
for (const p of [manifest.entrypoints.worker, join(manifest.entrypoints.ui, "index.js")]) if (!existsSync(join(pdir, p))) fail(`plugin entrypoint ${p} is missing`);

console.log("check-packages: both packages pack and install cleanly");
