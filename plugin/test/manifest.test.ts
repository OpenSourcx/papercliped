import { pluginManifestV1Schema } from "@paperclipai/shared";
import { describe, expect, it } from "vitest";
import manifest from "../src/manifest.js";

// Paperclip refuses to install a plugin whose manifest fails its own schema, with a 400 that says nothing useful to the
// person installing. This runs the same schema Paperclip runs, so a manifest it would reject fails here instead.
describe("manifest", () => {
  it("passes Paperclip's own manifest schema", () => {
    const r = pluginManifestV1Schema.safeParse(manifest);
    expect(r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)).toEqual([]);
  });

  it("gives only the page and its menu a route (the sidebar link goes through the host's navigation)", () => {
    for (const s of manifest.ui?.slots ?? []) if (s.type !== "page" && s.type !== "routeSidebar") expect(s.routePath, s.id).toBeUndefined();
    expect((manifest.ui?.slots ?? []).filter((s) => s.type === "page" || s.type === "routeSidebar").map((s) => s.routePath)).toEqual(["papercliped", "papercliped"]);
  });

  it("offers every slot the control room is built from", () => {
    expect((manifest.ui?.slots ?? []).map((s) => `${s.type}:${s.exportName}`).sort()).toEqual([
      "dashboardWidget:PapercliedWidget", "detailTab:PapercliedAgentTab", "page:PapercliedPage", "routeSidebar:PapercliedRouteSidebar", "sidebar:PapercliedSidebar",
    ]);
    expect((manifest.ui?.slots ?? []).find((s) => s.type === "detailTab")?.entityTypes).toEqual(["agent"]);
  });

  it("asks for exactly the capabilities its slots and the agent list need", () => {
    expect([...manifest.capabilities].sort()).toEqual(["agents.read", "http.outbound", "plugin.state.read", "plugin.state.write", "ui.dashboardWidget.register", "ui.detailTab.register", "ui.page.register", "ui.sidebar.register"]);
  });
});
