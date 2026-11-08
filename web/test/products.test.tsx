import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, ROUTES } from "../src/App";
import { MENUS } from "../src/components/Layout";
import { PRODUCTS, STATUS } from "../src/content/products";

const at = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
afterEach(() => vi.unstubAllGlobals());
vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

/** Evidence-based status per product (2026-11-08; Console moves to live only on owner confirmation of a verified sign-in). Change this table only with new evidence. */
const EXPECTED = { console: "early", connect: "early", epaperclip: "soon", pin: "soon" } as const;

describe("product pages", () => {
  it("lists every product route and keeps the old ones", () => {
    for (const r of ["/", "/status", "/changelog", "/community", "/brand", "/prompts", "/products", "/console", "/connect", "/epaperclip", "/pin"]) expect(ROUTES).toContain(r);
  });
  for (const p of PRODUCTS) {
    it(`${p.name}: one h1, the honest status, and the sections`, () => {
      at(p.to);
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(p.name);
      expect(p.status).toBe(EXPECTED[p.id]);
      expect(screen.getAllByText(STATUS[p.status].label).length).toBeGreaterThan(0);
      for (const h of ["Who it is for", "How to get started", "What runs where", "Privacy and security", "How the products fit together"]) expect(screen.getByRole("heading", { name: h })).toBeInTheDocument();
      for (const img of screen.getAllByRole("img")) expect(img.getAttribute("alt")).toBeTruthy();
    });
    it(`${p.name}: sets title, description and canonical`, () => {
      at(p.to);
      expect(document.title).toContain(p.name);
      expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(`https://papercliped.co${p.to}`);
    });
  }
  it("makes no availability claim for products that are not released", () => {
    for (const p of PRODUCTS.filter((x) => x.status === "soon")) {
      const { container, unmount } = at(p.to);
      const text = container.textContent ?? "";
      expect(text).not.toMatch(/apt install|npm i(nstall)? |npx |curl -|download now|get\.sh|\$\d|per month/i);
      expect(text).toMatch(/not (been )?released|not available yet|Not released/i);
      unmount();
    }
  });
  it("shows no price anywhere on the Connect page", () => {
    const { container } = at("/connect");
    expect(container.textContent).not.toMatch(/\$\s?\d|US\$|per month|\/mo\b/i);
  });
  it("every screenshot and asset exists", () => {
    for (const p of PRODUCTS) for (const s of p.shots) for (const f of [s.light, s.dark].filter(Boolean) as string[]) expect(existsSync(resolve(__dirname, "../public" + f)), f).toBe(true);
    expect(existsSync(resolve(__dirname, "../public/products/pin-orb.svg"))).toBe(true);
  });
  it("uses the Pin orb on the Pin page only", () => {
    for (const p of PRODUCTS) {
      const { container, unmount } = at(p.to);
      expect(container.querySelectorAll('img[src*="pin-orb"]').length).toBe(p.id === "pin" ? 1 : 0);
      unmount();
    }
  });
  it("the products overview and home introduce all four, with status", () => {
    const { unmount } = at("/products");
    for (const p of PRODUCTS) expect(screen.getByRole("heading", { level: 3, name: p.name })).toBeInTheDocument();
    unmount();
    at("/");
    for (const p of PRODUCTS) expect(screen.getAllByRole("heading", { level: 3, name: p.name }).length).toBe(1);
  });
});

describe("header and footer", () => {
  it("the Product menu keeps the old four and adds the new four, with accurate labels", () => {
    const titles = MENUS[0].items.map((i) => i.title);
    expect(titles).toEqual(["Overview", "Console", "Connect", "ePaperclip", "Pin", "Get started", "Paperclip plugin", "Status"]);
    expect(MENUS[0].items.find((i) => i.title === "Connect")?.badge).toBe("Early access");
    expect(MENUS[0].items.find((i) => i.title === "Pin")?.badge).toBe("Coming soon");
  });
  it("links Sign in and the account hub to auth.papercliped.co, and the footer lists the products", () => {
    at("/");
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("https://auth.papercliped.co");
    expect(hrefs).toContain("https://auth.papercliped.co/account");
    const footer = screen.getByRole("contentinfo");
    for (const l of ["Console", "Connect", "ePaperclip", "Pin"]) expect(within(footer).getByRole("link", { name: l })).toBeInTheDocument();
  });
});
