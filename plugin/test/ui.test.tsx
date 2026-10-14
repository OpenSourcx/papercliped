// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { failure } from "../src/action-error.js";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHandlers } from "../src/handlers.js";
import { linkScope } from "../src/keys.js";
import { ANN_SECRET, annLogin, startFakeBridge, type FakeBridge } from "./fake-bridge.js";

// Paperclip provides these components and hooks at runtime; here they are stand-ins with the same props. The location is a tiny
// router, so clicking a link navigates, as it does in Paperclip.
const host = vi.hoisted(() => {
  const s = {
    path: "/BEH/dashboard",
    search: "",
    ctx: { companyId: "c1", companyPrefix: "BEH", entityId: null as string | null, entityType: null as string | null },
    subs: new Set<() => void>(),
    toasts: [] as { title: string; body?: string; tone?: string }[],
    actions: {} as Record<string, (p?: Record<string, unknown>) => Promise<unknown>>,
    go(to: string) {
      const u = new URL(to.replace(/^\/(?!BEH)/, "/BEH/"), "http://x");
      s.path = u.pathname;
      s.search = u.search;
      s.subs.forEach((f) => f());
    },
    at(path: string, search = "") {
      s.path = path;
      s.search = search;
    },
  };
  return s;
});
vi.mock("@paperclipai/plugin-sdk/ui", async () => {
  const React = await import("react");
  const link = (to: string) => ({ href: to, onClick: (e: { preventDefault: () => void }) => (e.preventDefault(), host.go(to)) });
  return {
    usePluginAction: (name: string) => host.actions[name],
    usePluginToast: () => React.useCallback((t: { title: string; tone?: string }) => (host.toasts.push(t), "id"), []),
    useHostNavigation: () => ({ linkProps: link, navigate: (to: string) => host.go(to) }),
    useHostLocation: () => {
      React.useSyncExternalStore((cb) => (host.subs.add(cb), () => void host.subs.delete(cb)), () => `${host.path}${host.search}`);
      return { pathname: host.path, search: host.search, hash: "" };
    },
    useHostContext: () => host.ctx,
    copyTextToClipboard: vi.fn(),
    ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
    Spinner: ({ label }: { label?: string }) => <p>{label}</p>,
    StatusBadge: ({ label, status }: { label: string; status: string }) => <span data-status={status}>{label}</span>,
    MetricCard: ({ label, value, unit }: { label: string; value: unknown; unit?: string }) => <div>{label}: {String(value)}{unit}</div>,
    KeyValueList: ({ pairs }: { pairs: { label: string; value: ReactNode }[] }) => <dl>{pairs.map((p) => <div key={p.label}><dt>{p.label}</dt><dd>{p.value}</dd></div>)}</dl>,
    DataTable: ({ columns, rows, emptyMessage, loading }: any) =>
      loading ? <p>Loading…</p> : rows.length === 0 ? <p>{emptyMessage}</p> : (
        <table><tbody>{rows.map((r: any) => <tr key={r.id}>{columns.map((c: any) => <td key={c.key}>{c.render ? c.render(r[c.key], r) : String(r[c.key])}</td>)}</tr>)}</tbody></table>
      ),
  };
});

const { PapercliedPage, PapercliedSidebar, PapercliedRouteSidebar, PapercliedAgentTab, PapercliedWidget } = await import("../src/ui/index.js");

let fake: FakeBridge;
let h: ReturnType<typeof createHandlers>;
const mem = new Map<string, unknown>();
const k = (s: ReturnType<typeof linkScope>) => `${s.scopeKind}|${s.namespace}|${s.stateKey}`;
const state = { get: async (s: any) => mem.get(k(s)) ?? null, set: async (s: any, v: unknown) => void mem.set(k(s), v), delete: async (s: any) => void mem.delete(k(s)) };
const ann = { type: "user", userId: "user-ann", companyId: "c1" };
const AGENTS = [
  { id: "a1", name: "Alpha", role: "engineer", title: "Backend Engineer", status: "idle" },
  { id: "a2", name: "Beta", role: "designer", title: null, status: "paused" },
];

beforeAll(async () => {
  fake = await startFakeBridge();
  // The worker runs in plain Node; here it shares jsdom's globals, and Node 24's fetch rejects jsdom's AbortSignal.
  h = createHandlers({ state, fetch: (u, i) => fetch(u, { ...i, signal: undefined }), bridgeUrl: async () => fake.url, allowInsecureLoopback: true, listAgents: async () => AGENTS });
  host.actions = Object.fromEntries(Object.entries(h).map(([name, fn]) => [name, async (p: Record<string, unknown> = {}) => { try { return await (fn as any)(p, ann); } catch (e) { return failure(e); } }])); // like the worker: failures come back as data
});
afterAll(() => fake.server.close());

/** Every test starts from the same place: a linked person, two sessions, nothing blocked. */
beforeEach(async () => {
  fake.deleted = false;
  fake.seen.length = 0;
  fake.secret = ANN_SECRET;
  fake.tokens.clear();
  fake.failPolicy = false;
  fake.policy = { mode: "full", agents: {} };
  fake.connections = [
    { id: "g1", app: "Claude", level: "paperclip:control", createdAt: Date.now() - 86_400_000, lastUsedAt: Date.now() - 60_000 },
    { id: "g2", app: "ChatGPT", level: "paperclip:read", createdAt: Date.now() - 3_600_000, lastUsedAt: null },
  ];
  fake.calls = [];
  fake.me = { name: "ann.test1", anonymous: false, alias: null, paperclip: "paperclip.example.com", connected: true };
  mem.clear();
  host.toasts.length = 0;
  host.ctx.entityId = null;
  host.ctx.entityType = null;
  host.at("/BEH/papercliped");
  await h.link(annLogin(fake), ann);
});
afterEach(() => cleanup());

const user = () => userEvent.setup();
const radio = (name: RegExp | string) => screen.getByRole("radio", { name });

describe("the Papercliped sidebar entry", () => {
  // It must look like Paperclip's own entries: the same classes, an icon, a truncating label, and the active state on its own page.
  it("has the host's link classes, a paperclip icon and the label", () => {
    host.at("/BEH/dashboard");
    render(<PapercliedSidebar />);
    const link = screen.getByRole("link", { name: "Papercliped" });
    expect(link).toHaveAttribute("href", "/papercliped");
    for (const c of ["flex", "items-center", "gap-2.5", "mx-2", "rounded-lg", "px-2", "py-1.5", "font-medium", "text-foreground/80", "hover:bg-sidebar-accent"]) expect(link).toHaveClass(c);
    expect(link).not.toHaveAttribute("aria-current");
    const icon = link.querySelector("svg");
    expect(icon).toHaveClass("lucide-paperclip", "h-4", "w-4");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(link.querySelector("[data-slot=sidebar-nav-icon]")).toBeInTheDocument();
  });

  it("shows the active look on its own page", () => {
    host.at("/BEH/papercliped");
    render(<PapercliedSidebar />);
    const link = screen.getByRole("link", { name: "Papercliped" });
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link).toHaveClass("bg-sidebar-accent", "text-sidebar-accent-foreground");
    expect(link).not.toHaveClass("text-foreground/80");
  });
});

describe("linking", () => {
  beforeEach(() => void mem.clear());

  it("never invites the browser to fill in the user's Paperclip login", async () => {
    // The page lives on the same address as Paperclip's own sign-in, so "username" / "current-password" would make Chrome
    // offer the saved Paperclip email and password here, one click from sending that password to Papercliped.
    render(<PapercliedPage />);
    const username = await screen.findByLabelText("Username");
    const secret = screen.getByLabelText("Secret key");
    expect(username).toHaveAttribute("autocomplete", "off");
    expect(secret).toHaveAttribute("autocomplete", "new-password");
    for (const el of [username, secret]) expect(el.getAttribute("autocomplete")).not.toMatch(/^(username|current-password)$/);
  });

  it("links with username + secret key, opens the control room, and never shows the token", async () => {
    render(<PapercliedPage />);
    const u = user();
    await u.type(await screen.findByLabelText("Username"), "ann.test1");
    await u.type(screen.getByLabelText("Secret key"), "pcs_WRONG");
    await u.click(screen.getByRole("button", { name: "Link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/don't match/);
    await u.clear(screen.getByLabelText("Secret key"));
    await u.type(screen.getByLabelText("Secret key"), ANN_SECRET);
    await u.click(screen.getByRole("button", { name: "Link" }));
    expect(await screen.findByRole("heading", { name: "Control room" })).toBeInTheDocument();
    expect(document.body.innerHTML).not.toMatch(/pcb_pl_|pcs_ANN/);
  });
});

describe("the left menu", () => {
  it("lists every section in groups, and marks the one you're in", async () => {
    host.at("/BEH/papercliped", "?s=sessions");
    render(<PapercliedRouteSidebar />);
    for (const name of ["Overview", "Sessions", "Agents", "Tools", "Activity", "Settings"]) expect(screen.getByRole("link", { name })).toBeInTheDocument();
    for (const g of ["Access", "Audit", "Account"]) expect(screen.getByText(g)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sessions" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Sessions" })).toHaveClass("bg-sidebar-accent"); // same highlight as Paperclip's own menu
    expect(screen.getByRole("link", { name: "Back to Paperclip" })).toHaveAttribute("href", "/dashboard");
  });

  it("opens a section when you click it, and the page follows", async () => {
    render(<><PapercliedRouteSidebar /><PapercliedPage /></>);
    expect(await screen.findByRole("heading", { name: "Control room" })).toBeInTheDocument();
    await user().click(screen.getByRole("link", { name: "Tools" }));
    expect(await screen.findByRole("heading", { name: "Tools" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tools" })).toHaveAttribute("aria-current", "page");
  });

  it("falls back to the overview for an unknown section", async () => {
    host.at("/BEH/papercliped", "?s=nonsense");
    render(<PapercliedPage />);
    expect(await screen.findByRole("heading", { name: "Control room" })).toBeInTheDocument();
  });
});

describe("the access switch", () => {
  it("shows the three positions, Full selected by default, and says what each means", async () => {
    render(<PapercliedPage />);
    await screen.findByRole("heading", { name: "Control room" });
    const group = await screen.findByRole("radiogroup", { name: "What AI apps may do" });
    const names = within(group).getAllByRole("radio").map((r) => r.textContent);
    expect(names).toEqual(["API onlyDirect control", "FullEverything", "Agent onlyThrough agents"]);
    await waitFor(() => expect(radio(/^Full/)).toBeChecked());
    expect(screen.getByText(/This is the default for every agent/)).toBeInTheDocument();
    expect(await screen.findByText(/of 6 tools are available/)).toBeInTheDocument();
  });

  it("saves a new position at once, tells you, and the description follows", async () => {
    render(<PapercliedPage />);
    await waitFor(() => expect(radio(/^Full/)).toBeChecked());
    await user().click(radio(/^API only/));
    await waitFor(() => expect(fake.policy.mode).toBe("api"));
    expect(radio(/^API only/)).toBeChecked();
    expect(host.toasts.at(-1)).toMatchObject({ title: "Papercliped is now API only", tone: "success" });
    expect(screen.getByText(/They can't hand work to agents/)).toBeInTheDocument();
    expect(screen.getByText(/4 of 6 tools are available/)).toBeInTheDocument(); // the 2 reads and the 2 direct-control tools of the 6 sample tools
  });

  it("works from the keyboard: arrows move the selection, like a radio group", async () => {
    render(<PapercliedPage />);
    await waitFor(() => expect(radio(/^Full/)).toBeChecked());
    const full = radio(/^Full/);
    full.focus();
    await user().keyboard("{ArrowDown}");
    await waitFor(() => expect(fake.policy.mode).toBe("agent"));
    expect(radio(/^Agent only/)).toBeChecked();
    expect(radio(/^Agent only/)).toHaveFocus();
    await user().keyboard("{ArrowUp}{ArrowUp}");
    await waitFor(() => expect(fake.policy.mode).toBe("api"));
  });

  it("puts the switch back and says why when it can't save", async () => {
    render(<PapercliedPage />);
    await waitFor(() => expect(radio(/^Full/)).toBeChecked());
    fake.failPolicy = true;
    await user().click(radio(/^Agent only/));
    await waitFor(() => expect(host.toasts.at(-1)).toMatchObject({ title: "That didn't save", tone: "error" }));
    expect(radio(/^Full/)).toBeChecked();
    expect(fake.policy.mode).toBe("full");
  });

  it("counts what needs a look: a session that never connected, a blocked call, an agent turned off", async () => {
    fake.policy = { mode: "full", agents: { a2: "off" } };
    fake.calls = [{ at: Date.now() - 1000, tool: "paperclip_pause_agent", ok: false, blocked: true, status: 403, error: "policy_blocked", ms: 4, session: "g1", app: "Claude" }];
    render(<PapercliedPage />);
    expect(await screen.findByText(/hasn't made a call yet/)).toBeInTheDocument(); // ChatGPT
    expect(screen.getByText("ChatGPT", { selector: "a" })).toHaveAttribute("href", "/papercliped?s=sessions&id=g2");
    expect(await screen.findByText(/can.t see it/)).toBeInTheDocument();
    expect(screen.getByText("blocked", { selector: "a" })).toHaveAttribute("href", "/papercliped?s=activity");
  });
});

describe("sessions", () => {
  it("lists every connected app with its limits, and opens one", async () => {
    fake.connections[0] = { ...fake.connections[0], label: "Work laptop", tools: ["paperclip_list_agents"], agents: ["a1"] };
    host.at("/BEH/papercliped", "?s=sessions");
    render(<PapercliedPage />);
    const row = (await screen.findByText("Work laptop")).closest("a")!;
    expect(row).toHaveTextContent("Claude");
    expect(row).toHaveTextContent("1 tool · 1 agent");
    expect(row).toHaveTextContent("Full control");
    const other = screen.getByText("ChatGPT").closest("a")!;
    expect(other).toHaveTextContent("All tools · Everyone");
    expect(other).toHaveTextContent("Read only");
    await user().click(row);
    expect(await screen.findByRole("heading", { name: "Work laptop" })).toBeInTheDocument();
  });

  it("says so when nothing is connected, and when a session is gone", async () => {
    fake.connections = [];
    host.at("/BEH/papercliped", "?s=sessions");
    render(<PapercliedPage />);
    expect(await screen.findByText("No AI app is connected")).toBeInTheDocument();
    cleanup();
    host.at("/BEH/papercliped", "?s=sessions&id=gone");
    render(<PapercliedPage />);
    expect(await screen.findByText("That session isn't connected any more")).toBeInTheDocument();
  });

  it("names a session, limits its tools and agents, and saves exactly that", async () => {
    host.at("/BEH/papercliped", "?s=sessions&id=g1");
    render(<PapercliedPage />);
    const u = user();
    const name = await screen.findByLabelText("Name");
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled(); // nothing changed
    await u.type(name, "Work laptop");
    expect(save).toBeEnabled();
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    await u.click(screen.getByRole("checkbox", { name: /^All tools/ })); // turn "all" off
    await u.click(screen.getByRole("checkbox", { name: /Pause agent/ }));
    await u.click(screen.getByRole("checkbox", { name: /List agents/ }));
    expect(screen.getByText(/Direct control · 1\/2/)).toBeInTheDocument();
    expect(screen.getByText(/Look · 1\/2/)).toBeInTheDocument();

    await u.click(screen.getByRole("checkbox", { name: /^Everyone/ })); // turn "everyone" off
    expect(await screen.findByText(/Views across every agent, like reports and the org chart, aren't available to it/)).toBeInTheDocument();
    await u.click(await screen.findByRole("checkbox", { name: /Alpha/ }));
    await u.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(fake.connections[0]).toMatchObject({ label: "Work laptop", tools: expect.arrayContaining(["paperclip_pause_agent", "paperclip_list_agents"]), agents: ["a1"] }));
    expect(fake.connections[0].tools).toHaveLength(2);
    expect(host.toasts.at(-1)).toMatchObject({ title: "Session saved", tone: "success" });
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled(); // saved: nothing pending
  });

  it("won't save an empty tool or agent list, and says why", async () => {
    host.at("/BEH/papercliped", "?s=sessions&id=g1");
    render(<PapercliedPage />);
    const u = user();
    await u.click(await screen.findByRole("checkbox", { name: /^All tools/ }));
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Choose at least one tool, or allow all.");
    await u.click(screen.getByRole("checkbox", { name: /^All tools/ })); // back to all
    await u.click(screen.getByRole("checkbox", { name: /^Everyone/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose at least one agent, or apply to everyone.");
    expect(fake.seen.filter((s) => s.method === "POST" && s.path.includes("/sessions/")).length).toBe(0);
  });

  it("discards changes, and Read only greys out the tools that need Full control", async () => {
    host.at("/BEH/papercliped", "?s=sessions&id=g2"); // ChatGPT: Read only
    render(<PapercliedPage />);
    const u = user();
    await u.click(await screen.findByRole("checkbox", { name: /^All tools/ }));
    expect(screen.getByRole("checkbox", { name: /Pause agent/ })).toBeDisabled();
    expect(screen.getAllByText("Needs Full control").length).toBeGreaterThan(0);
    expect(screen.getByRole("checkbox", { name: /List agents/ })).toBeEnabled();
    await u.click(screen.getByRole("radio", { name: "Full control" })); // raise the level: they unlock
    expect(screen.getByRole("checkbox", { name: /Pause agent/ })).toBeEnabled();
    await u.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByRole("checkbox", { name: /^All tools/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Read only" })).toBeChecked();
  });

  it("changes the level in the same save", async () => {
    host.at("/BEH/papercliped", "?s=sessions&id=g2");
    render(<PapercliedPage />);
    const u = user();
    await u.click(await screen.findByRole("radio", { name: "Full control" }));
    await u.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fake.connections[1].level).toBe("paperclip:control"));
  });

  it("shows this session's recent calls, and disconnects after a second click, going back to the list", async () => {
    fake.calls = [
      { at: Date.now() - 5000, tool: "paperclip_pause_agent", ok: false, blocked: true, status: 403, error: "policy_blocked", ms: 3, session: "g1", app: "Claude" },
      { at: Date.now() - 9000, tool: "paperclip_list_agents", ok: true, blocked: false, status: null, error: null, ms: 8, session: "g2", app: "ChatGPT" },
    ];
    host.at("/BEH/papercliped", "?s=sessions&id=g1");
    render(<PapercliedPage />);
    const u = user();
    expect(await screen.findByText("paperclip_pause_agent")).toBeInTheDocument();
    expect(screen.queryByText("paperclip_list_agents", { selector: "span.font-mono" })).not.toBeInTheDocument(); // another session's call
    expect(screen.getAllByText("Blocked").length).toBeGreaterThan(0);
    await u.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(fake.connections).toHaveLength(2); // it asks first
    await u.click(screen.getByRole("button", { name: "Disconnect Claude" }));
    await waitFor(() => expect(fake.connections.map((c) => c.id)).toEqual(["g2"]));
    expect(await screen.findByRole("heading", { name: "Sessions" })).toBeInTheDocument();
  });
});

describe("agents", () => {
  it("gives every agent its own setting: Default, API only, Full, Agent only or Off", async () => {
    host.at("/BEH/papercliped", "?s=agents");
    render(<PapercliedPage />);
    const alpha = await screen.findByRole("radiogroup", { name: "Papercliped access for Alpha" });
    expect(within(alpha).getAllByRole("radio").map((r) => r.textContent?.trim())).toEqual(["Default", "API only", "Full", "Agent only", "Off"]);
    expect(within(alpha).getByRole("radio", { name: "Default" })).toBeChecked();
    expect(await screen.findByText(/Backend Engineer · Full \(default\)/)).toBeInTheDocument(); // once the saved settings have loaded
    expect(screen.getByText("paused")).toBeInTheDocument(); // the agent's own status, in Paperclip's own badge
  });

  it("turns an agent off, saves it, and takes it back to the default", async () => {
    host.at("/BEH/papercliped", "?s=agents");
    render(<PapercliedPage />);
    const u = user();
    const beta = await screen.findByRole("radiogroup", { name: "Papercliped access for Beta" });
    await u.click(within(beta).getByRole("radio", { name: "Off" }));
    await waitFor(() => expect(fake.policy.agents).toEqual({ a2: "off" }));
    expect(screen.getByText(/hidden from AI apps/)).toBeInTheDocument();
    expect(host.toasts.at(-1)).toMatchObject({ title: "Beta: Off" });
    await u.click(within(beta).getByRole("radio", { name: "Agent only" }));
    await waitFor(() => expect(fake.policy.agents).toEqual({ a2: "agent" }));
    await u.click(within(beta).getByRole("radio", { name: "Default" }));
    await waitFor(() => expect(fake.policy.agents).toEqual({})); // an override equal to the default is no override
  });

  it("changes the default for every agent from the same page", async () => {
    host.at("/BEH/papercliped", "?s=agents");
    render(<PapercliedPage />);
    const def = await screen.findByRole("radiogroup", { name: "Default for every agent" });
    await user().click(within(def).getByRole("radio", { name: "Agent only" }));
    await waitFor(() => expect(fake.policy.mode).toBe("agent"));
    expect(await screen.findByText(/Backend Engineer · Agent only \(default\)/)).toBeInTheDocument();
  });

  it("finds an agent, and offers to clear settings for agents that no longer exist", async () => {
    fake.policy = { mode: "full", agents: { gone: "off" } };
    host.at("/BEH/papercliped", "?s=agents");
    render(<PapercliedPage />);
    const u = user();
    await screen.findByRole("radiogroup", { name: "Papercliped access for Alpha" });
    await u.type(screen.getByLabelText("Find an agent"), "bet");
    expect(screen.queryByRole("radiogroup", { name: "Papercliped access for Alpha" })).not.toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Papercliped access for Beta" })).toBeInTheDocument();
    expect(screen.getByText(/1 setting is for agents in another company/)).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(fake.policy.agents).toEqual({}));
  });
});

describe("tools", () => {
  it("lists every tool by what it does, with what the switch allows and how many sessions can use it", async () => {
    fake.policy = { mode: "agent", agents: {} };
    host.at("/BEH/papercliped", "?s=tools");
    render(<PapercliedPage />);
    expect(await screen.findByRole("heading", { name: "Direct control" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Work through agents" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Look" })).toBeInTheDocument();
    const direct = screen.getByRole("heading", { name: "Direct control" }).closest("section")!;
    expect(within(direct).getByText("Not in Agent only")).toBeInTheDocument();
    expect(within(screen.getByRole("heading", { name: "Work through agents" }).closest("section")!).getByText("Allowed in Agent only")).toBeInTheDocument();
    // Pause agent: Claude (Full control) can; ChatGPT (Read only) can't
    const pause = within(direct).getByText("Pause agent").closest("li")!;
    expect(pause).toHaveTextContent("1 of 2 sessions");
    expect(within(direct).getByText("Terminate agent").closest("li")).toHaveTextContent("Destructive");
    const look = within(screen.getByRole("heading", { name: "Look" }).closest("section")!);
    expect(look.getByText("List agents").closest("li")).toHaveTextContent("2 of 2 sessions");
  });

  it("filters the list", async () => {
    host.at("/BEH/papercliped", "?s=tools");
    render(<PapercliedPage />);
    await user().type(await screen.findByLabelText("Find a tool"), "terminate");
    expect(screen.getByText("Terminate agent")).toBeInTheDocument();
    expect(screen.queryByText("List agents")).not.toBeInTheDocument();
    await user().clear(screen.getByLabelText("Find a tool"));
    await user().type(screen.getByLabelText("Find a tool"), "zzz");
    expect(await screen.findByText("No tools match.")).toBeInTheDocument();
  });
});

describe("activity", () => {
  const calls = () => [
    { at: Date.now() - 1000, tool: "paperclip_pause_agent", ok: false, blocked: true, status: 403, error: "policy_blocked", ms: 4, session: "g1", app: "Claude" },
    { at: Date.now() - 2000, tool: "paperclip_list_agents", ok: true, blocked: false, status: null, error: null, ms: 12, session: "g2", app: "ChatGPT" },
    { at: Date.now() - 3000, tool: "paperclip_get_issue", ok: false, blocked: false, status: 502, error: "upstream_unreachable", ms: 900, session: "g1", app: "Claude" },
  ];

  it("shows each call with its session, tool and result, and says why one failed", async () => {
    fake.calls = calls();
    host.at("/BEH/papercliped", "?s=activity");
    render(<PapercliedPage />);
    const row = (await screen.findByText("paperclip_pause_agent")).closest("tr")!;
    expect(row).toHaveTextContent("Claude");
    expect(row).toHaveTextContent("Blocked");
    expect(row).toHaveTextContent("Blocked by your settings");
    expect(screen.getByText("paperclip_get_issue").closest("tr")).toHaveTextContent("Paperclip unreachable");
    expect(screen.getByText("paperclip_list_agents").closest("tr")).toHaveTextContent("OK");
  });

  it("filters by session and to blocked or failed only", async () => {
    fake.calls = calls();
    host.at("/BEH/papercliped", "?s=activity");
    render(<PapercliedPage />);
    const u = user();
    await screen.findByText("paperclip_list_agents");
    await u.click(screen.getByRole("checkbox", { name: /Only blocked or failed/ }));
    expect(screen.queryByText("paperclip_list_agents")).not.toBeInTheDocument();
    expect(screen.getByText("paperclip_pause_agent")).toBeInTheDocument();
    await u.click(screen.getByRole("checkbox", { name: /Only blocked or failed/ }));
    await u.selectOptions(screen.getByLabelText("Session"), "g2");
    await waitFor(() => expect(screen.queryByText("paperclip_pause_agent")).not.toBeInTheDocument());
    expect(screen.getByText("paperclip_list_agents")).toBeInTheDocument();
  });

  it("is empty when nothing has happened", async () => {
    host.at("/BEH/papercliped", "?s=activity");
    render(<PapercliedPage />);
    expect(await screen.findByText("No calls yet")).toBeInTheDocument();
  });
});

describe("settings", () => {
  it("shows the service status, switches anonymity, lists links, and makes a new secret key shown once", async () => {
    host.at("/BEH/papercliped", "?s=settings");
    render(<PapercliedPage />);
    const u = user();
    expect(await screen.findByText("All systems normal")).toBeInTheDocument();
    expect(screen.getByText("People: 42")).toBeInTheDocument();
    await u.click(await screen.findByRole("checkbox"));
    expect(await screen.findByText("On: you appear as Ann02")).toBeInTheDocument();
    expect(await screen.findByText("This one")).toBeInTheDocument();
    const rotate = screen.getAllByRole("button", { name: "Make a new secret key" })[0];
    await u.click(rotate);
    await u.type(screen.getByLabelText("Secret key to confirm: Make a new secret key"), "pcs_WRONG");
    await u.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not right/);
    await u.clear(screen.getByLabelText("Secret key to confirm: Make a new secret key"));
    await u.type(screen.getByLabelText("Secret key to confirm: Make a new secret key"), fake.secret);
    await u.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("pcs_NEW1-NEW2-NEW3-NEW4")).toBeInTheDocument();
    expect((mem.get(k(linkScope("user-ann"))) as any).token).toMatch(/^pcb_pl_/); // still linked
  });

  it("deleting the account needs the username and goes back to the link form", async () => {
    host.at("/BEH/papercliped", "?s=settings");
    render(<PapercliedPage />);
    const u = user();
    await u.click((await screen.findAllByRole("button", { name: "Delete my account" }))[0]);
    await u.type(screen.getByLabelText("Secret key to confirm: Delete my account"), fake.secret);
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled(); // the username too
    await u.type(screen.getByLabelText("Type your username to confirm"), "ann.test1");
    await u.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByLabelText("Username")).toBeInTheDocument();
    expect(fake.deleted).toBe(true);
    expect(mem.get(k(linkScope("user-ann")))).toBeUndefined();
  });
});

describe("on an agent's page", () => {
  beforeEach(() => {
    host.ctx.entityId = "a2";
    host.ctx.entityType = "agent";
    host.at("/BEH/agents/beta");
  });

  it("sets what Papercliped may do with this agent, and says what that means", async () => {
    render(<PapercliedAgentTab />);
    const group = await screen.findByRole("radiogroup", { name: "Papercliped access for this agent" });
    expect(within(group).getByRole("radio", { name: "Default" })).toBeChecked();
    expect(await screen.findByText("Right now: Full (the default).")).toBeInTheDocument();
    await user().click(within(group).getByRole("radio", { name: "Off" }));
    await waitFor(() => expect(fake.policy.agents).toEqual({ a2: "off" }));
    expect(await screen.findByText("AI apps can't see this agent or anything assigned to it.")).toBeInTheDocument();
    expect(screen.getByText("None: this agent is off.")).toBeInTheDocument();
  });

  it("lists the sessions that reach this agent, and not the ones limited to others", async () => {
    fake.connections[0] = { ...fake.connections[0], label: "Only Alpha", agents: ["a1"] };
    render(<PapercliedAgentTab />);
    const section = (await screen.findByRole("heading", { name: "Sessions" })).closest("section")!;
    await waitFor(() => expect(within(section).getByText("ChatGPT")).toBeInTheDocument());
    expect(within(section).queryByText("Only Alpha")).not.toBeInTheDocument();
  });

  it("asks you to link first when you haven't", async () => {
    mem.clear();
    render(<PapercliedAgentTab />);
    expect(await screen.findByText(/Link your Papercliped account to choose what AI apps may do with this agent/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Papercliped" })).toHaveAttribute("href", "/papercliped");
  });
});

describe("on the dashboard", () => {
  it("shows the switch in small, the session count and what was blocked, and changes the mode", async () => {
    fake.calls = [{ at: Date.now() - 1000, tool: "paperclip_pause_agent", ok: false, blocked: true, status: 403, error: "policy_blocked", ms: 4, session: "g1", app: "Claude" }];
    host.at("/BEH/dashboard");
    render(<PapercliedWidget />);
    const group = await screen.findByRole("radiogroup", { name: "What AI apps may do" });
    await waitFor(() => expect(within(group).getByRole("radio", { name: "Full" })).toBeChecked());
    expect(await screen.findByText("2 sessions")).toBeInTheDocument();
    expect(await screen.findByText("1 blocked today")).toBeInTheDocument();
    await user().click(within(group).getByRole("radio", { name: "Agent only" }));
    await waitFor(() => expect(fake.policy.mode).toBe("agent"));
    expect(screen.getByRole("link", { name: "Control room" })).toHaveAttribute("href", "/papercliped");
  });

  it("puts the switch back when the save fails", async () => {
    render(<PapercliedWidget />);
    const group = await screen.findByRole("radiogroup", { name: "What AI apps may do" });
    await waitFor(() => expect(within(group).getByRole("radio", { name: "Full" })).toBeChecked());
    fake.failPolicy = true;
    await user().click(within(group).getByRole("radio", { name: "API only" }));
    await waitFor(() => expect(host.toasts.at(-1)).toMatchObject({ tone: "error" }));
    expect(within(group).getByRole("radio", { name: "Full" })).toBeChecked();
  });

  it("invites you to link when you haven't", async () => {
    mem.clear();
    render(<PapercliedWidget />);
    expect(await screen.findByText(/Link your Papercliped account to control what AI apps may do/)).toBeInTheDocument();
  });
});
