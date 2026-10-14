# Create your account

Creating a Papercliped account takes about a minute. You do it the first time you connect Claude (or ChatGPT).

## Before you start
- Your Paperclip must be reachable at a public `https://` address, for example `https://workforce.example.com`. Need one? Follow [Host your Paperclip](/docs/hosting): at home with a tunnel, on a VPS, or on Railway, Render, Fly.io or Coolify.
- You must be able to sign in to that Paperclip, because you approve the connection there.

## Steps
1. **Add the connector.** In Claude open **Settings → Connectors → Add custom connector** and use `{{MCP}}/mcp`, then click **Connect**.
2. **Choose "Connect your Paperclip".** (If you already have an account, you can use **Log in** with your username and secret key instead.)
3. **Enter your Paperclip's address**, for example `https://workforce.example.com`. Use only the address, with no path after it.
4. **Approve in Paperclip.** Papercliped shows a link. Open it, sign in to your Paperclip and approve the request, then come back to the Papercliped tab.
5. **Pick a username.** It must be:
   - 6 to 32 characters;
   - letters, numbers and only these symbols: `.` `#` `_`;
   - include at least one number or one of those symbols;
   - unique. If someone has it, you will be asked to choose another.

   Examples that work: `kpn.wrld`, `og_dev7`, `river#2026`.
6. **Save your secret key.** Papercliped shows a key that starts with `pcs_` **once**. Copy it into a password manager. Only a one-way hash is stored, so nobody can read it back, including us.
7. **Choose how much to allow.** **Read only** is the default. **Full control** lets the AI use every tool: pause, wake or terminate agents, update issues and goals, decide approvals and set budgets. You can also tick **Appear anonymously**.
8. Click **Allow**. You return to Claude and can ask, for example, "List my Paperclip agents."

## Coming back later
- **With your secret key:** choose **Log in**, enter your username and key.
- **Without it:** choose **Connect your Paperclip** and approve again. You are recognised as the same Paperclip user, keep the same account, and can make a new secret key.

## What gets created
A username, a hash of your secret key, and a stored (encrypted) Paperclip key tied to your account. See [Privacy](/privacy) for the full list and [Security](/docs/security) for how it is protected.
