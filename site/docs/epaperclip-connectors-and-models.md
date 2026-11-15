# Connect AI models and apps to ePaperclip

**What you'll do:** connect a model service for Pin and agents, and connect an AI app such as Claude, ChatGPT or Codex to your host.

## Before you start
- You are signed in as a Proxmox administrator for device-wide connectors.
- For a model: an API key for a provider, or the address of a model server you run yourself.
- For an AI app: ePaperclip needs an https address the app can reach. Web apps (claude.ai, ChatGPT) must open it from the internet, so use a tunnel or Tailscale. Codex and other programs on your network can use the host directly.

## Steps
1. For a model, open **Connectors** and choose a provider. Four are built in (Anthropic, OpenAI, Gemini, OpenRouter); others and local servers can be added. Enter the key or address and use **Test** before you rely on it. Keys are stored sealed on the host and shown once at most.
2. For an organization's agents, choose the AI account in the organization's settings: a key handed to the agent, or a Claude or ChatGPT subscription signed in inside the agent container.
3. For an AI app, give the app your host's address with `/mcp` on the end: `https://<your-host>/mcp`. The app opens a consent page on your host showing the app, the person, the access level (**Read only** or **Full control**) and where it will return to. Approve only what you recognise.
4. To remove an app, open **Settings**, then **Apps**.

## What you should see
The connector you added marked as working after **Test**, and the app listed under **Apps** after you approve it.

## If it fails
- **The app can't reach the host.** Web apps need a public https address. See [Connect your Paperclip](/docs/connect-your-paperclip).
- **A key is refused.** **Test** shows the provider's reason; check the key and its permissions.
- **More:** the repository's `docs/CONNECTORS.md`, and [Connect Claude](/docs/claude), [ChatGPT](/docs/chatgpt) and [Codex](/docs/codex).
