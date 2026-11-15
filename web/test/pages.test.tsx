import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import tools from "../src/generated/tools.json";
import gallery from "../src/content/prompts.json";
import { levelOf, type Prompt } from "../src/pages/Prompts";

const at = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
afterEach(() => vi.unstubAllGlobals());

describe("ePaperclip install section", () => {
  it("tells people how to install it on the page, not by sending them to GitHub", async () => {
    at("/epaperclip");
    const main = screen.getByRole("main");
    const install = main.querySelector("#install") as HTMLElement;
    expect(install).not.toBeNull();
    expect(within(install).getByRole("heading", { level: 2, name: /Get ePaperclip running/ })).toBeInTheDocument();
    for (const t of ["apt (recommended)", "npm", "One command", "Add a worker machine"]) expect(within(install).getByRole("tab", { name: t })).toBeInTheDocument();
    expect(install.textContent).toContain("apt install epaperclip");
    expect(install.textContent).toContain("2DC0 0D1A 1A87 1018 F797 E7CE F565 5E1B 9FA7 5813"); // the key fingerprint, to check before trusting the repository
    expect(install.textContent).toContain("epaperclip status");
    expect(within(install).getByText("What you need")).toBeInTheDocument();
    await userEvent.click(within(install).getByRole("tab", { name: "npm" }));
    expect(install.textContent).toContain("npx epaperclip install");
    expect(within(install).getByRole("link", { name: "full install guide" })).toHaveAttribute("href", expect.stringMatching(/\/docs\/install-epaperclip$/));
  });
  it("the page's links go to the install section, the docs and the source, never to GitHub guides", () => {
    at("/epaperclip");
    const main = screen.getByRole("main");
    expect(within(main).getAllByRole("link", { name: "Install" })[0]).toHaveAttribute("href", "#install");
    expect(within(main).getAllByRole("link", { name: /Docs|install guide/ })[0]).toHaveAttribute("href", expect.stringMatching(/\/docs\/install-epaperclip$/));
    expect(within(main).getByRole("link", { name: "Source" })).toHaveAttribute("href", "https://github.com/OpenSourcx/papercliped-engine");
    for (const a of within(main).getAllByRole("link")) expect(a.getAttribute("href") ?? "").not.toMatch(/github\.com\/OpenSourcx\/papercliped-engine\/blob/);
  });
});

describe("sign in", () => {
  it("the header links to the central account host on desktop and in the phone menu", async () => {
    at("/");
    const banner = screen.getByRole("banner");
    const link = within(banner).getByRole("link", { name: "Sign in" });
    expect(link).toHaveAttribute("href", "https://auth.papercliped.co/");
    expect(link.className).toContain("md:inline-flex"); // hidden only below md, where the menu button takes over
    await userEvent.click(within(banner).getByRole("button", { name: "Open menu" }));
    const inMenu = within(document.getElementById("mobile-nav")!).getByRole("link", { name: "Sign in" });
    expect(inMenu).toHaveAttribute("href", "https://auth.papercliped.co/");
  });
});

describe("home page", () => {
  it("says what ePaperclip is in one sentence, shows a real screenshot and gives the install command", () => {
    at("/");
    const main = screen.getByRole("main");
    expect(within(main).getByRole("heading", { level: 1 }).textContent).toBe("ePaperclip");
    expect(main.textContent).toContain("ePaperclip is a free, open-source web console you install on your Proxmox host: one place for your VMs, containers, storage and backups, with optional AI agents that run in their own containers.");
    const shot = within(main).getAllByRole("img", { name: /overview page/ })[0] as HTMLImageElement;
    expect(shot).toHaveAttribute("width", "1440"); expect(shot).toHaveAttribute("height", "900");
    expect(shot).toHaveAttribute("loading", "eager"); expect(shot).toHaveAttribute("fetchpriority", "high"); // the one above the fold
    expect(shot.closest("figure")!.textContent).toContain("Demo data");
    const install = main.querySelector("#install") as HTMLElement;
    expect(install.textContent).toContain("apt install epaperclip");
    expect(within(install).getByRole("link", { name: "install guide" })).toHaveAttribute("href", expect.stringMatching(/\/docs\/install-epaperclip$/));
  });
  it("states the three facts and links the source", () => {
    at("/");
    const main = screen.getByRole("main");
    expect(main.textContent).toContain("Open source, MIT");
    expect(main.textContent).toContain("never reimages or repartitions");
    expect(main.textContent).toContain("Proxmox keeps working on port 8006");
    expect(within(main).getByRole("link", { name: "Read the source" })).toHaveAttribute("href", "https://github.com/OpenSourcx/papercliped-engine");
  });
  it("shows only the first screenshot eagerly; the rest wait until they are near the screen", () => {
    at("/");
    const imgs = screen.getByRole("main").querySelectorAll("img");
    expect(imgs.length).toBeGreaterThanOrEqual(5);
    const eager = [...imgs].filter((i) => i.getAttribute("loading") === "eager");
    expect(eager).toHaveLength(1);
    for (const i of imgs) { expect(i.getAttribute("alt")).toBeTruthy(); expect(i.getAttribute("width")).toBeTruthy(); expect(i.getAttribute("height")).toBeTruthy(); }
  });
  it("lists the product family with a plain status for each, and marks Pin and Connect as not finished (ERR-WEB-003)", () => {
    at("/");
    const table = screen.getByRole("table", { name: "Papercliped products and their status" });
    const rows = within(table).getAllByRole("row").slice(1);
    const status = (name: string) => within(rows.find((r) => within(r).queryByRole("link", { name }))!).getAllByRole("cell").at(-1)!.textContent;
    expect(status("ePaperclip")).toBe("Available");
    expect(status("Pin")).toBe("Preview");
    expect(status("Papercliped MCP")).toBe("Available");
    expect(status("Papercliped Connect")).toBe("Preview");
    expect(status("PinOS")).toBe("Planned");
  });
  it("does not run the Pin demo on the home page", () => {
    at("/");
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.getByRole("main").textContent).not.toContain("Interactive demo");
  });
  it("uses no slogans, eyebrows or numbering as headings", () => {
    at("/");
    const text = screen.getByRole("main").textContent ?? "";
    for (const gone of ["The power of the Pin", "Four parts", "01 / 04", "THE SYSTEM", "Meet ePaperclip and Pin"]) expect(text).not.toContain(gone);
  });
});

describe("product routes", () => {
  for (const [path, heading] of [
    ["/epaperclip", "ePaperclip"],
    ["/pin", "Pin"],
    ["/papercliped", "Papercliped MCP"],
    ["/connect", "Papercliped Connect"],
    ["/roadmap", "What we're building"],
  ]) {
    it(`renders ${path} with one h1`, () => {
      at(path);
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
    });
  }
  it("/epaperclip reads like a README: status line, screenshot, install, what you get, how it works, trust, without AI", () => {
    at("/epaperclip");
    const main = screen.getByRole("main");
    expect(main.textContent).toContain("MIT licence · Free and open source");
    for (const h of ["What you get", "How it works", "What it runs as and what it can touch", "Without AI", "Requirements, updating and removing"]) expect(within(main).getByRole("heading", { level: 2, name: h })).toBeInTheDocument();
    expect(within(main).getByRole("img", { name: /How ePaperclip works/ })).toBeInTheDocument(); // the diagram
    expect(main.textContent).not.toMatch(/release-candidate/i);
  });
  it("the trust section answers the sceptic's questions with the facts the engine states", () => {
    at("/epaperclip");
    const trust = screen.getByRole("main").querySelector("#trust") as HTMLElement;
    for (const q of ["Is it installed as root?", "What does run as root?", "What can it do on Proxmox?", "What does the installer change, and never touch?", "Where do agents run?", "Are releases signed?", "How do I remove it?"]) expect(within(trust).getByText(q)).toBeInTheDocument();
    for (const fact of ["epaperclip-engine", "NoNewPrivileges", "ProtectSystem=strict", "port 8006", "unprivileged Proxmox containers", "host bind mounts", "2DC0 0D1A 1A87 1018 F797 E7CE F565 5E1B 9FA7 5813", "nested Proxmox VM"]) expect(trust.textContent).toContain(fact);
    expect(within(trust).getByRole("link", { name: "security page" })).toHaveAttribute("href", expect.stringMatching(/\/docs\/epaperclip-security$/));
  });
  it("Pin's demo is on /pin, labelled a scripted preview, with real interactions that do not pass for live host changes", async () => {
    at("/pin");
    const main = screen.getByRole("main");
    expect(main.textContent).toContain("A scripted preview");
    expect(main.textContent).toContain("Preview. Pin's automations and interface exist");
    const tabs = await within(main).findAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(main.textContent).toContain("Interactive demo");
    await userEvent.click(tabs[1]);
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    await userEvent.click(within(main).getByRole("button", { name: /agent mode/i }));
    expect(main.textContent).toContain("does not execute anything");
  });
  it("keeps the MCP permission playground available on the Papercliped page", async () => {
    at("/papercliped");
    const main = screen.getByRole("main");
    const read = tools.filter((t) => t.scope === "paperclip:read").length;
    expect(await within(main).findByText(/tools available at this level/)).toBeInTheDocument();
    expect(main.textContent).toContain(`${read} of ${tools.length}`);
    await userEvent.click(within(main).getByRole("radio", { name: /Full control/ }));
    expect(main.textContent).toContain(`${tools.length} of ${tools.length}`);
  });
  it("describes linking without claiming a finished service", () => {
    at("/connect");
    expect(screen.getByRole("heading", { name: "How linking works" })).toBeInTheDocument();
    expect(screen.getByRole("main").textContent).toContain("not yet offered as a finished public service");
  });
});

describe("roadmap", () => {
  it("lists every area with a status from the allowed set and a link for each row", () => {
    at("/roadmap");
    const main = screen.getByRole("main");
    const rows = main.querySelectorAll("tbody tr");
    expect(rows.length).toBeGreaterThan(15);
    for (const r of rows) {
      expect(["Available", "Preview", "In progress", "Planned"]).toContain(r.querySelectorAll("td")[0]!.textContent);
      expect(r.querySelector("a")!.getAttribute("href")).toBeTruthy();
    }
    expect(main.textContent).toContain("We don't give dates we haven't committed to.");
  });
  it("does not promise a forum that does not exist", () => {
    at("/roadmap");
    expect(screen.getByRole("main").textContent).toContain("Waiting for GitHub Discussions to be switched on.");
  });
});

describe("changelog page", () => {
  it("lists releases with dates and filters by kind", async () => {
    at("/changelog");
    expect(screen.getByRole("heading", { level: 1, name: "Changelog" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "v2.0.0" })).toBeInTheDocument();
    expect(screen.getAllByText("October 6, 2026").length).toBeGreaterThan(0);
    expect(screen.getByText("October 5, 2026")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Fixed" }));
    expect(screen.queryAllByText("New").filter((n) => n.tagName === "SPAN").length).toBe(0);
  });
});

describe("prompt gallery", () => {
  it("every prompt uses real tools, belongs to a category, and has a unique title", () => {
    const names = new Set(tools.map((t) => t.name));
    const cats = new Set(gallery.categories.map((c) => c.id));
    for (const p of gallery.prompts as Prompt[]) {
      expect(cats.has(p.category), p.title).toBe(true);
      expect(p.tools.length, p.title).toBeGreaterThan(0);
      for (const t of p.tools) expect(names.has(t), `${p.title} → ${t}`).toBe(true);
    }
    expect(new Set(gallery.prompts.map((p) => p.title)).size).toBe(gallery.prompts.length);
    for (const c of gallery.categories) expect(gallery.prompts.some((p) => p.category === c.id), c.id).toBe(true);
  });
  it("a prompt needs Full control only when one of its tools changes something", () => {
    expect(levelOf({ category: "x", title: "x", prompt: "x", tools: ["paperclip_report_costs"] })).toBe("Read only");
    expect(levelOf({ category: "x", title: "x", prompt: "x", tools: ["paperclip_list_agents", "paperclip_pause_agent"] })).toBe("Full control");
  });
  it("filters by category, level and search, and copies a prompt", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    at("/prompts");
    expect(screen.getByRole("heading", { level: 1, name: "Prompt gallery" })).toBeInTheDocument();
    expect(screen.getByText(`${gallery.prompts.length} prompts`)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Approvals" }));
    expect(screen.getByRole("heading", { level: 2, name: "Approvals" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Reports" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Read only" }));
    expect(screen.getByText("1 prompt")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "All" }));
    await userEvent.click(screen.getByRole("button", { name: "Any level" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Search prompts" }), "stand-up");
    expect(screen.getByText("1 prompt")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Copy prompt: Daily stand-up" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Run a stand-up"));
    vi.unstubAllGlobals();
  });
});

describe("community page", () => {
  it("shows coming-soon instead of invented links, and builds a pre-filled GitHub issue", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    at("/community");
    expect(screen.getAllByText("Coming soon").length).toBeGreaterThanOrEqual(3); // Discussions, Discord, X, Forum unset
    const field = screen.getByLabelText("Your idea, in one line");
    await userEvent.type(field, "Cost per project");
    await userEvent.click(screen.getByRole("button", { name: "Continue on GitHub" }));
    const url = new URL(assign.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe("https://github.com/OpenSourcx/papercliped/issues/new");
    expect(url.searchParams.get("title")).toBe("Idea: Cost per project");
    expect(url.searchParams.get("labels")).toBe("enhancement");
  });
});

describe("brand and legal", () => {
  it("brand page offers the downloads", () => {
    at("/brand");
    const main = screen.getByRole("main");
    for (const f of ["mascot-light.svg", "mascot-dark.svg", "wordmark-light.png", "wordmark-dark.png"]) expect(within(main).getAllByRole("link").some((a) => a.getAttribute("href") === `/brand/${f}`)).toBe(true);
    // Every download link points at a file that's really in public/ (the icon pack is built by scripts/icon-pack.mjs).
    const hrefs = within(main).getAllByRole("link").map((a) => a.getAttribute("href") ?? "").filter((h) => h.startsWith("/brand/"));
    expect(hrefs).toContain("/brand/papercliped-icons.zip");
    for (const h of hrefs) expect(existsSync(resolve(process.cwd(), `public${h}`)), h).toBe(true);
  });
  it("the icons, favicon and web manifest the page head links to exist", () => {
    const head = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    for (const m of head.matchAll(/<link rel="(?:icon|apple-touch-icon|manifest)"[^>]*href="([^"]+)"/g)) expect(existsSync(resolve(process.cwd(), `public${m[1]}`)), m[1]).toBe(true);
    const manifest = JSON.parse(readFileSync(resolve(process.cwd(), "public/site.webmanifest"), "utf8")) as { icons: { src: string }[] };
    for (const i of manifest.icons) expect(existsSync(resolve(process.cwd(), `public${i.src}`)), i.src).toBe(true);
  });
  it("privacy and terms render with the placeholders filled", () => {
    const { unmount } = at("/privacy");
    const main = screen.getByRole("main");
    expect(main.textContent).toContain("support@papercliped.co");
    expect(main.textContent).toContain("https://papercliped.co");
    expect(main.textContent).not.toContain("{{");
    unmount();
    at("/terms");
    expect(screen.getByRole("main").textContent).not.toContain("{{");
  });
});

