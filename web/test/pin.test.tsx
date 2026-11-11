import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PinField } from "../src/components/PinField";
import { MemoryRouter } from "react-router-dom";
import { Header } from "../src/components/Layout";
import { PinStage } from "../src/components/PinStage";

const mm = (matches: (q: string) => boolean) =>
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: matches(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));

function setup(matches: (q: string) => boolean) {
  mm(matches);
  const raf = vi.fn(() => 1);
  const caf = vi.fn();
  vi.stubGlobal("requestAnimationFrame", raf);
  vi.stubGlobal("cancelAnimationFrame", caf);
  const ctx = new Proxy({}, { get: (_t, k) => (k === "canvas" ? null : () => undefined), set: () => true });
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
  return { raf, caf };
}
afterEach(() => vi.unstubAllGlobals());

describe("PinField (decorative canvas)", () => {
  it("animates, and stops its loop on unmount", () => {
    const { raf, caf } = setup(() => false);
    const { unmount } = render(<PinField />);
    expect(screen.getByTestId("pin-field")).toHaveAttribute("aria-hidden", "true");
    expect(raf).toHaveBeenCalled();
    unmount();
    expect(caf).toHaveBeenCalled();
  });
  it("draws one static frame and never schedules a loop under reduced motion", () => {
    const { raf } = setup((q) => q.includes("reduced-motion"));
    render(<PinField />);
    expect(raf).not.toHaveBeenCalled();
  });
  it("is absent (no loop) at 375 px and below", () => {
    const { raf } = setup((q) => q.includes("max-width"));
    render(<PinField />);
    expect(raf).not.toHaveBeenCalled();
    expect(screen.getByTestId("pin-field").className).toContain("max-[375px]:hidden");
  });
});

describe("PinStage accessibility (ERR-WEB-008)", () => {
  it("tabs use roving tabindex, arrow keys and a tabpanel", () => {
    setup(() => true);
    render(<PinStage />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(screen.getAllByRole("tab")[1]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "pin-tab-1");
    fireEvent.keyDown(tabs[1], { key: "End" });
    expect(screen.getAllByRole("tab")[2]).toHaveAttribute("aria-selected", "true");
  });
  it("the Assistant/Agent toggle changes the demo text", () => {
    setup(() => true);
    render(<PinStage />);
    expect(screen.queryByText(/In agent mode/)).toBeNull();
    act(() => { fireEvent.click(screen.getByRole("button", { name: /agent mode/i })); });
    expect(screen.getAllByText(/In agent mode/).length).toBeGreaterThan(0);
  });
});

describe("header does not overflow on phones or tablets", () => {
  it("lets the title column shrink and hides the CTA below lg (it was overflowing 43 to 82 px)", () => {
    setup(() => false);
    const { container } = render(<MemoryRouter><Header /></MemoryRouter>);
    expect(container.querySelector("div.grid")!.className).toContain("grid-cols-[minmax(0,1fr)_auto]");
    expect(screen.getByRole("link", { name: "Use ePaperclip" }).className).toContain("max-lg:hidden");
  });
});
