# Connect Codex

Connect Codex to your Paperclip.

## The quick way: the plugin
```
codex plugin marketplace add OpenSourcx/papercliped
codex plugin add papercliped@papercliped
```
The plugin adds the Papercliped tools and a Paperclip skill.

## Just the connector
```
codex mcp add paperclip --url {{MCP}}/mcp
```
Codex starts the sign-in for you. Choose **Connect your Paperclip** (or sign in with your Papercliped account), approve in your Paperclip, then choose **Read only** or **Full control**.

## Run it locally instead
If you'd rather not use the hosted connector, run Papercliped on your own computer. It talks straight to your Paperclip and needs no account:
```
npx papercliped@latest
```
Set `PAPERCLIP_API_URL` to your Paperclip's address and `PAPERCLIP_API_KEY` to a board key. See [Run it yourself](/docs/self-hosting).

## Manage the connection
See and disconnect connected apps on your [account page](/docs/your-account). Access levels are explained in [Permissions](/docs/permissions).

## If it doesn't work
See [Troubleshooting](/docs/troubleshooting).
