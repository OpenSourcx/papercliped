import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The bridge calls a Paperclip it does not ship. fixtures/paperclip-routes.json is the route list of a real Paperclip
// (scripts/paperclip-routes.mjs, docs/UPGRADING.md); every call written in src/ must be a route that exists there, with that method.
const fx = JSON.parse(readFileSync(new URL("./fixtures/paperclip-routes.json", import.meta.url), "utf8")) as { paperclip: string; routes: Record<string, string[]> };
const SRC = new URL("../src/", import.meta.url).pathname;
const files = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? files(join(d, f)) : f.endsWith(".ts") ? [join(d, f)] : []));
const DECISIONS = ["approve", "reject", "request-revision"]; // paperclip_decide_approval's enum

type Call = { method: string; path: string; where: string };
function calls(): Call[] {
  const out: Call[] = [];
  for (const f of files(SRC)) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(/\b(?:c|client)\.(get|post|put|patch|delete)(?:<[^>(]*>)?\(\s*(?:`([^`]*)`|"([^"]*)")/g)) {
      const raw = (m[2] ?? m[3]) as string;
      if (!raw.startsWith("/")) continue;
      // ${expr} is one path segment; the decision segment is the one place it is an enum.
      const path = raw.replace(/\/\$\{i\.decision\}/, "/@decision@").replace(/\$\{[^}]*\}/g, "{}").split("?")[0] as string;
      for (const p of path.includes("@decision@") ? DECISIONS.map((d) => path.replace("@decision@", d)) : [path]) {
        out.push({ method: (m[1] as string).toLowerCase(), path: `/api${p}`, where: `${f.slice(SRC.length)}: ${m[1]!.toUpperCase()} ${raw}` });
      }
    }
  }
  return out;
}

describe("the bridge against a real Paperclip's routes", () => {
  const all = calls();

  it("finds the bridge's calls (so the scan itself can't silently go blind)", () => {
    expect(all.length).toBeGreaterThan(25);
    expect(all.map((c) => c.path)).toContain("/api/agents/{}/wakeup");
  });

  it(`only calls routes that exist in Paperclip ${fx.paperclip}, with a method they serve`, () => {
    const missing = all.filter((c) => !fx.routes[c.path]?.includes(c.method)).map((c) => `${c.where}  ->  ${c.method.toUpperCase()} ${c.path}`);
    expect(missing).toEqual([]);
  });

  it("wakes an agent on /wakeup, not the legacy /heartbeat/invoke alias", () => {
    expect(all.some((c) => c.path.endsWith("/heartbeat/invoke"))).toBe(false);
  });

  it("uses the board-key and login routes Paperclip serves (cli-auth, board-api-keys, plugins)", () => {
    const login = readFileSync(join(SRC, "oauth/paperclip-login.ts"), "utf8");
    const used = [...login.matchAll(/\$\{this\.t\.apiUrl\}(\/[a-z-]+(?:\/\$\{[^}]*\}|\/revoke-current)?(?:\/[a-z-]+)?)/g)].map((m) => `/api${(m[1] as string).replace(/\$\{[^}]*\}/g, "{}")}`);
    expect(used.length).toBeGreaterThan(5);
    for (const p of used) expect(fx.routes[p], p).toBeDefined();
  });
});
