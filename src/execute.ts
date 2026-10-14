import { guardClient } from "./access/guard.js";
import { evaluate, hiddenAgents, narrowAgentList, needsIssueAgent, type ExecPolicy } from "./access/policy.js";
import { PaperclipApiError, PaperclipClient } from "./client.js";
import { ToolInputError } from "./errors.js";
import { requiredScope, scopeAllows, type Scope } from "./oauth/scopes.js";
import { runTimed, unionMs, type CallTimer } from "./telemetry/timing.js";
import type { AuditEvent } from "./telemetry/types.js";
import { toolsByName, type ToolDef } from "./tools.js";

export { ToolInputError };
export type { AuditEvent };

export function isMutation(tool: ToolDef, input: Record<string, unknown>): boolean {
  if (tool.name === "paperclip_api_request") return input.method !== "GET";
  return tool.access !== "read";
}

export interface ExecOptions {
  /** When set, the caller is limited to these scopes. Omitted = unrestricted (stdio / static token). */
  scopes?: readonly string[];
  /** The account switch and this session's limits. Omitted = no limits (stdio / static token). */
  policy?: ExecPolicy;
  actor?: { id: string; client?: string; userId?: string | null; instance?: string; username?: string };
  audit?: (e: AuditEvent) => void;
}

export type ToolOutcome = { ok: true; result: unknown } | { ok: false; status: number; error: unknown };

const classifyStatus = (status: number): string => (status >= 500 ? "upstream_5xx" : "upstream_4xx");

/** Validate, enforce scopes + read-only mode, run, time and audit. Never throws: callers map the outcome to their protocol. */
export async function executeTool(
  client: PaperclipClient,
  name: string,
  rawInput: unknown,
  opts: ExecOptions = {},
): Promise<ToolOutcome> {
  const started = performance.now();
  const timer: CallTimer = { intervals: [] };
  const tool = toolsByName.get(name);
  let mutation = !!tool && tool.access !== "read";
  let scope: string | undefined;

  const done = (out: ToolOutcome, errorClass?: string): ToolOutcome => {
    opts.audit?.({
      ts: new Date().toISOString(),
      kind: "tool",
      tool: name,
      mutation,
      ok: out.ok,
      status: out.ok ? undefined : out.status,
      errorClass: out.ok ? undefined : errorClass ?? "internal",
      actor: opts.actor?.id ?? "stdio",
      client: opts.actor?.client,
      userId: opts.actor?.userId,
      instance: opts.actor?.instance,
      username: opts.actor?.username,
      scope,
      totalMs: Math.round(performance.now() - started),
      upstreamMs: Math.round(unionMs(timer.intervals)),
      upstreamCalls: timer.intervals.length,
    });
    return out;
  };

  if (!tool) return done({ ok: false, status: 404, error: `Unknown tool: ${name}` }, "invalid_input");

  const parsed = tool.schema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return done({ ok: false, status: 400, error: parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") }, "invalid_input");
  }
  mutation = isMutation(tool, parsed.data);
  const needed: Scope = requiredScope(tool, parsed.data);
  scope = needed;
  if (opts.scopes && !scopeAllows(opts.scopes, needed)) {
    return done({ ok: false, status: 403, error: { message: `This connection lacks the ${needed} scope required for ${name}. Reconnect and grant a higher access level.`, insufficient_scope: needed } }, "insufficient_scope");
  }
  if (client.config.readOnly && mutation) {
    return done({ ok: false, status: 403, error: "Bridge is in read-only mode (PAPERCLIP_READ_ONLY); this action was not sent to Paperclip." }, "read_only");
  }
  let runWith = client;
  const policy = opts.policy;
  if (policy) {
    // An issue's agent is whoever it is assigned to; look it up once, only when the answer can change the decision.
    let issueAgent: string | null | undefined;
    if (needsIssueAgent(policy, tool) && typeof parsed.data.issueId === "string") {
      try {
        const issue = await client.get<{ assigneeAgentId?: unknown }>(`/issues/${encodeURIComponent(parsed.data.issueId)}`);
        issueAgent = typeof issue?.assigneeAgentId === "string" ? issue.assigneeAgentId : null;
      } catch {
        issueAgent = undefined; // can't tell: a session limited to selected agents is refused below, anything else lets the tool report the real error
      }
    }
    const denial = evaluate(policy, tool, parsed.data, issueAgent);
    if (denial) return done({ ok: false, status: 403, error: { message: denial.message, policy: denial.code } }, "policy_blocked");
    runWith = guardClient(client, new Set(hiddenAgents(policy.account)));
  }
  try {
    let result = await runTimed(timer, () => tool.run(runWith, parsed.data));
    if (policy?.session.agents && tool.name === "paperclip_list_agents") result = narrowAgentList(result, policy.session.agents);
    return done({ ok: true, result });
  } catch (err) {
    if (err instanceof ToolInputError) return done({ ok: false, status: 400, error: err.message }, "invalid_input");
    if (err instanceof PaperclipApiError) {
      const hint = err.status === 401 && opts.actor ? " The Paperclip credential behind this connection was rejected; disconnect and reconnect the connector." : "";
      return done({ ok: false, status: err.status, error: { message: err.message + hint, status: err.status, body: err.body } }, classifyStatus(err.status));
    }
    const msg = err instanceof Error ? err.message : String(err);
    return done({ ok: false, status: msg.startsWith("Cannot reach Paperclip") ? 502 : 500, error: msg }, msg.startsWith("Cannot reach Paperclip") ? "upstream_unreachable" : "internal");
  }
}

/** Text shown to a chat model: reports render as markdown, everything else as JSON. */
export function renderForModel(result: unknown): string {
  if (result && typeof result === "object" && typeof (result as any).markdown === "string") {
    return (result as any).markdown;
  }
  return typeof result === "string" ? result : JSON.stringify(result, null, 2);
}
