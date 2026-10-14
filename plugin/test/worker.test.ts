import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

afterEach(() => vi.unstubAllGlobals());

describe("manifest", () => {
  it("declares only what the plugin uses", () => {
    expect(manifest).toMatchObject({ apiVersion: 1, categories: ["connector", "ui"], entrypoints: { worker: "dist/worker.js", ui: "dist/ui" } });
    expect([...manifest.capabilities].sort()).toEqual(["agents.read", "http.outbound", "plugin.state.read", "plugin.state.write", "ui.dashboardWidget.register", "ui.detailTab.register", "ui.page.register", "ui.sidebar.register"]);
    expect(manifest.ui!.slots!.map((s) => s.type).sort()).toEqual(["dashboardWidget", "detailTab", "page", "routeSidebar", "sidebar"]);
    expect((manifest.instanceConfigSchema as any).properties.bridgeUrl.default).toBe("https://papercliped.co");
  });
});

describe("worker wiring (SDK test harness)", () => {
  async function boot(config: Record<string, unknown> = {}) {
    const harness = createTestHarness({ manifest, config });
    await plugin.definition.setup(harness.ctx);
    return harness;
  }

  it("registers per-user actions and uses the host-verified actor for state", async () => {
    const calls: { url: string; auth: string | null }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
      const auth = (init.headers as Record<string, string>)?.authorization ?? null;
      calls.push({ url, auth });
      const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
      if (url.endsWith("/plugin-link/sign-in")) return j({ token: "pcb_pl_abc123" });
      if (url.endsWith("/me")) return j({ name: "ann.test1", anonymous: false, alias: null, paperclip: null, connected: true });
      return j({ error: "nope" }, 404);
    });
    const h = await boot({ bridgeUrl: "https://bridge.example.test" });
    const ann = { type: "user" as const, userId: "user-ann" };
    expect(await h.performAction("status", {}, { actor: ann })).toEqual({ linked: false });
    const linked: any = await h.performAction("link", { username: "ann.test1", secret: "pcs_A-B-C-D", userId: "user-evil" }, { actor: ann });
    expect(linked.linked).toBe(true);
    expect(JSON.stringify(linked)).not.toContain("pcb_pl_");
    expect(await h.performAction("status", {}, { actor: { type: "user", userId: "user-bob" } })).toEqual({ linked: false });
    expect(calls.some((c) => c.auth === "Bearer pcb_pl_abc123")).toBe(true);
    expect(calls.every((c) => c.url.startsWith("https://bridge.example.test/api/manage"))).toBe(true);
    expect(await h.performAction("status", {}, { actor: { type: "agent", userId: null } })).toEqual({ papercliped_error: expect.stringMatching(/as a person/) });
  });

  it("lists the agents of the company the host says the call is for, and no other", async () => {
    const harness = await boot({ bridgeUrl: "https://bridge.example.test" });
    const agent = (id: string, companyId: string, name: string) => ({ id, companyId, name, urlKey: name.toLowerCase(), role: "engineer", title: "Engineer", status: "idle", adapterConfig: {}, runtimeConfig: {}, permissions: {}, metadata: null, budgetMonthlyCents: 0, spentMonthlyCents: 0 }) as any;
    harness.seed({ agents: [agent("a1", "c1", "Alpha"), agent("a2", "c1", "Beta"), agent("a9", "c2", "Elsewhere")] });
    const ann = { type: "user" as const, userId: "user-ann" };
    const got: any = await harness.performAction("agents", {}, { actor: ann, companyId: "c1" });
    expect(got.agents.map((a: any) => a.id).sort()).toEqual(["a1", "a2"]);
    expect(got.agents[0]).toEqual({ id: expect.any(String), name: expect.any(String), role: "engineer", title: "Engineer", status: "idle" }); // only what the page shows
    // a company named in the page's own parameters is not trusted
    const spoof: any = await harness.performAction("agents", { companyId: "c2" }, { actor: ann, companyId: "c1" });
    expect(spoof.agents.map((a: any) => a.id)).not.toContain("a9");
    expect(await harness.performAction("agents", {}, { actor: ann })).toEqual({ papercliped_error: expect.stringMatching(/Open a company/) });
    expect(await harness.performAction("agents", {}, { actor: { type: "agent", userId: null }, companyId: "c1" })).toEqual({ papercliped_error: expect.stringMatching(/as a person/) });
  });

  it("refuses to talk to a non-https bridge", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const h = await boot({ bridgeUrl: "http://bridge.example.test" });
    expect(await h.performAction("link", { username: "u", secret: "pcs_A-B-C-D" }, { actor: { type: "user", userId: "u" } })).toEqual({ papercliped_error: expect.stringMatching(/https/) });
    expect(f).not.toHaveBeenCalled();
  });
});
