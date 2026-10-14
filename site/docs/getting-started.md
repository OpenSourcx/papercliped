# Getting started

Papercliped connects Claude, ChatGPT, Codex and any MCP app to **your** Paperclip, so you can run it by asking instead of clicking through the dashboard. You keep control: you choose how much the AI may do, and you can cut access at any time.

## What you need
- A Paperclip that is reachable over the internet at an `https://` address (for example `https://workforce.example.com`). Private, local and `http://` addresses are refused on purpose. No public address yet? See [Host your Paperclip](/docs/hosting).
- An AI app that can add a remote MCP server: Claude (web, desktop or mobile), Claude Code, ChatGPT, Codex, or [another app](/docs/other-ai-apps).

## Connect from Claude
1. In Claude open **Settings → Connectors → Add custom connector**.
2. Use the address `{{MCP}}/mcp` and click **Connect**.
3. On the Papercliped page choose **Connect your Paperclip**, enter your Paperclip's address, and approve the request in your Paperclip.
4. Pick a **username** (see below). Papercliped then shows your **secret key once**. Save it in a password manager.
5. Choose how much to allow (see [Permissions](/docs/permissions)) and click **Allow**. Leave **Also install the Papercliped plugin** ticked to get the [control room](/docs/control-room) inside your Paperclip.
6. Ask Claude something like *"Catch me up on my Paperclip."* Then try more from the [prompt gallery](/docs/prompts).

## Claude Code
```
claude mcp add --transport http papercliped {{MCP}}/mcp
```
Or install the plugin: `/plugin marketplace add OpenSourcx/papercliped`, then `/plugin install papercliped@papercliped`.

## Codex
```
codex plugin marketplace add OpenSourcx/papercliped
codex plugin add papercliped@papercliped
```
Or just the MCP server: `codex mcp add paperclip --url {{MCP}}/mcp`.

## Run it yourself (npm)
```
npx papercliped@latest
```
This starts a local server for one Paperclip, using `PAPERCLIP_API_URL` and `PAPERCLIP_API_KEY`.

## Other AI apps
Any app that supports MCP can use Papercliped. See [Any AI app (MCP)](/docs/other-ai-apps).

## Inside your Paperclip
The Papercliped plugin for Paperclip is where you manage everything: the [control room](/docs/control-room) for connected apps, what each may do and which agents it applies to, plus privacy and your account. See [Paperclip plugin](/docs/paperclip-plugin).

## ChatGPT
Add Papercliped as an MCP app in developer mode, or build a custom GPT with Actions. See [ChatGPT setup](/docs/chatgpt).

See [Create your account](/docs/signup) for every screen in detail.

## Your username
- 6 to 32 characters.
- At least one number or one of these symbols: `.` `#` `_`.
- Letters, numbers and only those three symbols. Every username is unique.

## Signing in again
- **With your secret key:** enter your username and secret key.
- **Without it:** choose **Connect your Paperclip** and approve again. Papercliped recognises you as the same Paperclip user, signs you back in to the same account, and lets you make a new secret key.
