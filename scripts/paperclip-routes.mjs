// Writes test/fixtures/paperclip-routes.json: every route (path + methods) of a real Paperclip, the contract test/paperclip-contract.test.ts
// checks the bridge's calls against. Run it against a throwaway instance of the version being certified (docs/UPGRADING.md):
//   node scripts/paperclip-routes.mjs http://127.0.0.1:3100 2026.1023.0
import { writeFileSync } from "node:fs";
const [url, version] = process.argv.slice(2);
if (!url || !/^\d{4}\.\d{3,4}\.\d+$/.test(version ?? "")) { console.error("usage: node scripts/paperclip-routes.mjs <paperclip url> <paperclip version, e.g. 2026.1023.0>"); process.exit(2); }
const spec = await (await fetch(new URL("/api/openapi.json", url))).json();
const routes = {};
for (const [p, v] of Object.entries(spec.paths ?? {})) routes[p.replace(/\{[^}]*\}/g, "{}")] = Object.keys(v).filter((m) => ["get", "post", "put", "patch", "delete"].includes(m)).sort();
if (Object.keys(routes).length < 100) { console.error("that does not look like Paperclip's OpenAPI document"); process.exit(1); }
writeFileSync(new URL("../test/fixtures/paperclip-routes.json", import.meta.url), JSON.stringify({ paperclip: version, routes }, null, 0) + "\n");
console.log(`${Object.keys(routes).length} routes for Paperclip ${version}`);
