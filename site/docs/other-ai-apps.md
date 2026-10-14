# Any AI app (MCP)

Papercliped is a standard **MCP server**, so it works with more than Claude. Pick the way that matches your app.

## Apps that can add a remote MCP server with sign-in (OAuth)
Most current AI apps and editors can. Add a remote (Streamable HTTP) MCP server with this address:
```
{{MCP}}/mcp
```
The app opens the Papercliped sign-in page. Choose **Connect your Paperclip** (or **Log in** if you have an account), approve in your Paperclip, and pick **Read only** or **Full control**. Papercliped supports OAuth 2.1 with dynamic client registration and PKCE, which is what these apps use.

Where the setting lives differs per app (often "Connectors", "MCP servers" or "Tools"). Check your app's own docs for the menu.

## Claude Code
Install the plugin (adds the tools, a Paperclip skill and the `/paperclip-status`, `/paperclip-sync` and `/paperclip-report` commands):
```
/plugin marketplace add OpenSourcx/papercliped
/plugin install papercliped@papercliped
```
Or add just the MCP server, then run `/mcp` to sign in:
```
claude mcp add --transport http paperclip {{MCP}}/mcp
```

## Codex
Install the plugin:
```
codex plugin marketplace add OpenSourcx/papercliped
codex plugin add papercliped@papercliped
```
Or add just the MCP server (Codex starts the sign-in for you):
```
codex mcp add paperclip --url {{MCP}}/mcp
```

## Apps that only run local MCP servers
Run Papercliped on your own computer instead. It talks straight to your Paperclip, with no account needed:
```
npx papercliped@latest
```
Set `PAPERCLIP_API_URL` (your Paperclip's address) and `PAPERCLIP_API_KEY` (a Paperclip board token) in the app's MCP server settings. This also works for a Paperclip that is only on your own network.

## Apps that need a fixed API key instead of sign-in
Self-host the bridge with a static key (`BRIDGE_TOKEN`) and send it as `Authorization: Bearer <key>`. See the README in the GitHub repository ("Three ways to run it").

## ChatGPT
Use the custom MCP connector where your plan offers it, or GPT Actions with `{{MCP}}/openapi.json`. See [ChatGPT setup](/docs/chatgpt).

## What every app gets
The same tools everywhere: list and control agents, issues, goals and approvals, sync what changed, and reports on status, costs, agent performance and activity. What an app may change depends on the level you chose and your [access mode](/docs/access-modes); change either at any time in the [control room](/docs/control-room) inside your Paperclip. Not sure what to ask? Try the [prompt gallery](/docs/prompts).
