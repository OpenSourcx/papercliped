# Host your Paperclip

Papercliped connects your AI app to **your** Paperclip over the internet, so your Paperclip needs a public `https://` address. This section takes you from nothing to a running Paperclip with a public address, connected to Papercliped, with one complete guide per hosting option.

Already have Paperclip running at a public `https://` address? Skip to [Connect Papercliped](#connect-papercliped).

## Pick where to run it

| Option | Cost per month (Oct 2026, approx.) | Effort | Best for | Guide |
| --- | --- | --- | --- | --- |
| **Your own computer + a tunnel** | Free (plus a domain, if you want one) | Medium | Trying it out; a computer that's always on | [At home, with a tunnel](/docs/connect-your-paperclip) |
| **A VPS with Docker** (Hetzner, DigitalOcean, Linode…) | about €5–12 | Medium | Best value for daily use, full control | [VPS with Docker](/docs/host-vps) |
| **Railway** | about $10–25 (usage-based) | Easy | The fewest steps, no server to look after | [Railway](/docs/host-railway) |
| **Render** | about $25+ (2 GB plan) plus disk | Easy | A dashboard you already know | [Render](/docs/host-render) |
| **Fly.io** | about $11–22 plus volume | Medium | Command-line people, pick your region | [Fly.io](/docs/host-fly) |
| **Coolify** on a VPS | your VPS (8 GB recommended) | Easy–medium | A point-and-click panel on your own server | [Coolify](/docs/host-coolify) |

Prices change; check the provider's pricing page before you sign up.

**Not recommended:** free tiers that **sleep** (Render free, Railway's free plan) or hosts with **no persistent disk** (DigitalOcean App Platform). Paperclip keeps its database, secrets key, uploads, agent workspaces and agent logins on disk, and a sleeping server stops your agents mid-task. Use a DigitalOcean *Droplet* with the [VPS guide](/docs/host-vps) instead.

**Not sure?** Start at home with a tunnel to try everything for free. When you want it running all the time, move to a VPS (cheapest) or Railway (easiest).

## What every option needs

Every guide sets these up. If you're doing something we don't cover, this is the checklist.

1. **Paperclip in authenticated, public mode.** Paperclip has two modes: `local_trusted` (no login, only on your own computer) and `authenticated` (people sign in). An internet-facing Paperclip must be `authenticated` with `public` exposure. Never put a `local_trusted` Paperclip behind a public address.
2. **Its public address set explicitly.** Paperclip builds sign-in links and checks hostnames from it.
3. **Two long random secrets.** One for sign-ins, one for signing tool-action approvals.
4. **A persistent disk** at Paperclip's data folder (`/paperclip` in the Docker image, `~/.paperclip` otherwise).
5. **At least 2 GB of memory, 4 GB if you run several agents.** Agents run as programs inside the same machine.
6. **Always on.** A restart or redeploy stops any agent run in progress, so avoid hosts that sleep, and update when your agents are idle.
7. **Nothing blocking `/api/*`.** No login wall, bot challenge or "under attack" mode in front of Paperclip's API, or Papercliped can't reach it.

### The settings

| Setting | Value | Why |
| --- | --- | --- |
| `PAPERCLIP_DEPLOYMENT_MODE` | `authenticated` | People sign in (the Docker image's default) |
| `PAPERCLIP_DEPLOYMENT_EXPOSURE` | `public` | Internet-facing. The Docker image defaults to `private`, which refuses unknown hostnames |
| `PAPERCLIP_PUBLIC_URL` | `https://paperclip.example.com` | Your public address, exactly as people will type it |
| `BETTER_AUTH_SECRET` | 64 random hex characters | Signs sign-in sessions. Required |
| `PAPERCLIP_TOOL_ACTION_SIGNING_SECRET` | 64 random hex characters | Signs tool-action approvals |
| `PORT` | `3100` | Paperclip's port (the image's default; some hosts need it set) |
| `DATABASE_URL` | optional | Leave unset to use Paperclip's built-in Postgres on the disk, or point it at a managed Postgres |
| `TRUST_PROXY` | optional | Tells Paperclip which proxy in front of it to believe about the visitor's address (`uniquelocal` behind Caddy in Docker). Leave unset if unsure |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | optional | Keys for the agents that use Claude Code or Codex. You can sign in inside the server instead (see each guide) |

Make a secret with:

```
openssl rand -hex 32
```

No `openssl`? Any password manager can generate a 64-character random password; use letters and numbers only.

### Your first account

In public mode, Paperclip doesn't show a "claim this instance" button (anyone on the internet could press it). Instead you run one command on the server, which prints a **one-time invite link** for the first admin:

```
npx --yes paperclipai auth bootstrap-ceo --data-dir /paperclip --base-url https://paperclip.example.com
```

Each guide shows exactly where to run it. Open the link, create your account, and you're the admin. Once you have your account, you can close public sign-ups by setting `PAPERCLIP_AUTH_DISABLE_SIGN_UP=true` and restarting; invite teammates from inside Paperclip.

### Your agents' keys

The official Paperclip image already includes the Claude Code, Codex, OpenCode and Gemini command-line tools, plus git and the GitHub CLI. Your agents need one of:

- **An API key** as a setting: `ANTHROPIC_API_KEY` for Claude Code agents, `OPENAI_API_KEY` for Codex agents.
- **Your subscription login**, done once inside the server (for example `claude` or `codex`, then follow the sign-in). The login is saved on the persistent disk, so it survives restarts.

## Check it works

From any computer (your phone on mobile data is a good test):

```
curl https://paperclip.example.com/api/health
```

On Windows PowerShell use `curl.exe`. A healthy answer is JSON that includes:

```
"status":"ok", "deploymentMode":"authenticated", "deploymentExposure":"public", "bootstrapStatus":"ready"
```

`"bootstrapStatus":"bootstrap_pending"` means nobody has created the first account yet (see [Your first account](#your-first-account)).

## Connect Papercliped

1. Add the connector in your AI app. In Claude: **Settings → Connectors → Add custom connector**, address `{{MCP}}/mcp`. Other apps: [Any AI app](/docs/other-ai-apps), [ChatGPT](/docs/chatgpt).
2. On the Papercliped page choose **Connect your Paperclip** and enter your public address (just `https://paperclip.example.com`, no path).
3. Approve the request in your Paperclip (you'll be asked to sign in), pick a username, save the secret key you're shown once, and choose **Read only** or **Full control**. Details: [Create your account](/docs/signup).
4. Leave **Also install the Papercliped plugin** ticked to manage your connections from inside Paperclip ([Paperclip plugin](/docs/paperclip-plugin)).
5. Send your first prompt: *"Catch me up on my Paperclip."* Then try more from the [prompt gallery](/docs/prompts).

## Keep it safe

- Use long random secrets and keep them out of chats, screenshots and Git.
- Keep Paperclip up to date, and update when agents are idle.
- Back up the data disk (each guide says how).
- Expose only Paperclip, nothing else on the machine.
- You can cut Papercliped's access at any time: disconnect apps in the [Paperclip plugin](/docs/paperclip-plugin), or revoke the key in Paperclip.
