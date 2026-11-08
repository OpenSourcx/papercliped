import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App";

vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
const at = (p: string) => render(<MemoryRouter initialEntries={[p]}><App /></MemoryRouter>);

describe("front door", () => {
  it("header has Sign in and Console to the live hosts, and keeps Use ePaperclip", () => {
    at("/");
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("https://auth.papercliped.co/");
    expect(within(header).getByRole("link", { name: "Console" }).getAttribute("href")).toBe("https://console.papercliped.co/");
    expect(within(header).getByRole("link", { name: "Use ePaperclip" }).getAttribute("href")).toBe("/epaperclip");
  });
  it("mobile menu lists Sign in and Console", async () => {
    at("/");
    screen.getByRole("button", { name: "Open menu" }).click();
    const nav = await screen.findByRole("navigation", { name: "Main", description: "" }).catch(() => null);
    expect(nav ?? document.body).toBeTruthy();
    expect(document.querySelectorAll('#mobile-nav a[href="https://auth.papercliped.co/"]').length).toBe(1);
    expect(document.querySelectorAll('#mobile-nav a[href="https://console.papercliped.co/"]').length).toBe(1);
  });
  it("closing CTA on /epaperclip goes to the install guide; others still go to the product page; disclosure kept", () => {
    const a = at("/epaperclip");
    const links = screen.getAllByRole("link", { name: "Use ePaperclip" }).map((l) => l.getAttribute("href"));
    expect(links).toContain("https://github.com/OpenSourcx/papercliped-engine/blob/main/docs/INSTALL.md");
    expect(document.body.textContent).toMatch(/release-candidate/i);
    a.unmount();
    at("/pin");
    expect(screen.getAllByRole("link", { name: "Use ePaperclip" }).every((l) => l.getAttribute("href") === "/epaperclip")).toBe(true);
  });
  it("the home hero CTA still routes to the product page", () => {
    at("/");
    expect(screen.getAllByRole("link", { name: /Use ePaperclip/ }).every((l) => l.getAttribute("href") === "/epaperclip")).toBe(true);
  });
});
