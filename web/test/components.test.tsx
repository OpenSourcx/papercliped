import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { Accordion } from "../src/components/Accordion";
import { CodeBlock } from "../src/components/CodeBlock";
import { Footer } from "../src/components/Layout";
import { Mascot } from "../src/components/Mascot";
import { Tabs } from "../src/components/Tabs";
import { ThemePicker } from "../src/components/ThemePicker";
import { Field } from "../src/components/ui";
import { liveSocials } from "../src/config/community";
import { applyPrefs, readPrefs } from "../src/theme/prefs";
import { seasonalTheme } from "../src/theme/rotation";
import { themeCss } from "../src/theme/css";

const inRouter = (ui: React.ReactNode, path = "/") => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

describe("theme preferences", () => {
  it("defaults to following the season; light or dark is left to the device", () => {
    expect(readPrefs()).toEqual({ theme: "season" });
    document.documentElement.dataset.mode = "dark"; // an old manual choice
    applyPrefs("season");
    expect(document.documentElement.dataset.theme).toBe(seasonalTheme());
    expect(document.documentElement.dataset.mode).toBeUndefined();
  });
  it("survives broken localStorage", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readPrefs()).toEqual({ theme: "season" });
    spy.mockRestore();
  });
  it("ignores junk stored values", () => {
    localStorage.setItem("pcl.theme", "<script>");
    expect(readPrefs()).toEqual({ theme: "season" });
  });
  it("the design-kit picker applies and remembers a palette, with no mode switch", async () => {
    localStorage.setItem("pcl.mode", "dark");
    render(<ThemePicker />);
    expect(screen.queryByRole("radio")).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText("Palette"), "sakura");
    expect(document.documentElement.dataset.theme).toBe("sakura");
    expect(localStorage.getItem("pcl.theme")).toBe("sakura");
    expect(localStorage.getItem("pcl.mode")).toBeNull();
  });
  it("the theme CSS has no manual mode overrides", () => {
    expect(themeCss()).not.toContain("data-mode");
    expect(themeCss()).toContain("@media (prefers-color-scheme: dark)");
  });
});

describe("components", () => {
  it("CodeBlock copies its code", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<CodeBlock code="npx papercliped@latest" />);
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("npx papercliped@latest");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
  it("Tabs follow the ARIA pattern with arrow keys", async () => {
    render(<Tabs label="Install" tabs={[{ id: "a", label: "A", content: "Panel A" }, { id: "b", label: "B", content: "Panel B" }]} />);
    const [a, b] = screen.getAllByRole("tab");
    expect(a).toHaveAttribute("aria-selected", "true");
    a.focus();
    fireEvent.keyDown(a, { key: "ArrowRight" });
    expect(b).toHaveAttribute("aria-selected", "true");
    expect(b).toHaveFocus();
    expect(screen.getByText("Panel B")).toBeVisible();
    fireEvent.keyDown(b, { key: "Home" });
    expect(a).toHaveAttribute("aria-selected", "true");
  });
  it("Accordion uses native details", () => {
    const { container } = render(<Accordion items={[{ q: "Free?", a: "Yes" }]} />);
    expect(container.querySelector("details summary")).toHaveTextContent("Free?");
  });
  it("Field wires its label, hint and error", () => {
    render(<Field label="Username" hint="6 to 32 characters" error="Too short" />);
    const input = screen.getByLabelText("Username");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toMatch(/hint.*err/);
    expect(screen.getByRole("alert")).toHaveTextContent("Too short");
  });
  it("Mascot is still with reduced motion, and hidden from screen readers without a title", () => {
    const mm = vi.fn((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList);
    Object.defineProperty(window, "matchMedia", { value: mm, configurable: true });
    vi.useFakeTimers();
    const { container, unmount } = render(<Mascot />);
    act(() => void vi.advanceTimersByTime(10_000));
    expect(container.querySelector("[data-blink]")).toBeNull();
    expect(screen.getByRole("img", { name: "Papercliped mascot" })).toBeInTheDocument();
    unmount();
    const { container: c2 } = render(<Mascot title="" />);
    expect(c2.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    vi.useRealTimers();
    Reflect.deleteProperty(window, "matchMedia");
    expect(mm).toHaveBeenCalled();
  });
});

describe("community links", () => {
  it("the footer shows X, GitHub and Discord icons; unset networks point to the community page (no invented handles)", () => {
    expect(liveSocials({ github: "https://github.com/OpenSourcx/papercliped", discord: "", reddit: "", x: "", discussions: "", forum: "" }).map((s) => s.key)).toEqual(["github"]);
    inRouter(<Footer />);
    const social = within(screen.getByRole("list", { name: "Social" }));
    expect(social.getAllByRole("link")).toHaveLength(3);
    expect(social.getByRole("link", { name: "Papercliped on GitHub" })).toHaveAttribute("href", "https://github.com/OpenSourcx/papercliped");
    expect(social.getByRole("link", { name: "Papercliped on X (coming soon)" })).toHaveAttribute("href", "/community");
    expect(social.getByRole("link", { name: "OpenSourcedd on Discord" })).toHaveAttribute("href", "https://discord.gg/cAECU68jSA");
  });
});

describe("app", () => {
  it("renders the home page and the kit", () => {
    inRouter(<App />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your Paperclip, in every AI app.");
  });
  it("renders the design kit with every theme listed", () => {
    inRouter(<App />, "/kit");
    expect(screen.getByRole("heading", { level: 1, name: "Design kit" })).toBeInTheDocument();
    for (const n of ["Clip (default)", "Cherry blossom", "Baby blue", "Citrus", "Lagoon", "Maple", "Harvest", "Frost", "Pine"]) expect(screen.getAllByText(n).length).toBeGreaterThan(0);
  });
  it("unknown paths show a not-found page", () => {
    inRouter(<App />, "/nope");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Page not found");
  });
});
