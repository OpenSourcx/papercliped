# Connect Claude

Connect Claude to your Paperclip so you can run it by asking. You can use the web, desktop or mobile app, or Claude Code.

## Claude (web, desktop, mobile)
1. In Claude open **Settings → Connectors → Add custom connector**.
2. Use the address `{{MCP}}/mcp` and click **Connect**.
3. On the Papercliped page choose **Connect your Paperclip**, enter your Paperclip's address and approve the request in your Paperclip. (Already have a Papercliped account? Sign in with it instead: email code, passkey, Google or GitHub. See [Your account](/docs/your-account).)
4. Choose **Read only** or **Full control** (see [Permissions](/docs/permissions)) and click **Allow**.
5. Ask Claude something like *"Catch me up on my Paperclip."* More ideas are in the [prompt gallery](/docs/prompts).

Your Paperclip needs a public `https://` address. If it's on your home network only, see [Connect your Paperclip](/docs/connect-your-paperclip).

## Claude Code
Add just the connector, then run `/mcp` inside Claude Code to sign in:
```
claude mcp add --transport http paperclip {{MCP}}/mcp
```
Or install the plugin, which also adds a Paperclip skill and the `/paperclip-status`, `/paperclip-sync` and `/paperclip-report` commands:
```
/plugin marketplace add OpenSourcx/papercliped
/plugin install papercliped@papercliped
```

## Check, change or remove the connection
- See and disconnect connected apps on your [account page](/docs/your-account), or in the [control room](/docs/control-room) inside your Paperclip.
- To change the access level, disconnect and connect again, choosing the level you want.

## If it doesn't work
See [Troubleshooting](/docs/troubleshooting): the most common causes are a Paperclip that isn't reachable over `https://`, or a connection made with **Read only** when you wanted changes.
