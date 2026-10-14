import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BridgeError, normalizeBridgeUrl } from "../src/bridge.js";
import { createHandlers } from "../src/handlers.js";
import { linkScope } from "../src/keys.js";
import { annLogin, startFakeBridge, type FakeBridge } from "./fake-bridge.js";

let fake: FakeBridge;
const mem = new Map<string, unknown>();
const k = (s: ReturnType<typeof linkScope>) => `${s.scopeKind}|${s.namespace}|${s.stateKey}`;
const state = { get: async (s: any) => mem.get(k(s)) ?? null, set: async (s: any, v: unknown) => void mem.set(k(s), v), delete: async (s: any) => void mem.delete(k(s)) };
const ann = { type: "user", userId: "user-ann" };
const bob = { type: "user", userId: "user-bob" };
let h: ReturnType<typeof createHandlers>;

beforeAll(async () => {
  fake = await startFakeBridge();
  h = createHandlers({ state, fetch: (u, i) => fetch(u, i), bridgeUrl: async () => fake.url, allowInsecureLoopback: true });
});
afterAll(() => fake.server.close());

describe("bridge url", () => {
  it("defaults to the hosted bridge and insists on https", () => {
    expect(normalizeBridgeUrl(undefined)).toBe("https://papercliped.co");
    expect(normalizeBridgeUrl("https://bridge.example.com/")).toBe("https://bridge.example.com");
    for (const bad of ["http://bridge.example.com", "http://127.0.0.1:3000", "ftp://x.test", "https://u:p@x.test", "https://x.test/?a=1", "nonsense"]) expect(() => normalizeBridgeUrl(bad), bad).toThrow();
    expect(normalizeBridgeUrl("http://127.0.0.1:3000", { allowInsecureLoopback: true })).toBe("http://127.0.0.1:3000");
    expect(() => normalizeBridgeUrl("http://evil.example", { allowInsecureLoopback: true })).toThrow();
  });
});

describe("plugin actions against a fake bridge", () => {
  it("only acts for a verified person", async () => {
    await expect(h.status({}, { type: "agent", userId: null })).rejects.toThrow(/as a person/);
    await expect(h.link({ username: "x", secret: "y" }, { type: "user", userId: null })).rejects.toThrow(/as a person/);
  });

  it("links with username + secret key, stores only the token under the actor's own key, and never returns it", async () => {
    expect(await h.status({}, ann)).toEqual({ linked: false });
    const r = await h.link(annLogin(fake, { instanceHost: "paperclip.example.com" }), ann);
    expect(r).toMatchObject({ linked: true, me: { name: "ann.test1" } });
    expect(JSON.stringify(r)).not.toContain("pcb_pl_");
    const stored: any = mem.get(k(linkScope("user-ann")));
    expect(stored.token).toMatch(/^pcb_pl_/);
    expect(mem.get(k(linkScope("user-bob")))).toBeUndefined();
    expect(JSON.stringify(stored)).not.toContain(fake.secret); // the secret key is never kept
    const ex = fake.seen.find((s) => s.path.endsWith("/plugin-link/sign-in"))!;
    expect(ex.body).toEqual({ username: "ann.test1", secret: fake.secret, instanceHost: "paperclip.example.com", paperclipUserId: "user-ann" }); // the verified id, not a UI value
    expect(JSON.stringify(await h.status({}, ann))).not.toContain("pcb_pl_");
    // a wrong key is refused with the bridge's message
    await expect(h.link({ username: "ann.test1", secret: "pcs_WRONG" }, bob)).rejects.toThrow(/don't match/);
    await expect(h.link({ username: "ann.test1", secret: "  " }, bob)).rejects.toThrow(/username and secret key/);
  });

  it("users are isolated: another person is not linked and cannot use Ann's token", async () => {
    expect(await h.status({}, bob)).toEqual({ linked: false });
    await expect(h.connections({}, bob)).rejects.toThrow(/Link your Papercliped account/);
    // even a params-supplied id/token changes nothing
    await expect(h.connections({ userId: "user-ann", token: "x" }, bob)).rejects.toThrow();
  });

  it("lists, changes level, toggles privacy and disconnects with the bearer token", async () => {
    const list: any = await h.connections({}, ann);
    expect(list.connections[0]).toMatchObject({ id: "g1", app: "Claude", level: "paperclip:read" });
    await h.setLevel({ id: "g1", level: "control" }, ann);
    expect(fake.connections[0].level).toBe("paperclip:control");
    await expect(h.setLevel({ id: "g1", level: "admin" }, ann)).rejects.toThrow(/read or control/);
    await expect(h.setLevel({ id: "nope", level: "read" }, ann)).rejects.toThrow(/No such connection/);
    expect(await h.privacy({ anonymous: true }, ann)).toMatchObject({ anonymous: true, alias: "Ann02" });
    await expect(h.privacy({ anonymous: "yes" }, ann)).rejects.toThrow();
    await h.disconnect({ id: "g1" }, ann);
    expect(fake.connections).toEqual([]);
    const authed = fake.seen.filter((s) => s.headers.authorization);
    expect(authed.every((s) => /^Bearer pcb_pl_/.test(String(s.headers.authorization)))).toBe(true);
  });

  it("forgets the link when the bridge says the token is dead", async () => {
    const token = (mem.get(k(linkScope("user-ann"))) as any).token;
    fake.tokens.get(token)!.revoked = true; // e.g. removed from another Paperclip, or the secret key was rotated
    expect(await h.status({}, ann)).toEqual({ linked: false, expired: true });
    expect(mem.get(k(linkScope("user-ann")))).toBeUndefined();
  });

  it("unlink revokes at the bridge and clears local state, even if the bridge is unreachable", async () => {
    await h.link(annLogin(fake), ann);
    const token = (mem.get(k(linkScope("user-ann"))) as any).token;
    expect(await h.unlink({}, ann)).toEqual({ linked: false, revoked: true });
    expect(fake.tokens.get(token)!.revoked).toBe(true);
    expect(mem.get(k(linkScope("user-ann")))).toBeUndefined();

    await h.link(annLogin(fake), ann);
    const down = createHandlers({ state, fetch: async () => { throw new Error("offline"); }, bridgeUrl: async () => fake.url, allowInsecureLoopback: true });
    expect(await down.unlink({}, ann)).toEqual({ linked: false, revoked: false });
    expect(mem.get(k(linkScope("user-ann")))).toBeUndefined();
  });

  it("surfaces unreachable bridges without leaking the token", async () => {
    await h.link(annLogin(fake), ann);
    const down = createHandlers({ state, fetch: async () => { throw new Error("offline: Bearer pcb_pl_secret"); }, bridgeUrl: async () => fake.url, allowInsecureLoopback: true });
    const e = await down.connections({}, ann).catch((x) => x);
    expect(e).toBeInstanceOf(BridgeError);
    expect(e.message).toBe("Could not reach the Papercliped bridge.");
    expect(mem.get(k(linkScope("user-ann")))).toBeTruthy(); // a network error does not unlink
  });

  it("shows the service's public status without needing a link", async () => {
    const s = await h.serviceStatus({}, { type: "user", userId: "someone-unlinked" });
    expect(s).toEqual({ status: "ok", version: "2.0.0", users: 42, liveConnections: 7, requestSuccessRate: 0.95, signInSuccessRate: 0.9, p95Ms: 460, statusPage: `${fake.url}/status` });
  });

  it("refuses a non-https bridge URL from config", async () => {
    const bad = createHandlers({ state, fetch: (u, i) => fetch(u, i), bridgeUrl: async () => fake.url }); // no loopback exemption: what the worker does
    await expect(bad.link(annLogin(fake), bob)).rejects.toThrow(/https/);
  });

  it("account actions need the secret key; a new key keeps this Paperclip linked; disconnect and delete unlink", async () => {
    await h.link(annLogin(fake), ann);
    expect((await h.links({}, ann)).links[0]).toMatchObject({ host: "paperclip.example.com", current: true });
    await expect(h.rotateSecret({}, ann)).rejects.toThrow(/secret key to confirm/);
    await expect(h.rotateSecret({ secret: "pcs_WRONG" }, ann)).rejects.toThrow(/not right/);
    const before = (mem.get(k(linkScope("user-ann"))) as any).token;
    const r = await h.rotateSecret({ secret: fake.secret }, ann);
    expect(r).toEqual({ secret: "pcs_NEW1-NEW2-NEW3-NEW4" });
    const after = (mem.get(k(linkScope("user-ann"))) as any).token;
    expect(after).not.toBe(before);
    expect((await h.status({}, ann)).linked).toBe(true); // still linked with the fresh token

    expect(await h.disconnectPaperclip({ secret: fake.secret }, ann)).toEqual({ linked: false });
    expect(mem.get(k(linkScope("user-ann")))).toBeUndefined();

    await h.link(annLogin(fake), ann);
    await expect(h.deleteAccount({ secret: fake.secret }, ann)).rejects.toThrow(/username to confirm/);
    await expect(h.deleteAccount({ secret: fake.secret, confirm: "nope" }, ann)).rejects.toThrow(/username to confirm/);
    expect(await h.deleteAccount({ secret: fake.secret, confirm: "ann.test1" }, ann)).toEqual({ linked: false });
    expect(mem.get(k(linkScope("user-ann")))).toBeUndefined();
    expect(fake.deleted).toBe(true);
  });
});

describe("control room actions against a fake bridge", () => {
  const withAgents = (id = "user-ann") => ({ type: "user", userId: id, companyId: "c1" });
  let room: ReturnType<typeof createHandlers>;
  beforeAll(async () => {
    fake.deleted = false;
    fake.connections = [{ id: "g1", app: "Claude", level: "paperclip:control", createdAt: Date.now(), lastUsedAt: null }, { id: "g2", app: "ChatGPT", level: "paperclip:read", createdAt: Date.now(), lastUsedAt: Date.now() }];
    room = createHandlers({
      state,
      fetch: (u, i) => fetch(u, i),
      bridgeUrl: async () => fake.url,
      allowInsecureLoopback: true,
      listAgents: async (companyId) => (companyId === "c1" ? [{ id: "a1", name: "Alpha", role: "engineer", title: null, status: "idle" }] : []),
    });
    await room.link(annLogin(fake), ann);
  });

  it("lists sessions with their limits", async () => {
    const r: any = await room.sessions({}, ann);
    expect(r.sessions).toHaveLength(2);
    expect(r.sessions[0]).toMatchObject({ id: "g1", app: "Claude", label: null, tools: null, agents: null });
  });

  it("changes one session's name, tools, agents and level, passing only known fields to the bridge", async () => {
    const r: any = await room.setSession({ id: "g1", label: "  Work laptop  ", tools: ["paperclip_list_agents"], agents: ["a1"], level: "read", admin: true, __proto__: { x: 1 } }, ann);
    expect(r).toEqual({ label: "Work laptop", tools: ["paperclip_list_agents"], agents: ["a1"] });
    const sent = fake.seen.filter((s) => s.method === "POST" && s.path.endsWith("/sessions/g1")).at(-1)!.body;
    expect(Object.keys(sent).sort()).toEqual(["agents", "label", "level", "tools"]);
    expect(fake.connections[0].level).toBe("paperclip:read");
    // null clears a limit; leaving a field out leaves it alone
    await room.setSession({ id: "g1", tools: null }, ann);
    expect(fake.connections[0].tools).toBeNull();
    expect(fake.connections[0].agents).toEqual(["a1"]);
    expect(fake.seen.filter((s) => s.path.endsWith("/sessions/g1")).at(-1)!.body).toEqual({ tools: null });
  });

  it("refuses bad input here, and shows the bridge's reason for anything it refuses", async () => {
    await expect(room.setSession({ label: "x" }, ann)).rejects.toThrow(/Missing session id/);
    await expect(room.setSession({ id: "g1", level: "admin" }, ann)).rejects.toThrow(/read or control/);
    await expect(room.setSession({ id: "g1", tools: "all" }, ann)).rejects.toThrow(/list/);
    await expect(room.setSession({ id: "g1", tools: [] }, ann)).rejects.toThrow(/at least one tool/); // the bridge's own message
    await expect(room.setSession({ id: "nope", label: "x" }, ann)).rejects.toThrow(/No such session/);
  });

  it("reads and saves the access switch with per-agent overrides", async () => {
    expect(await room.policy({}, ann)).toEqual({ mode: "full", agents: {} });
    expect(await room.setPolicy({ mode: "agent", agents: { a1: "off", a2: "api" } }, ann)).toEqual({ mode: "agent", agents: { a1: "off", a2: "api" } });
    expect(await room.policy({}, ann)).toMatchObject({ mode: "agent" });
    await expect(room.setPolicy({ mode: "everything" }, ann)).rejects.toThrow(/api, full or agent/);
    await expect(room.setPolicy({ mode: "full", agents: [] }, ann)).rejects.toThrow(/object/);
    await expect(room.setPolicy({ mode: "full", agents: { a1: "maybe" } }, ann)).rejects.toThrow(/api, full, agent or off/);
    expect(await room.policy({}, ann)).toMatchObject({ mode: "agent" }); // a refused save changes nothing
  });

  it("lists tools and activity, bounding what it asks for", async () => {
    expect(((await room.tools({}, ann)) as any).tools).toHaveLength(6);
    fake.calls = [
      { at: 2, tool: "paperclip_pause_agent", ok: false, blocked: true, status: 403, error: "policy_blocked", ms: 3, session: "g1", app: "Claude" },
      { at: 1, tool: "paperclip_list_agents", ok: true, blocked: false, status: null, error: null, ms: 9, session: "g2", app: "ChatGPT" },
    ];
    expect(((await room.activity({}, ann)) as any).calls).toHaveLength(2);
    expect(((await room.activity({ session: "g2" }, ann)) as any).calls.map((c: any) => c.tool)).toEqual(["paperclip_list_agents"]);
    await room.activity({ limit: 100000 }, ann);
    expect(fake.seen.at(-1)!.path).toContain("limit=200");
  });

  it("lists agents only for the company the host named, and tells a person with no company what to do", async () => {
    expect(((await room.agents({ companyId: "c2" }, withAgents())) as any).agents.map((a: any) => a.id)).toEqual(["a1"]); // c1, whatever the page asked for
    await expect(room.agents({}, ann)).rejects.toThrow(/Open a company/);
    await expect(room.agents({}, { type: "agent", userId: null, companyId: "c1" })).rejects.toThrow(/as a person/);
    const plain = createHandlers({ state, fetch: (u, i) => fetch(u, i), bridgeUrl: async () => fake.url, allowInsecureLoopback: true });
    await expect(plain.agents({}, withAgents())).rejects.toThrow(/can't list agents/);
  });

  it("everything needs a link, and one person's link is never used for another", async () => {
    for (const call of [() => room.sessions({}, bob), () => room.policy({}, bob), () => room.setPolicy({ mode: "full" }, bob), () => room.tools({}, bob), () => room.activity({}, bob), () => room.setSession({ id: "g1", label: "x" }, bob)]) {
      await expect(call()).rejects.toThrow(/Link your Papercliped account first/);
    }
  });
});
