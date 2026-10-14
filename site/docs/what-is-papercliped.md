# What is Papercliped?

Papercliped connects AI apps (Claude, ChatGPT, Codex and anything that speaks MCP) to **your** Paperclip, so you can run your AI-agent company by asking: "What are my agents doing?", "Pause the one that's over budget", "Give me this week's costs."

Paperclip is an open-source orchestrator for companies of AI agents. Papercliped is an independent, open-source project (MIT); it isn't made by the Paperclip team.

## How it works
1. Your AI app connects to Papercliped's MCP endpoint (`{{MCP}}/mcp`), or to a copy you run yourself.
2. You sign in by approving the request **inside your own Paperclip**. No passwords pass through Papercliped.
3. Papercliped calls your Paperclip's API on the app's behalf, only within the level you chose.

## What you can do
- **Control** agents (pause, resume, wake, clear errors), issues, goals and approvals.
- **Sync**: a snapshot of everything now, or just what changed since last time, or follow one agent's run to the end.
- **Report**: status, costs, agent performance and an activity digest.
- **Anything else** through a raw API tool, read only for GET.

See the [tool reference](/docs/tools) for all of them.

## Three ways to use it
| Way | For | Needs |
| --- | --- | --- |
| **Hosted** at `{{MCP}}/mcp` | Claude (web, desktop, mobile), ChatGPT, any MCP app | A Paperclip with a public https address |
| **Local** with `npx papercliped@latest` | Claude Code, Claude Desktop, local MCP apps | Your Paperclip's address and a board token |
| **Self-hosted bridge** | A team or company running their own | A server; see [Run it yourself](/docs/self-hosting) |

## Glossary
- **Paperclip**: the agent orchestrator you run; it holds your companies, agents, issues and goals.
- **Bridge**: the Papercliped server that sits between AI apps and Paperclip.
- **Connector**: how an AI app adds Papercliped (in Claude: Settings → Connectors).
- **MCP**: the Model Context Protocol, the standard AI apps use to call tools.
- **Tool**: one action the AI can take, such as `paperclip_pause_agent`.
- **Level**: what a connection may do: Read only (default) or Full control (every tool).
- **Account**: your Papercliped username and secret key, used to sign in again and manage connections.
- **Secret key**: a key starting with `pcs_`, shown once; Papercliped keeps only a one-way hash.
- **Board token**: a Paperclip credential with operator rights. Papercliped stores it encrypted and only uses it within your level.
- **Control room**: the Papercliped page inside your Paperclip (from the [Paperclip plugin](/docs/paperclip-plugin)), where you manage sessions, access modes, agents and your account. See [The control room](/docs/control-room).
- **Session**: one connected AI app. You can name it, change its level, and limit it to some tools or agents.
- **Access mode**: API only, Full or Agent only: whether AI apps control Paperclip directly, work through agents, or both. See [Access modes](/docs/access-modes).
