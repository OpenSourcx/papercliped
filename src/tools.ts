import { z } from "zod";
import { PaperclipClient } from "./client.js";
import { ToolInputError } from "./errors.js";
import { activityDigest, agentPerformanceReport, costReport, statusReport } from "./reports.js";

/** read: no side effects · write: mutates Paperclip · destructive: irreversible, needs confirm. */
export type Access = "read" | "write" | "destructive";

export interface ToolDef<S extends z.ZodObject<any> = z.ZodObject<any>> {
  name: string;
  title: string;
  description: string;
  access: Access;
  schema: S;
  run: (client: PaperclipClient, input: z.infer<S>) => Promise<unknown>;
}

function tool<S extends z.ZodObject<any>>(def: ToolDef<S>): ToolDef {
  return def as unknown as ToolDef;
}

const asArray = (v: any): any[] =>
  Array.isArray(v) ? v : Array.isArray(v?.items) ? v.items : Array.isArray(v?.data) ? v.data : [];

const company = z.string().optional().describe("Company ID. Defaults to PAPERCLIP_COMPANY_ID.");
const id = (what: string) => z.string().min(1).describe(`${what} ID`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ISSUE_STATUSES = ["backlog", "todo", "in_progress", "in_review", "blocked", "done", "cancelled"] as const;

export const tools: ToolDef[] = [
  // ───────────────────────────── discovery ─────────────────────────────
  tool({
    name: "paperclip_list_companies",
    title: "List companies",
    description: "List the companies the credential can access. Use this first to find a companyId.",
    access: "read",
    schema: z.object({}),
    run: (c) => c.get("/companies"),
  }),
  tool({
    name: "paperclip_org_chart",
    title: "Org chart",
    description: "Return the company's full agent org tree (who reports to whom).",
    access: "read",
    schema: z.object({ companyId: company }),
    run: (c, i) => c.get(`/companies/${c.resolveCompanyId(i.companyId)}/org`),
  }),

  // ───────────────────────────── agent control ─────────────────────────────
  tool({
    name: "paperclip_list_agents",
    title: "List agents",
    description: "List all agents in a company with status, role and budget/spend.",
    access: "read",
    schema: z.object({ companyId: company }),
    run: (c, i) => c.get(`/companies/${c.resolveCompanyId(i.companyId)}/agents`),
  }),
  tool({
    name: "paperclip_get_agent",
    title: "Get agent",
    description: "Get one agent including its chain of command and current status.",
    access: "read",
    schema: z.object({ agentId: id("Agent") }),
    run: (c, i) => c.get(`/agents/${i.agentId}`),
  }),
  tool({
    name: "paperclip_pause_agent",
    title: "Pause agent",
    description: "Pause an agent: stops its heartbeats and cancels its active run. Reversible with resume.",
    access: "write",
    schema: z.object({ agentId: id("Agent") }),
    run: (c, i) => c.post(`/agents/${i.agentId}/pause`),
  }),
  tool({
    name: "paperclip_resume_agent",
    title: "Resume agent",
    description: "Resume a paused agent so heartbeats start again.",
    access: "write",
    schema: z.object({ agentId: id("Agent") }),
    run: (c, i) => c.post(`/agents/${i.agentId}/resume`),
  }),
  tool({
    name: "paperclip_clear_agent_error",
    title: "Clear agent error",
    description: "Move an agent from `error` back to `idle`. Keeps run history. Only valid for agents in error.",
    access: "write",
    schema: z.object({ agentId: id("Agent") }),
    run: (c, i) => c.post(`/agents/${i.agentId}/clear-error`),
  }),
  tool({
    name: "paperclip_wake_agent",
    title: "Wake agent now",
    description: "Manually trigger a heartbeat so the agent starts working immediately.",
    access: "write",
    schema: z.object({ agentId: id("Agent") }),
    // /wakeup is Paperclip's current route (in every release since 2026.318); /heartbeat/invoke is its legacy alias. /wakeup needs a JSON body.
    run: (c, i) => c.post(`/agents/${i.agentId}/wakeup`, { source: "on_demand", triggerDetail: "manual" }),
  }),
  tool({
    name: "paperclip_set_agent_budget",
    title: "Set agent budget",
    description: "Set an agent's monthly budget in US cents (e.g. 5000 = $50). Agents auto-pause at 100%.",
    access: "write",
    schema: z.object({ agentId: id("Agent"), budgetMonthlyCents: z.number().int().min(0) }),
    run: (c, i) => c.patch(`/agents/${i.agentId}`, { budgetMonthlyCents: i.budgetMonthlyCents }),
  }),
  tool({
    name: "paperclip_terminate_agent",
    title: "Terminate agent",
    description:
      "PERMANENTLY deactivate an agent. Irreversible. Requires confirm=true; ask the human first and prefer pause.",
    access: "destructive",
    schema: z.object({
      agentId: id("Agent"),
      confirm: z.literal(true).describe("Must be true. Only set after the human explicitly approved."),
    }),
    run: (c, i) => c.post(`/agents/${i.agentId}/terminate`),
  }),

  // ───────────────────────────── goals / work ─────────────────────────────
  tool({
    name: "paperclip_list_goals",
    title: "List goals",
    description: "List the goal hierarchy for a company.",
    access: "read",
    schema: z.object({ companyId: company }),
    run: (c, i) => c.get(`/companies/${c.resolveCompanyId(i.companyId)}/goals`),
  }),
  tool({
    name: "paperclip_create_goal",
    title: "Create goal",
    description: "Create a goal. level is one of company/team/agent/task (default task).",
    access: "write",
    schema: z.object({
      companyId: company,
      title: z.string().min(1),
      description: z.string().optional(),
      level: z.string().optional(),
      status: z.enum(["planned", "active", "achieved", "cancelled"]).optional(),
      parentId: z.string().optional(),
      ownerAgentId: z.string().optional(),
    }),
    run: (c, { companyId, ...body }) => c.post(`/companies/${c.resolveCompanyId(companyId)}/goals`, body),
  }),
  tool({
    name: "paperclip_update_goal",
    title: "Update goal",
    description: "Update a goal's title, description or status (planned/active/achieved/cancelled).",
    access: "write",
    schema: z.object({
      goalId: id("Goal"),
      title: z.string().optional(),
      description: z.string().optional(),
      status: z.enum(["planned", "active", "achieved", "cancelled"]).optional(),
    }),
    run: (c, { goalId, ...body }) => c.patch(`/goals/${goalId}`, body),
  }),
  tool({
    name: "paperclip_list_projects",
    title: "List projects",
    description: "List projects in a company.",
    access: "read",
    schema: z.object({ companyId: company }),
    run: (c, i) => c.get(`/companies/${c.resolveCompanyId(i.companyId)}/projects`),
  }),
  tool({
    name: "paperclip_list_issues",
    title: "List issues",
    description: "List issues/tasks. status may be comma-separated, e.g. 'todo,in_progress'.",
    access: "read",
    schema: z.object({
      companyId: company,
      status: z.string().optional(),
      assigneeAgentId: z.string().optional(),
      projectId: z.string().optional(),
      q: z.string().optional().describe("Free-text search"),
    }),
    run: (c, { companyId, ...query }) => c.get(`/companies/${c.resolveCompanyId(companyId)}/issues`, query),
  }),
  tool({
    name: "paperclip_get_issue",
    title: "Get issue",
    description: "Get an issue with project, goal, ancestors and plan document.",
    access: "read",
    schema: z.object({ issueId: id("Issue") }),
    run: (c, i) => c.get(`/issues/${i.issueId}`),
  }),
  tool({
    name: "paperclip_create_issue",
    title: "Create issue",
    description:
      "Create a task. Assigning it to an agent (assigneeAgentId) with status 'todo' is how you hand work to that agent.",
    access: "write",
    schema: z.object({
      companyId: company,
      title: z.string().min(1),
      description: z.string().optional(),
      status: z.enum(ISSUE_STATUSES).optional(),
      priority: z.string().optional(),
      assigneeAgentId: z.string().optional(),
      parentId: z.string().optional(),
      projectId: z.string().optional(),
      goalId: z.string().optional(),
    }),
    run: (c, { companyId, ...body }) => c.post(`/companies/${c.resolveCompanyId(companyId)}/issues`, body),
  }),
  tool({
    name: "paperclip_update_issue",
    title: "Update issue",
    description: "Change an issue's status, priority, assignee, title etc. Optional `comment` is added in the same call.",
    access: "write",
    schema: z.object({
      issueId: id("Issue"),
      title: z.string().optional(),
      description: z.string().optional(),
      status: z.enum(ISSUE_STATUSES).optional(),
      priority: z.string().optional(),
      assigneeAgentId: z.string().optional(),
      projectId: z.string().optional(),
      goalId: z.string().optional(),
      comment: z.string().optional(),
    }),
    run: (c, { issueId, ...body }) => c.patch(`/issues/${issueId}`, body),
  }),
  tool({
    name: "paperclip_comment_issue",
    title: "Comment on issue",
    description: "Add a markdown comment to an issue. Can wake the current assignee.",
    access: "write",
    schema: z.object({ issueId: id("Issue"), body: z.string().min(1) }),
    run: (c, i) => c.post(`/issues/${i.issueId}/comments`, { body: i.body }),
  }),
  tool({
    name: "paperclip_list_approvals",
    title: "List approvals",
    description: "List approval requests (hires, plans, budget overrides). Filter client-side by status if needed.",
    access: "read",
    schema: z.object({ companyId: company, status: z.string().optional() }),
    run: (c, { companyId, status }) => c.get(`/companies/${c.resolveCompanyId(companyId)}/approvals`, { status }),
  }),
  tool({
    name: "paperclip_decide_approval",
    title: "Decide approval",
    description: "Approve, reject, or request revision on an approval. Decisions bind agents, so confirm with the human.",
    access: "write",
    schema: z.object({
      approvalId: id("Approval"),
      decision: z.enum(["approve", "reject", "request-revision"]),
      decisionNote: z.string().optional(),
    }),
    run: (c, i) => c.post(`/approvals/${i.approvalId}/${i.decision}`, { decisionNote: i.decisionNote ?? null }),
  }),

  // ───────────────────────────── sync ─────────────────────────────
  tool({
    name: "paperclip_sync_snapshot",
    title: "Sync snapshot",
    description:
      "One-call picture of the company right now: dashboard counters, every agent's status, and live runs. Call at the start of a session to sync with the agents.",
    access: "read",
    schema: z.object({ companyId: company }),
    run: async (c, i) => {
      const cid = c.resolveCompanyId(i.companyId);
      const [dashboard, agents, liveRuns] = await Promise.all([
        c.get(`/companies/${cid}/dashboard`),
        c.get(`/companies/${cid}/agents`),
        c.get(`/companies/${cid}/live-runs`).catch(() => []),
      ]);
      return {
        syncedAt: new Date().toISOString(),
        dashboard,
        agents: asArray(agents).map((a) => ({
          id: a.id,
          name: a.name,
          role: a.role,
          status: a.status,
          spentMonthlyCents: a.spentMonthlyCents,
          budgetMonthlyCents: a.budgetMonthlyCents,
        })),
        liveRuns: asArray(liveRuns),
      };
    },
  }),
  tool({
    name: "paperclip_sync_changes",
    title: "Changes since cursor",
    description:
      "Poll for what changed. Pass the `cursor` returned by the previous call (omit the first time to get recent history). Returns new activity entries and the next cursor.",
    access: "read",
    schema: z.object({
      companyId: company,
      cursor: z.string().optional().describe("ISO timestamp from the previous call's `cursor`"),
      agentId: z.string().optional(),
      entityType: z.string().optional().describe("issue | agent | approval"),
      limit: z.number().int().min(1).max(500).optional(),
    }),
    run: async (c, i) => {
      const cid = c.resolveCompanyId(i.companyId);
      const since = i.cursor ? Date.parse(i.cursor) : NaN;
      if (i.cursor && Number.isNaN(since)) throw new ToolInputError("cursor must be an ISO timestamp"); // validate before spending an upstream call
      const raw = asArray(
        await c.get(`/companies/${cid}/activity`, {
          agentId: i.agentId,
          entityType: i.entityType,
          limit: i.limit ?? 100,
        }),
      );
      const entries = raw
        .filter((e) => Number.isNaN(since) || Date.parse(e.createdAt) > since)
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      const last = entries.at(-1)?.createdAt;
      return { cursor: last ?? i.cursor ?? new Date().toISOString(), count: entries.length, entries };
    },
  }),
  tool({
    name: "paperclip_wait_for_agent",
    title: "Wait for agent",
    description:
      "Block (polling) until an agent reaches one of the target statuses (default: idle or error) or the timeout passes. Use after waking an agent to follow it to completion.",
    access: "read",
    schema: z.object({
      agentId: id("Agent"),
      untilStatus: z.array(z.string()).optional().describe("Default ['idle','error','paused']"),
      timeoutSeconds: z.number().int().min(1).max(120).optional(),
      pollSeconds: z.number().int().min(1).max(30).optional(),
    }),
    run: async (c, i) => {
      const targets = i.untilStatus?.length ? i.untilStatus : ["idle", "error", "paused"];
      const deadline = Date.now() + (i.timeoutSeconds ?? 30) * 1000;
      const poll = (i.pollSeconds ?? 3) * 1000;
      for (;;) {
        const agent = await c.get<any>(`/agents/${i.agentId}`);
        if (targets.includes(agent.status)) return { reached: true, status: agent.status, agent };
        if (Date.now() + poll > deadline) return { reached: false, status: agent.status, agent };
        await sleep(poll);
      }
    },
  }),

  // ───────────────────────────── reports ─────────────────────────────
  tool({
    name: "paperclip_report_status",
    title: "Status report",
    description: "Executive status report: agents, tasks, spend, pending approvals, agents needing attention.",
    access: "read",
    schema: z.object({ companyId: company }),
    run: async (c, i) => {
      const cid = c.resolveCompanyId(i.companyId);
      const [dashboard, agents, approvals] = await Promise.all([
        c.get<any>(`/companies/${cid}/dashboard`),
        c.get(`/companies/${cid}/agents`),
        c.get(`/companies/${cid}/approvals`, { status: "pending" }),
      ]);
      const pending = asArray(approvals).filter((a) => !a.status || a.status === "pending");
      return statusReport({ dashboard, agents: asArray(agents), pendingApprovals: pending });
    },
  }),
  tool({
    name: "paperclip_report_costs",
    title: "Cost report",
    description: "Spend vs budget with per-agent and per-project breakdown. Defaults to the current month.",
    access: "read",
    schema: z.object({
      companyId: company,
      from: z.string().optional().describe("ISO date"),
      to: z.string().optional().describe("ISO date"),
    }),
    run: async (c, i) => {
      const cid = c.resolveCompanyId(i.companyId);
      const q = { from: i.from, to: i.to };
      const [summary, byAgent, byProject] = await Promise.all([
        c.get<any>(`/companies/${cid}/costs/summary`, q),
        c.get(`/companies/${cid}/costs/by-agent`, q),
        c.get(`/companies/${cid}/costs/by-project`, q),
      ]);
      return costReport({ summary, byAgent: asArray(byAgent), byProject: asArray(byProject), ...q });
    },
  }),
  tool({
    name: "paperclip_report_agent_performance",
    title: "Agent performance report",
    description: "Per-agent throughput (done / in progress / blocked), spend and cost per completed task.",
    access: "read",
    schema: z.object({ companyId: company }),
    run: async (c, i) => {
      const cid = c.resolveCompanyId(i.companyId);
      const [agents, issues, byAgent] = await Promise.all([
        c.get(`/companies/${cid}/agents`),
        c.get(`/companies/${cid}/issues`),
        c.get(`/companies/${cid}/costs/by-agent`),
      ]);
      return agentPerformanceReport({ agents: asArray(agents), issues: asArray(issues), byAgent: asArray(byAgent) });
    },
  }),
  tool({
    name: "paperclip_report_activity",
    title: "Activity digest",
    description: "Digest of audit-log activity, optionally since an ISO timestamp (e.g. start of day).",
    access: "read",
    schema: z.object({
      companyId: company,
      since: z.string().optional(),
      agentId: z.string().optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }),
    run: async (c, i) => {
      const cid = c.resolveCompanyId(i.companyId);
      const since = i.since ? Date.parse(i.since) : NaN;
      if (i.since && Number.isNaN(since)) throw new ToolInputError("since must be an ISO timestamp");
      const raw = asArray(await c.get(`/companies/${cid}/activity`, { agentId: i.agentId, limit: i.limit ?? 200 }));
      const entries = raw
        .filter((e) => Number.isNaN(since) || Date.parse(e.createdAt) >= since)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      return activityDigest({ entries, since: i.since });
    },
  }),

  // ───────────────────────────── escape hatch ─────────────────────────────
  // ───────────────────────────── Papercliped itself ─────────────────────────────
  tool({
    name: "papercliped_service_status",
    title: "Papercliped service status",
    description:
      "Is the hosted Papercliped service working? Returns its status (ok, degraded, down), version and aggregate 24-hour numbers (requests, success rate, latency, sign-ins). Public data only; does not touch Paperclip.",
    access: "read",
    schema: z.object({ window: z.enum(["1h", "24h", "7d"]).optional().describe("Time window for the numbers (default 24h)") }),
    run: async (_c, i) => {
      const base = paperclipedUrl();
      const get = async (path: string) => {
        let r: Response;
        try {
          r = await fetch(`${base}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
        } catch {
          throw new Error(`Cannot reach Papercliped's status API at ${base}`);
        }
        if (!r.ok) throw new Error(`Cannot reach Papercliped's status API at ${base} (HTTP ${r.status})`);
        return (await r.json()) as Record<string, any>;
      };
      const w = i.window ?? "24h";
      const [status, stats] = await Promise.all([get("/api/public/v1/status"), get(`/api/public/v1/stats?window=${w}`)]);
      return {
        service: base,
        status: status.status,
        version: status.version,
        uptimeSeconds: status.uptimeSeconds,
        window: w,
        users: stats.users,
        liveConnections: stats.connections?.live,
        requests: { count: stats.requests?.count, successRate: stats.requests?.successRate, latencyMs: stats.requests?.latencyMs },
        signIns: { started: stats.auth?.flowsStarted, completed: stats.auth?.flowsCompleted, successRate: stats.auth?.successRate },
        statusPage: `${base}/status`,
      };
    },
  }),

  tool({
    name: "paperclip_api_request",
    title: "Raw API request",
    description:
      "Call any Paperclip REST endpoint under /api (path like '/companies/{id}/routines'). For endpoints without a dedicated tool. DELETE and any non-GET require confirm=true.",
    access: "write",
    schema: z.object({
      method: z.enum(["GET", "POST", "PATCH", "PUT", "DELETE"]),
      path: z.string().startsWith("/").describe("Path after /api, e.g. /companies"),
      query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
      body: z.record(z.string(), z.unknown()).optional(),
      confirm: z.boolean().optional().describe("Required true for non-GET calls"),
    }),
    run: (c, i) => {
      if (i.method !== "GET" && i.confirm !== true) {
        throw new ToolInputError(`${i.method} requires confirm=true; confirm the action with the human first`);
      }
      return c.request(i.method, i.path, { query: i.query, body: i.body });
    },
  }),
];

export const toolsByName = new Map(tools.map((t) => [t.name, t]));

/** Where papercliped_service_status looks (PAPERCLIPED_URL; https, or http on localhost for development). */
function paperclipedUrl(): string {
  const raw = (process.env.PAPERCLIPED_URL ?? "").trim() || "https://papercliped.co";
  const u = new URL(raw);
  const loop = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && loop)) throw new ToolInputError("PAPERCLIPED_URL must be an https address");
  return u.origin;
}
