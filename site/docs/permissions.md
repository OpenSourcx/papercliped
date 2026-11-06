# Permissions

You decide how much the AI may do each time you connect. There are two levels.

| Level | What the AI can do |
| --- | --- |
| **Read only** (default) | View agents, tasks, goals, costs and reports. Cannot change anything. |
| **Full control** | Every tool: everything above, plus pause, resume, wake or terminate agents, create and update issues and goals, comment, decide approvals, change budgets and send any API request. Run your Paperclip from anywhere, without opening the dashboard. |

## Beyond the two levels
The level is chosen when an app connects. After that, the [control room](/docs/control-room) gives you finer control, without reconnecting anything:

- **An access switch** for every agent: [API only, Full or Agent only](/docs/access-modes), and any agent can be set differently or turned off.
- **Per-session limits:** name a session, choose exactly which tools it may use, and choose whether it applies to everyone or only selected agents.

These only ever narrow what a level allows; they never grant more than the level.

## Good to know
- Papercliped enforces these levels itself on every call, and refuses anything outside the level you chose.
- Your Paperclip key has the access your Paperclip account has. The levels limit what the **AI app** can do through Papercliped; they do not shrink the key itself. That is why the key is stored encrypted and why you can revoke it at any time.
- The AI asks for confirmation before actions that can't be undone, such as terminating an agent.
- Apps that still ask for the old "admin" level get Full control.
- To change a level, use the [Paperclip plugin](/docs/paperclip-plugin), or disconnect the app and connect it again.

## Which Paperclip role you need
Papercliped uses your own Paperclip account, so what it can do also depends on your role in the company. **Viewer** is enough for Read only. **Operator** is enough for Full control (create and update issues, pause, resume, wake and terminate agents, set budgets). Owner and Admin add nothing Papercliped uses. Installing the plugin with one click needs an instance admin; anyone else can install it from Paperclip's plugin page. Papercliped works with Paperclip 2026.1023.0, the latest stable release, and with the releases from 2026.1005.0 on that it has been checked against.

## Disconnecting
- Remove the connector in Claude or ChatGPT.
- To cut access immediately, revoke the key in your Paperclip (it is named like "… (via bridge) (board)").
- To delete your account and stored key, ask via the contact on the [Privacy](/privacy) page.
