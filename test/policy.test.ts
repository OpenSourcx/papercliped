import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { guardClient } from "../src/access/guard.js";
import {
  DEFAULT_ACCOUNT_POLICY,
  DEFAULT_SESSION_POLICY,
  PolicyInputError,
  canEverRun,
  evaluate,
  narrowAgentList,
  parseAccountPolicy,
  parseSessionPolicy,
  readAccountPolicy,
  readSessionPolicy,
  redactAgents,
  surfaceOf,
  surfaceOfTool,
  type AccountPolicy,
  type ExecPolicy,
  type SessionPolicy,
} from "../src/access/policy.js";
import { PaperclipClient } from "../src/client.js";
import { visibleTools } from "../src/mcp.js";
import { toolsByName, tools } from "../src/tools.js";

const KNOWN = new Set(tools.map((t) => t.name));
const T = (name: string) => toolsByName.get(name)!;
const pol = (account: Partial<AccountPolicy> = {}, session: Partial<SessionPolicy> = {}): ExecPolicy => ({
  account: { ...DEFAULT_ACCOUNT_POLICY, agents: {}, ...account },
  session: { ...DEFAULT_SESSION_POLICY, ...session },
});
const run = (p: ExecPolicy, name: string, input: Record<string, unknown> = {}, issueAgent?: string | null) => evaluate(p, T(name), input, issueAgent);

describe("surfaces: every tool is exactly one of read, agent work, or direct control", () => {
  it("classifies the whole catalogue", () => {
    const by = (s: string) => tools.filter((t) => surfaceOfTool(t) === s).map((t) => t.name).sort();
    expect(by("agent")).toEqual(["paperclip_comment_issue", "paperclip_create_issue", "paperclip_update_issue", "paperclip_wake_agent"]);
    expect(by("api")).toEqual(["paperclip_api_request", "paperclip_clear_agent_error", "paperclip_create_goal", "paperclip_decide_approval", "paperclip_pause_agent", "paperclip_resume_agent", "paperclip_set_agent_budget", "paperclip_terminate_agent", "paperclip_update_goal"]);
    expect(by("read").length).toBe(tools.length - 4 - 9);
    for (const t of tools) if (t.access === "read") expect(surfaceOfTool(t), t.name).toBe("read");
  });
  it("the raw API tool is a read for GET and direct control for anything else", () => {
    expect(surfaceOf(T("paperclip_api_request"), { method: "GET" })).toBe("read");
    for (const m of ["POST", "PATCH", "DELETE"]) expect(surfaceOf(T("paperclip_api_request"), { method: m })).toBe("api");
  });
});

describe("the access switch", () => {
  it("Full allows everything, and is the default", () => {
    expect(DEFAULT_ACCOUNT_POLICY.mode).toBe("full");
    for (const t of tools) expect(run(pol(), t.name, { agentId: "a1", issueId: "i1", method: "POST" }), t.name).toBeNull();
  });

  it("API only: direct control and reads, no handing work to agents", () => {
    const p = pol({ mode: "api" });
    expect(run(p, "paperclip_pause_agent", { agentId: "a1" })).toBeNull();
    expect(run(p, "paperclip_decide_approval", { approvalId: "x" })).toBeNull();
    expect(run(p, "paperclip_list_agents")).toBeNull();
    for (const n of ["paperclip_create_issue", "paperclip_update_issue", "paperclip_comment_issue", "paperclip_wake_agent"]) {
      expect(run(p, n, { title: "t", issueId: "i", body: "b", agentId: "a1" })?.code, n).toBe("mode_blocks");
    }
  });

  it("Agent only: work through agents and reads, no direct control", () => {
    const p = pol({ mode: "agent" });
    expect(run(p, "paperclip_create_issue", { title: "t", assigneeAgentId: "a1" })).toBeNull();
    expect(run(p, "paperclip_wake_agent", { agentId: "a1" })).toBeNull();
    expect(run(p, "paperclip_get_agent", { agentId: "a1" })).toBeNull();
    for (const n of ["paperclip_pause_agent", "paperclip_resume_agent", "paperclip_terminate_agent", "paperclip_set_agent_budget", "paperclip_create_goal", "paperclip_decide_approval"]) {
      expect(run(p, n, { agentId: "a1", approvalId: "x", title: "t" })?.code, n).toBe("mode_blocks");
    }
    expect(run(p, "paperclip_api_request", { method: "POST", path: "/x" })?.code).toBe("mode_blocks");
    expect(run(p, "paperclip_api_request", { method: "GET", path: "/x" })).toBeNull();
  });

  it("a per-agent override beats the default, in both directions", () => {
    const p = pol({ mode: "full", agents: { a1: "agent", a2: "api" } });
    expect(run(p, "paperclip_pause_agent", { agentId: "a1" })?.code).toBe("mode_blocks"); // a1 is Agent only
    expect(run(p, "paperclip_wake_agent", { agentId: "a1" })).toBeNull();
    expect(run(p, "paperclip_wake_agent", { agentId: "a2" })?.code).toBe("mode_blocks"); // a2 is API only
    expect(run(p, "paperclip_pause_agent", { agentId: "a2" })).toBeNull();
    expect(run(p, "paperclip_pause_agent", { agentId: "a3" })).toBeNull(); // not listed: follows the default
    const q = pol({ mode: "api", agents: { a1: "full" } });
    expect(run(q, "paperclip_create_issue", { title: "t", assigneeAgentId: "a1" })).toBeNull();
    expect(run(q, "paperclip_create_issue", { title: "t", assigneeAgentId: "a2" })?.code).toBe("mode_blocks");
  });

  it("Off hides an agent completely: even reading it is refused", () => {
    const p = pol({ agents: { a1: "off" } });
    for (const n of ["paperclip_get_agent", "paperclip_pause_agent", "paperclip_wait_for_agent"]) expect(run(p, n, { agentId: "a1" })?.code, n).toBe("agent_off");
    expect(run(p, "paperclip_create_issue", { title: "t", assigneeAgentId: "a1" })?.code).toBe("agent_off");
    expect(run(p, "paperclip_get_agent", { agentId: "a2" })).toBeNull();
  });

  it("an issue is judged by the agent it is assigned to", () => {
    const p = pol({ agents: { a1: "agent" } });
    expect(run(p, "paperclip_update_issue", { issueId: "i1" }, "a1")).toBeNull(); // agent work on an Agent-only agent
    const q = pol({ agents: { a1: "api" } });
    expect(run(q, "paperclip_comment_issue", { issueId: "i1", body: "b" }, "a1")?.code).toBe("mode_blocks");
    expect(run(pol({ agents: { a1: "off" } }), "paperclip_get_issue", { issueId: "i1" }, "a1")?.code).toBe("agent_off");
  });

  it("every refusal says what to do and where", () => {
    const d = run(pol({ mode: "agent" }), "paperclip_pause_agent", { agentId: "a1" })!;
    expect(d.message).toMatch(/Agent only/);
    expect(d.message).toMatch(/Papercliped page inside Paperclip/);
  });
});

describe("one session's limits", () => {
  it("a tool list allows only those tools", () => {
    const p = pol({}, { tools: ["paperclip_list_agents", "paperclip_pause_agent"] });
    expect(run(p, "paperclip_list_agents")).toBeNull();
    expect(run(p, "paperclip_pause_agent", { agentId: "a1" })).toBeNull();
    expect(run(p, "paperclip_resume_agent", { agentId: "a1" })?.code).toBe("tool_not_allowed");
    expect(run(p, "paperclip_org_chart")?.code).toBe("tool_not_allowed");
  });

  it("a session for selected agents only touches those agents", () => {
    const p = pol({}, { agents: ["a1"] });
    expect(run(p, "paperclip_pause_agent", { agentId: "a1" })).toBeNull();
    expect(run(p, "paperclip_pause_agent", { agentId: "a2" })?.code).toBe("agent_not_in_session");
    expect(run(p, "paperclip_create_issue", { title: "t", assigneeAgentId: "a1" })).toBeNull();
    expect(run(p, "paperclip_create_issue", { title: "t", assigneeAgentId: "a2" })?.code).toBe("agent_not_in_session");
    expect(run(p, "paperclip_list_issues", { assigneeAgentId: "a1" })).toBeNull();
  });

  it("…and refuses what would look across every agent, saying why", () => {
    const p = pol({}, { agents: ["a1"] });
    for (const n of ["paperclip_org_chart", "paperclip_report_costs", "paperclip_sync_snapshot", "paperclip_list_approvals", "paperclip_list_goals", "paperclip_report_status"]) {
      expect(run(p, n)?.code, n).toBe("needs_all_agents");
    }
    expect(run(p, "paperclip_list_issues", {})?.code).toBe("needs_all_agents"); // no agent named
    expect(run(p, "paperclip_create_issue", { title: "t" })?.code).toBe("needs_all_agents"); // no assignee to check
    for (const n of ["paperclip_list_agents", "paperclip_list_companies", "papercliped_service_status"]) expect(run(p, n), n).toBeNull();
  });

  it("issues are judged by their assignee; an unassigned or unknown one is refused for a limited session", () => {
    const p = pol({}, { agents: ["a1"] });
    expect(run(p, "paperclip_comment_issue", { issueId: "i", body: "b" }, "a1")).toBeNull();
    expect(run(p, "paperclip_comment_issue", { issueId: "i", body: "b" }, "a2")?.code).toBe("agent_not_in_session");
    expect(run(p, "paperclip_get_issue", { issueId: "i" }, null)?.code).toBe("needs_all_agents");
    expect(run(p, "paperclip_get_issue", { issueId: "i" }, undefined)?.code).toBe("needs_all_agents");
  });

  it("the account switch still applies inside a session, and the strictest layer wins", () => {
    const p = pol({ mode: "agent", agents: { a1: "off" } }, { agents: ["a1", "a2"], tools: ["paperclip_pause_agent", "paperclip_wake_agent"] });
    expect(run(p, "paperclip_pause_agent", { agentId: "a2" })?.code).toBe("mode_blocks");
    expect(run(p, "paperclip_wake_agent", { agentId: "a1" })?.code).toBe("agent_off");
    expect(run(p, "paperclip_wake_agent", { agentId: "a2" })).toBeNull();
    expect(run(p, "paperclip_wake_agent", { agentId: "a3" })?.code).toBe("agent_not_in_session");
  });

  it("narrows the agent list to the session's agents", () => {
    const all = [{ id: "a1" }, { id: "a2" }, { id: "a3" }];
    expect(narrowAgentList(all, ["a1", "a3"])).toEqual([{ id: "a1" }, { id: "a3" }]);
    expect(narrowAgentList({ agents: all, n: 3 }, ["a2"])).toEqual({ agents: [{ id: "a2" }], n: 3 });
    expect(narrowAgentList("odd", ["a1"])).toBe("odd");
  });
});

describe("hiding agents", () => {
  const data = {
    agents: [{ id: "a1", name: "Alpha" }, { id: "a2", name: "Beta" }],
    byAgent: [{ agentId: "a1", cents: 5 }, { agentId: "a2", cents: 7 }],
    issues: [{ id: "i1", assigneeAgentId: "a2" }, { id: "i2", assigneeAgentId: "a1" }, { id: "i3", assigneeAgentId: null }],
    perAgent: { a1: 1, a2: 2 },
  };
  it("removes every record of a hidden agent, wherever it sits", () => {
    expect(redactAgents(data, new Set(["a2"]))).toEqual({
      agents: [{ id: "a1", name: "Alpha" }],
      byAgent: [{ agentId: "a1", cents: 5 }],
      issues: [{ id: "i2", assigneeAgentId: "a1" }, { id: "i3", assigneeAgentId: null }],
      perAgent: { a1: 1 },
    });
  });
  it("leaves everything alone when nothing is hidden, and never mutates its input", () => {
    expect(redactAgents(data, new Set())).toBe(data);
    const copy = JSON.stringify(data);
    redactAgents(data, new Set(["a1", "a2"]));
    expect(JSON.stringify(data)).toBe(copy);
  });
  it("a guarded client never hands a tool a hidden agent", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
    const client = new PaperclipClient({ apiUrl: "https://p.example/api", apiKey: "k", companyId: "c", readOnly: false, timeoutMs: 1000 }, fetchImpl);
    const g = guardClient(client, new Set(["a2"]));
    for (const read of [() => g.get<typeof data>("/x"), () => g.post<typeof data>("/x", {}), () => g.request<typeof data>("GET", "/x")]) {
      const got = await read();
      expect(JSON.stringify(got)).not.toContain("a2");
      expect(JSON.stringify(got)).toContain("a1");
    }
    expect(guardClient(client, new Set())).toBe(client);
    expect(g.resolveCompanyId()).toBe("c"); // everything else about the client still works
  });
});

describe("what the AI is shown", () => {
  it("hides tools the session or switch can never allow", () => {
    expect(visibleTools(["paperclip:control"], pol()).length).toBe(tools.length);
    const names = (p: ExecPolicy) => new Set(visibleTools(["paperclip:control"], p).map((t) => t.name));
    expect(names(pol({ mode: "agent" })).has("paperclip_pause_agent")).toBe(false);
    expect(names(pol({ mode: "agent" })).has("paperclip_create_issue")).toBe(true);
    expect(names(pol({ mode: "api" })).has("paperclip_create_issue")).toBe(false);
    expect(names(pol({ mode: "api" })).has("paperclip_api_request")).toBe(true);
    // an agent set to a different mode keeps the tool visible: some calls can still run
    expect(names(pol({ mode: "agent", agents: { a1: "full" } })).has("paperclip_pause_agent")).toBe(true);
    expect([...names(pol({}, { tools: ["paperclip_list_agents"] }))]).toEqual(["paperclip_list_agents"]);
    const limited = names(pol({}, { agents: ["a1"] }));
    expect(limited.has("paperclip_pause_agent")).toBe(true);
    expect(limited.has("paperclip_org_chart")).toBe(false);
    expect(limited.has("paperclip_report_costs")).toBe(false);
    expect(canEverRun(pol({ mode: "api" }), T("paperclip_wake_agent"))).toBe(false);
  });
});

describe("validating what the control room sends", () => {
  it("accepts a good account policy and drops overrides equal to the default", () => {
    expect(parseAccountPolicy({ mode: "agent", agents: { a1: "off", a2: "agent", a3: "full" } })).toEqual({ mode: "agent", agents: { a1: "off", a3: "full" } });
    expect(parseAccountPolicy({})).toEqual({ mode: "full", agents: {} });
  });
  it("refuses anything else", () => {
    for (const bad of [{ mode: "everything" }, { mode: 1 }, { agents: [] }, { agents: { a1: "on" } }, { agents: { "bad id!": "off" } }, { agents: "a1" }]) {
      expect(() => parseAccountPolicy(bad), JSON.stringify(bad)).toThrow(PolicyInputError);
    }
    expect(() => parseAccountPolicy({ agents: Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`a${i}`, "off"])) })).toThrow(/at most/);
  });
  it("accepts a good session policy, trims and bounds the name", () => {
    expect(parseSessionPolicy({ label: "  My   phone  ", tools: ["paperclip_list_agents"], agents: ["a1", "a1"] }, KNOWN)).toEqual({ label: "My phone", tools: ["paperclip_list_agents"], agents: ["a1"] });
    expect(parseSessionPolicy({ label: "x".repeat(200) }, KNOWN).label?.length).toBe(60);
    expect(parseSessionPolicy({}, KNOWN)).toEqual({ label: null, tools: null, agents: null });
    expect(parseSessionPolicy({ label: "   " }, KNOWN).label).toBeNull();
  });
  it("refuses unknown tools, empty lists and wrong types", () => {
    for (const bad of [{ tools: ["rm_rf"] }, { tools: [] }, { agents: [] }, { tools: "paperclip_list_agents" }, { label: 5 }, { agents: ["bad id!"] }]) {
      expect(() => parseSessionPolicy(bad, KNOWN), JSON.stringify(bad)).toThrow(PolicyInputError);
    }
  });
  it("falls back to the safe default on a damaged stored policy instead of failing the call", () => {
    expect(readAccountPolicy("{not json")).toEqual({ mode: "full", agents: {} });
    expect(readAccountPolicy({ mode: "nonsense" })).toEqual({ mode: "full", agents: {} });
    expect(readAccountPolicy(null)).toEqual({ mode: "full", agents: {} });
    expect(readSessionPolicy({ tools: ["gone_tool"] }, KNOWN)).toEqual({ label: null, tools: null, agents: null });
    expect(readSessionPolicy(null, KNOWN)).toEqual({ label: null, tools: null, agents: null });
  });
});

describe("the docs say what the code does", () => {
  const doc = readFileSync(new URL("../site/docs/access-modes.md", import.meta.url), "utf8");
  const row = (kind: string) => doc.split("\n").find((l) => l.startsWith(`| **${kind}**`)) ?? "";
  it("lists exactly the tools of each kind (a tool added or moved without updating the guide fails here)", () => {
    const agentRow = row("Work through agents");
    const apiRow = row("Direct control");
    expect(agentRow).not.toBe("");
    expect(apiRow).not.toBe("");
    for (const t of tools) {
      const s = surfaceOfTool(t);
      if (t.name === "paperclip_api_request") continue; // described as "raw API requests that aren't GET"
      expect(agentRow.includes(t.title), `${t.title} in the agent row`).toBe(s === "agent");
      expect(apiRow.includes(t.title), `${t.title} in the direct-control row`).toBe(s === "api");
    }
    expect(apiRow).toMatch(/raw API requests that aren't `GET`/);
  });
  it("names every refusal code the engine can return", () => {
    for (const code of ["tool_not_allowed", "mode_blocks", "agent_off", "agent_not_in_session", "needs_all_agents"]) expect(doc, code).toContain(`\`${code}\``);
  });
  it("the tool reference shows each tool's kind", () => {
    const md = readFileSync(new URL("../site/docs/tools.md", import.meta.url), "utf8");
    expect(md).toContain("Works in");
    for (const t of tools) {
      const line = md.split("\n").find((l) => l.startsWith("| **") && l.includes(`\`${t.name}\``)) ?? "";
      const want = t.name === "paperclip_api_request" ? "GET: every mode; other methods: Full, API only" : { read: "Every mode", agent: "Full, Agent only", api: "Full, API only" }[surfaceOfTool(t)];
      expect(line, t.name).toContain(want);
    }
  });
});
