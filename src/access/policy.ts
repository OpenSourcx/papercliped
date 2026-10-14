/**
 * Who may do what through Papercliped, beyond the two access levels (Read only / Full control).
 *
 * Three layers, checked on every tool call:
 *  1. The account switch: API only, Full, or Agent only (default Full), with an optional override per agent
 *     (any of the three, or Off: Papercliped may not touch that agent at all).
 *  2. The session (one connected AI app): which tools it may use, and whether it applies to everyone or selected agents.
 *  3. The access level the session was granted (Read only / Full control), enforced in `src/oauth/scopes.ts`.
 *
 * Every tool belongs to exactly one surface:
 *   read   looks at things; allowed in every mode
 *   agent  hands work to agents (create/assign/comment on issues, wake an agent)
 *   api    controls Paperclip directly (pause, resume, budgets, approvals, goals, the raw API)
 * "API only" allows read + api. "Agent only" allows read + agent. "Full" allows all three.
 */
import type { ToolDef } from "../tools.js";

export const MODES = ["api", "full", "agent"] as const;
export type Mode = (typeof MODES)[number];
/** What one agent can be set to: a mode, or off (Papercliped may not see or touch it). */
export type AgentMode = Mode | "off";

export const isMode = (v: unknown): v is Mode => typeof v === "string" && (MODES as readonly string[]).includes(v);
export const isAgentMode = (v: unknown): v is AgentMode => v === "off" || isMode(v);

export interface AccountPolicy {
  /** The default for every agent. */
  mode: Mode;
  /** Per-agent overrides, keyed by agent id. An agent not listed follows `mode`. */
  agents: Record<string, AgentMode>;
}

export interface SessionPolicy {
  /** A name the person gave this session, shown instead of the app's name. */
  label: string | null;
  /** The tools this session may use. null = every tool its access level allows. */
  tools: string[] | null;
  /** The agents this session applies to. null = everyone. */
  agents: string[] | null;
}

export const DEFAULT_ACCOUNT_POLICY: AccountPolicy = { mode: "full", agents: {} };
export const DEFAULT_SESSION_POLICY: SessionPolicy = { label: null, tools: null, agents: null };

export type Surface = "read" | "agent" | "api";

/** Hands work to an agent. Everything else that changes something is direct control of Paperclip. */
const AGENT_WORK = new Set(["paperclip_create_issue", "paperclip_update_issue", "paperclip_comment_issue", "paperclip_wake_agent"]);

/** Which surface a call is on. The raw API tool is read for GET and direct control for anything else. */
export function surfaceOf(tool: Pick<ToolDef, "name" | "access">, input: Record<string, unknown> = {}): Surface {
  if (tool.name === "paperclip_api_request") return input.method === "GET" ? "read" : "api";
  if (tool.access === "read") return "read";
  return AGENT_WORK.has(tool.name) ? "agent" : "api";
}

/** The surface a tool is on when called in its usual way (what the control room shows). */
export const surfaceOfTool = (tool: Pick<ToolDef, "name" | "access">): Surface => surfaceOf(tool, {});

export const surfaceAllowed = (mode: Mode, surface: Surface): boolean => surface === "read" || mode === "full" || (mode === "api" && surface === "api") || (mode === "agent" && surface === "agent");

export const MODE_LABEL: Record<AgentMode, string> = { api: "API only", full: "Full", agent: "Agent only", off: "Off" };

// ───────────── validation of what the manage API receives ─────────────

export class PolicyInputError extends Error {}

const ID = /^[A-Za-z0-9._:-]{1,80}$/;
const MAX_AGENTS = 500;

/** A strict, bounded copy of untrusted input. Unknown keys are dropped; anything invalid is refused. */
export function parseAccountPolicy(raw: unknown): AccountPolicy {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const mode = o.mode === undefined ? DEFAULT_ACCOUNT_POLICY.mode : o.mode;
  if (!isMode(mode)) throw new PolicyInputError("mode must be api, full or agent");
  const agents: Record<string, AgentMode> = {};
  const src = o.agents === undefined ? {} : o.agents;
  if (!src || typeof src !== "object" || Array.isArray(src)) throw new PolicyInputError("agents must be an object of agent id to mode");
  const entries = Object.entries(src as Record<string, unknown>);
  if (entries.length > MAX_AGENTS) throw new PolicyInputError(`at most ${MAX_AGENTS} agents`);
  for (const [id, m] of entries) {
    if (!ID.test(id)) throw new PolicyInputError("invalid agent id");
    if (!isAgentMode(m)) throw new PolicyInputError("an agent's mode must be api, full, agent or off");
    if (m !== mode) agents[id] = m; // an override equal to the default is no override
  }
  return { mode, agents };
}

export function parseSessionPolicy(raw: unknown, knownTools: ReadonlySet<string>): SessionPolicy {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  let label: string | null = null;
  if (o.label !== undefined && o.label !== null) {
    if (typeof o.label !== "string") throw new PolicyInputError("label must be text");
    label = o.label.replace(/\s+/g, " ").trim().slice(0, 60) || null;
  }
  const list = (v: unknown, what: string, ok: (s: string) => boolean): string[] | null => {
    if (v === undefined || v === null) return null;
    if (!Array.isArray(v)) throw new PolicyInputError(`${what} must be a list, or null for all`);
    if (v.length > MAX_AGENTS) throw new PolicyInputError(`too many ${what}`);
    const out = [...new Set(v.map(String))];
    if (!out.every(ok)) throw new PolicyInputError(`invalid entry in ${what}`);
    return out;
  };
  const tools = list(o.tools, "tools", (s) => knownTools.has(s));
  const agents = list(o.agents, "agents", (s) => ID.test(s));
  if (tools && tools.length === 0) throw new PolicyInputError("choose at least one tool, or allow all");
  if (agents && agents.length === 0) throw new PolicyInputError("choose at least one agent, or apply to everyone");
  return { label, tools, agents };
}

/** Stored JSON back to a policy, tolerating older or damaged rows by falling back to the safe default. */
export function readAccountPolicy(stored: unknown): AccountPolicy {
  try {
    return parseAccountPolicy(typeof stored === "string" ? JSON.parse(stored) : stored);
  } catch {
    return { ...DEFAULT_ACCOUNT_POLICY, agents: {} };
  }
}
export function readSessionPolicy(stored: unknown, knownTools: ReadonlySet<string>): SessionPolicy {
  if (stored === null || stored === undefined) return { ...DEFAULT_SESSION_POLICY };
  try {
    return parseSessionPolicy(typeof stored === "string" ? JSON.parse(stored) : stored, knownTools);
  } catch {
    return { ...DEFAULT_SESSION_POLICY };
  }
}

// ───────────── evaluating one call ─────────────

export interface ExecPolicy {
  account: AccountPolicy;
  session: SessionPolicy;
}

export type DenialCode = "tool_not_allowed" | "agent_off" | "mode_blocks" | "agent_not_in_session" | "needs_all_agents";
export interface Denial {
  code: DenialCode;
  message: string;
}

const CONTROL_ROOM = "Change it in the Papercliped page inside Paperclip.";

/** Agent ids a call names, wherever the tool takes them (a target, an assignee, an owner, or a filter). */
export function targetsOf(input: Record<string, unknown>): string[] {
  const ids = [input.agentId, input.assigneeAgentId, input.ownerAgentId].filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  return [...new Set(ids.map((s) => s.trim()))];
}

/** Tools that act on an issue, whose agent is whoever it is assigned to (not named in the call). */
const BY_ISSUE = new Set(["paperclip_get_issue", "paperclip_update_issue", "paperclip_comment_issue"]);
/** Tools a session limited to selected agents may still use without naming an agent. */
const OPEN_TO_LIMITED = new Set(["papercliped_service_status", "paperclip_list_companies", "paperclip_list_agents"]);

/** Does this call need the issue's current assignee looked up before it can be judged? */
export function needsIssueAgent(p: ExecPolicy, tool: Pick<ToolDef, "name">): boolean {
  return BY_ISSUE.has(tool.name) && (p.session.agents !== null || Object.keys(p.account.agents).length > 0);
}

/** Agents Papercliped may not touch at all: hidden from every result, refused as a target. */
export const hiddenAgents = (a: AccountPolicy): string[] => Object.entries(a.agents).filter(([, m]) => m === "off").map(([id]) => id);

/**
 * Decide one call. `issueAgent` is the assignee of the issue the call names (null = unassigned, undefined = not looked up).
 * Returns null when the call may go ahead, or why not.
 */
export function evaluate(p: ExecPolicy, tool: Pick<ToolDef, "name" | "access" | "title">, input: Record<string, unknown>, issueAgent?: string | null): Denial | null {
  const { account, session } = p;
  const label = tool.title || tool.name;
  if (session.tools && !session.tools.includes(tool.name)) {
    return { code: "tool_not_allowed", message: `This session isn't allowed to use "${label}". ${CONTROL_ROOM}` };
  }
  const surface = surfaceOf(tool, input);
  const targets = targetsOf(input);
  if (typeof issueAgent === "string") targets.push(issueAgent);
  for (const a of new Set(targets)) {
    const eff: AgentMode = account.agents[a] ?? account.mode;
    if (eff === "off") return { code: "agent_off", message: `Papercliped isn't allowed to use that agent. ${CONTROL_ROOM}` };
    if (!surfaceAllowed(eff, surface)) return { code: "mode_blocks", message: `That agent is set to "${MODE_LABEL[eff]}", which doesn't allow "${label}". ${CONTROL_ROOM}` };
    if (session.agents && !session.agents.includes(a)) return { code: "agent_not_in_session", message: `This session only applies to selected agents, and that one isn't included. ${CONTROL_ROOM}` };
  }
  if (targets.length === 0 && !surfaceAllowed(account.mode, surface)) {
    return { code: "mode_blocks", message: `Papercliped is set to "${MODE_LABEL[account.mode]}", which doesn't allow "${label}". ${CONTROL_ROOM}` };
  }
  if (session.agents && targets.length === 0 && !OPEN_TO_LIMITED.has(tool.name)) {
    const why = BY_ISSUE.has(tool.name) || tool.name === "paperclip_create_issue" ? "needs an issue assigned to one of its agents" : "looks across every agent";
    return { code: "needs_all_agents", message: `This session only applies to selected agents, and "${label}" ${why}. ${CONTROL_ROOM}` };
  }
  return null;
}

/** For a session limited to selected agents: the agent list shows only those. */
export function narrowAgentList(result: unknown, allowed: readonly string[]): unknown {
  const keep = (x: unknown) => !!x && typeof x === "object" && allowed.includes(String((x as Record<string, unknown>).id));
  if (Array.isArray(result)) return result.filter(keep);
  if (result && typeof result === "object" && Array.isArray((result as Record<string, unknown>).agents)) {
    return { ...(result as object), agents: ((result as Record<string, unknown>).agents as unknown[]).filter(keep) };
  }
  return result;
}

const AGENT_REFS = ["id", "agentId", "assigneeAgentId", "ownerAgentId", "executorAgentId", "createdByAgentId"] as const;

/**
 * Remove every record that belongs to one of the hidden agents, wherever it appears in a response: list items, nested
 * rows, and keys named by agent id. Totals the server already summed are left as they are.
 */
export function redactAgents<T>(value: T, hidden: ReadonlySet<string>): T {
  if (hidden.size === 0) return value;
  const belongs = (x: unknown): boolean => {
    if (!x || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    return AGENT_REFS.some((k) => typeof o[k] === "string" && hidden.has(o[k] as string));
  };
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.filter((x) => !belongs(x)).map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (hidden.has(k) || belongs(x)) continue;
        out[k] = walk(x);
      }
      return out;
    }
    return v;
  };
  return walk(value) as T;
}

const takesAgent = (tool: Pick<ToolDef, "schema">): boolean => {
  const shape = (tool.schema as unknown as { shape?: Record<string, unknown> }).shape ?? {};
  return "agentId" in shape || "assigneeAgentId" in shape || "ownerAgentId" in shape;
};

/**
 * Could this tool ever run for this session? A tool that can never run is not advertised to the AI, so it doesn't try it.
 * (Whether a particular call may run is `evaluate`'s answer.)
 */
export function canEverRun(p: ExecPolicy, tool: Pick<ToolDef, "name" | "access" | "schema">): boolean {
  if (p.session.tools && !p.session.tools.includes(tool.name)) return false;
  if (tool.name !== "paperclip_api_request") {
    const surface = surfaceOfTool(tool);
    const modes: Mode[] = [p.account.mode, ...Object.values(p.account.agents).filter((m): m is Mode => m !== "off")];
    if (!modes.some((m) => surfaceAllowed(m, surface))) return false;
  }
  if (p.session.agents) return OPEN_TO_LIMITED.has(tool.name) || BY_ISSUE.has(tool.name) || tool.name === "paperclip_create_issue" || takesAgent(tool);
  return true;
}
