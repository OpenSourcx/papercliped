import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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

export function createMcpServer(config: BridgeConfig = readConfig(), client = new PaperclipClient(config), exec: ExecOptions = {}) {
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
  return server;
}
