import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import docs from "virtual:docs";
import { App } from "../src/App";
import { DOC_ORDER } from "../src/content/docs-nav";
import { search } from "../src/lib/docs";
import { resetRepoCache } from "../src/lib/useRepo";

const at = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
const files = readdirSync(resolve(process.cwd(), "../site/docs")).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));
beforeEach(() => {
  resetRepoCache();
  vi.stubGlobal("fetch", vi.fn(async (u: string) => ({ ok: true, json: async () => (u.includes("/v1/repo") ? { stars: 1234 } : { users: 1, connections: 1 }) })));
});
afterEach(() => vi.unstubAllGlobals());

describe("docs content", () => {
  it("every page in site/docs is in the navigation exactly once, and nothing else is", () => {
    expect([...DOC_ORDER].sort()).toEqual([...files].sort());
    expect(new Set(DOC_ORDER).size).toBe(DOC_ORDER.length);
  });
  it("every page has a title, headings with unique ids, and no unfilled placeholders", () => {
    for (const d of docs) {
      expect(d.title.length, d.slug).toBeGreaterThan(2);
      expect(d.html, d.slug).not.toMatch(/\{\{[A-Z]+\}\}/); // our placeholders; Railway's ${{Service.VAR}} syntax is real content
      expect(new Set(d.headings.map((h) => h.id)).size, d.slug).toBe(d.headings.length);
    }
  });
  it("every internal link points at a docs page or a page the site or bridge serves", () => {
    const ok = new Set([...DOC_ORDER.map((s) => `/docs/${s}`), "/docs", "/", "/changelog", "/prompts", "/community", "/brand", "/status", "/privacy", "/terms", "/manage"]);
    for (const d of docs) for (const m of d.html.matchAll(/href="(\/[^"#]*)(#[^"]*)?"/g)) expect(ok.has(m[1]), `${d.slug} → ${m[1]}`).toBe(true);
  });
  it("search finds pages by title, heading and text", () => {
    expect(search("permissions")[0].doc.slug).toBe("permissions");
    expect(search("rate limits").map((h) => h.doc.slug)).toContain("limits-and-errors");
    expect(search("BRIDGE_SECRET").map((h) => h.doc.slug)).toContain("environment");
    expect(search("zzzz nothing")).toEqual([]);
    expect(search("secret key")[0]).toMatchObject({ doc: { slug: "faq" }, heading: { text: "I lost my secret key." } });
  });
});

describe("docs pages", () => {
  it("the docs landing has search, the start-here cards and every section with counts", () => {
    at("/docs");
    expect(screen.getByRole("heading", { level: 1, name: "Papercliped docs" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Search the docs/ })).toBeInTheDocument();
    const start = screen.getByRole("heading", { name: "Start here" }).parentElement!;
    expect(within(start).getAllByRole("link")).toHaveLength(4);
    expect(screen.getByRole("heading", { name: /Reference \(7\)/ })).toBeInTheDocument();
  });
  it("a topic page has breadcrumb, title, contents, edit link and prev/next", () => {
    at("/docs/permissions");
    expect(screen.getByRole("heading", { level: 1, name: "Permissions" })).toBeInTheDocument();
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumbs).getByText("Guides")).toBeInTheDocument();
    expect(screen.getAllByRole("navigation", { name: "On this page" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Edit this page on GitHub" })).toHaveAttribute("href", "https://github.com/OpenSourcx/papercliped/edit/main/site/docs/permissions.md");
    const pn = screen.getByRole("navigation", { name: "Previous and next" });
    expect(within(pn).getByText("Prompt gallery")).toBeInTheDocument(); // previous in the nav order
    expect(within(pn).getByText("The control room")).toBeInTheDocument(); // next
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
  });
  it("the tool reference lists every tool", () => {
    at("/docs/tools");
    expect(screen.getByRole("heading", { level: 1, name: "Tool reference" })).toBeInTheDocument();
    expect(screen.getByText("paperclip_pause_agent")).toBeInTheDocument();
  });
  it("unknown topics show not found", () => {
    at("/docs/nope");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Page not found");
  });
  it("Ctrl+K opens search; Enter goes to the result", async () => {
    at("/docs");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const box = await screen.findByRole("combobox", { name: "Search the docs" });
    await userEvent.type(box, "anonymous");
    expect(within(screen.getByRole("listbox", { name: "Results" })).getAllByRole("option")[0]).toHaveTextContent("Anonymous mode");
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("heading", { level: 1, name: "Anonymous mode" })).toBeInTheDocument();
  });
  it("the header shows the GitHub star count from the bridge", async () => {
    at("/docs");
    expect((await screen.findAllByRole("link", { name: "Star Papercliped on GitHub, 1234 stars" })).length).toBeGreaterThan(0);
    expect(screen.getAllByText("1.2k").length).toBeGreaterThan(0);
  });
});

describe("docs layout", () => {
  it("has the docs header, grouped sidebar and a copy-link menu", async () => {
    render(<MemoryRouter initialEntries={["/docs/permissions"]}><App /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "papercliped docs home" })).toBeInTheDocument();
    const side = screen.getAllByRole("navigation", { name: "Docs" })[0];
    for (const g of ["Learn", "Reference", "Project"]) expect(within(side).getAllByText(g).length).toBeGreaterThan(0);
    expect(within(side).getByRole("link", { name: "All docs" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "More page options" }));
    expect(screen.getByRole("menuitem", { name: /View the Markdown source/ })).toHaveAttribute("href", "https://github.com/OpenSourcx/papercliped/blob/main/site/docs/permissions.md");
  });
  it("the site header has no light/dark switch", () => {
    render(<MemoryRouter initialEntries={["/"]}><App /></MemoryRouter>);
    expect(screen.queryByRole("radio", { name: /dark|light|system/i })).toBeNull();
    expect(screen.getAllByRole("link", { name: "Get started" }).length).toBeGreaterThan(0);
  });
});
