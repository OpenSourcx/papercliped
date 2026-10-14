// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import dates from "../src/content/release-dates.json";
import { atomFeed, kindOf, parseChangelog } from "../src/lib/changelog";

const md = readFileSync(new URL("../../CHANGELOG.md", import.meta.url), "utf8");

describe("changelog", () => {
  const rel = parseChangelog(md, dates as Record<string, string>);
  it("parses every release in CHANGELOG.md, newest first", () => {
    const versions = rel.map((r) => r.version);
    for (const v of ["v2.0.0", "v1.2.0-beta.1", "v1.1.0-beta.2", "v1.0.0-beta.1"]) expect(versions).toContain(v);
    expect(versions.indexOf("v2.0.0")).toBeLessThan(versions.indexOf("v1.0.0-beta.1"));
    expect(rel.find((r) => r.version === "v2.0.0")!.entries.length).toBeGreaterThan(3);
  });
  it("every released version has a date from git, and none is invented", () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const r of rel.filter((x) => !x.unreleased)) {
      const d = (dates as Record<string, string>)[r.version];
      expect(d, r.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d >= "2026-10-05" && d <= today, `${r.version} dated ${d}: must be between the first release and today`).toBe(true);
    }
  });
  it("classifies entries", () => {
    expect(kindOf("Fixed: the install command")).toBe("fixed");
    expect(kindOf("**New home: `https://papercliped.co`.** Every reference")).toBe("new");
    expect(kindOf("Windows-friendly test suite")).toBe("improved");
  });
  it("builds a valid-looking Atom feed without Unreleased", () => {
    const feed = atomFeed(rel, "https://papercliped.co");
    expect(feed).toMatch(/^<\?xml/);
    expect(feed).toContain("<id>https://papercliped.co/changelog#v2-0-0</id>");
    expect(feed).not.toContain("Unreleased");
    expect(feed).not.toMatch(/<(script|a )/);
  });
});

describe("empty Unreleased", () => {
  it("is hidden right after a release", () => {
    const r = parseChangelog("# Changelog\n\n## Unreleased\n\n## v2.1.1 — Fix\n\n- **Fixed:** a thing.\n", {});
    expect(r.map((x) => x.version)).toEqual(["v2.1.1"]);
  });
});
