import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PaperclipClient } from "./client.js";
import { readConfig, type BridgeConfig } from "./config.js";
import { executeTool, renderForModel, type ExecOptions } from "./execute.js";
import { canEverRun, type ExecPolicy } from "./access/policy.js";
import { requiredScope, scopeAllows } from "./oauth/scopes.js";
import { tools } from "./tools.js";

export { VERSION as SERVER_VERSION } from "./version.js";
import { VERSION } from "./version.js";

/** Tools above the caller's scope are not advertised (they would only fail). The raw API tool stays: its GETs need only read. */
export function visibleTools(scopes?: readonly string[], policy?: ExecPolicy) {
  const byScope = !scopes ? tools : tools.filter((t) => t.name === "paperclip_api_request" || scopeAllows(scopes, requiredScope(t)));
  // Tools the session or the account switch can never allow are not advertised either.
  return policy ? byScope.filter((t) => canEverRun(policy, t)) : byScope;
}

export function createMcpServer(config: BridgeConfig = readConfig(), client = new PaperclipClient(config), exec: ExecOptions = {}, recoveryEvidence?: () => Promise<string>) {
  const server = new McpServer({ name: "papercliped", version: VERSION });

  for (const tool of visibleTools(exec.scopes, exec.policy)) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.schema.shape,
        annotations: {
          readOnlyHint: tool.access === "read",
          destructiveHint: tool.access === "destructive",
          openWorldHint: false,
        },
      },
      async (args: Record<string, unknown>) => {
        const out = await executeTool(client, tool.name, args, exec);
        if (out.ok) return { content: [{ type: "text" as const, text: renderForModel(out.result) }] };
        const text = typeof out.error === "string" ? out.error : JSON.stringify(out.error, null, 2);
        return { isError: true, content: [{ type: "text" as const, text }] };
      },
    );
  }
  // Offered only for authenticated legacy OAuth account grants and only when the operator
  // explicitly enables an independent Ed25519 signer. The tool is a signed observation
  // of grant possession, not permission to recover or link an account.
  if (recoveryEvidence) {
    server.registerTool("paperclip_operator_recovery_evidence", {
      title: "Operator account recovery evidence",
      description: "Generate short-lived signed evidence that this existing OAuth connection belongs to a Papercliped account. Send it privately to an authorized recovery operator. This does not reset secrets, link accounts or authorize recovery.",
      inputSchema: z.object({}).shape,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, async () => {
      try {
        const proof = await recoveryEvidence();
        return { content: [{ type: "text" as const, text: "Recovery evidence (expires after 5 minutes). Keep private. Present to a trusted Papercliped operator along with a separately verified login identity. This alone does not authorize account recovery.\n" + proof }] };
      } catch {
        return { isError: true, content: [{ type: "text" as const, text: "Recovery evidence is unavailable for this connection. Contact the operator for manual identity verification." }] };
      }
    });
  }
  return server;
}
