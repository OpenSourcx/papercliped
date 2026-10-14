# Launch kit

Everything for the public launch: what must be true first, how to get the first testers, where to post, and copy you can paste. Assets are in the [icon pack](../web/public/brand/papercliped-icons.zip) (also at papercliped.co/brand). For deploying the service, see [LAUNCH.md](LAUNCH.md).

## 1. Before launch day

| | Check | How |
| --- | --- | --- |
| ☐ | The latest release is live | `https://mcp.papercliped.co/api/public/v1/info` shows the version in `package.json`; papercliped.co/prompts and docs.papercliped.co/hosting load. If not, Render → **Manual Deploy → Deploy latest commit**. |
| ☐ | Connections survive past 30 days | Paperclip expires approved keys after 30 days; the bridge renews each key a week before (v2.5.1). Run the `008_key_rotation.sql` migration (`npm run migrate`) on the production database when deploying it. |
| ☐ | A full run-through on a fresh Paperclip | Follow [Host your Paperclip](https://docs.papercliped.co/hosting) start to finish on one guide (Railway or a VPS), connect Claude **and** ChatGPT, run five prompts from the gallery, flip the access switch in the control room. Fix anything that trips you up. |
| ☐ | Discord and X exist | Create them with the icon pack (below), then set `VITE_DISCORD_URL` / `VITE_X_URL` on Render and rebuild. Set up Discord per [COMMUNITY.md](COMMUNITY.md), plus a `#testers` channel. |
| ☐ | GitHub is launch-ready | Turn on Discussions, set the repository social preview to `social-light-1200x630.png`, pin a "Start here" discussion, add topics: `mcp`, `paperclip`, `ai-agents`, `claude`, `chatgpt`, `codex`, `mcp-server`. |
| ☐ | A 60-second demo video | Script in section 6. Every post below uses it. |
| ☐ | Baseline numbers | Note users and connections on papercliped.co/status, so you can tell which post worked. |

### Which icon goes where

| Place | File |
| --- | --- |
| Discord server icon, X / GitHub / npm profile picture, directory listings | `avatar-light-1024.png` (`avatar-dark-*` on dark themes) |
| X header | `x-header-light-1500x500.png` |
| Discord server banner, YouTube thumbnail base, Product Hunt gallery | `banner-light-960x540.png` |
| GitHub social preview, link previews | `social-light-1200x630.png` |
| App icon where a rounded tile fits (Product Hunt logo, docs, slides) | `icon-light-512.png` or `icon-light.svg` |

## 2. The first testers ("founding operators")

Aim for **20–50 people who already run Paperclip** before the big public posts. They find the setup problems, and their quotes become your social proof.

**Where to find them**
1. **Paperclip's Discord** (linked from Paperclip's README). Ask a moderator first where community projects may be shared; then post the tester call below.
2. **Replies on X** to people posting about Paperclip: a short, personal reply with the demo, not a link dump.
3. **Your own network** and anyone who has starred or forked Paperclip and posts about AI agents.

**What they get**
- A **Founding operator** role in Discord and a `#testers` channel with direct access to the maintainers.
- Their name in the release notes and a thanks section in the README (only if they want it).
- Fixes within days: every reported setup problem gets a patch release.

**What they do (20 minutes)**
1. Pick a hosting guide and get their Paperclip public (or use the one they have).
2. Connect one AI app with **Full control**.
3. Run five prompts from the gallery: *Morning catch-up*, *Give an agent a task*, *Wake and wait*, *What's waiting* (approvals), *Weekly review*.
4. Open the control room in Paperclip and switch to **Agent only**, then ask the AI to pause an agent (it should refuse and say why).
5. Fill in the **Tester feedback** form: GitHub → Issues → New issue → *Tester feedback*.

**Tester call (paste in Discord / DMs)**
> Looking for 20 Paperclip operators to try **Papercliped** before launch: free and open source, it lets you run your Paperclip from Claude, ChatGPT or Codex by just asking ("catch me up", "give the Web Engineer this task and wake them", "approve the hire"). Takes about 20 minutes. You get a Founding operator role, direct line to us, and fixes within days. Interested? Reply or DM me. 🧷

## 3. Where to promote, in order

| # | Channel | When | Notes |
| --- | --- | --- | --- |
| 1 | Paperclip Discord | Testers week, then launch day | The highest-intent audience there is. Follow their rules. |
| 2 | X | Launch day, then daily | Thread + demo. Tag Paperclip's account. One gallery prompt a day afterwards, with a short clip. |
| 3 | MCP directories | Launch week | Section 5. Permanent traffic from people searching for connectors. |
| 4 | Anthropic's connector directory and Claude Code plugin listings | Launch week | Puts Papercliped inside Claude's own UI. |
| 5 | Show HN | A weekday, 8–10am US Eastern | Stay and answer every comment for the first 3 hours. |
| 6 | Reddit | Spread over a week | r/ClaudeAI, r/ChatGPT, r/selfhosted (lead with the hosting guides), r/AI_Agents, r/mcp. Different text per sub; read each sub's self-promotion rules first. |
| 7 | dev.to / Hashnode | Launch week | Cross-post one hosting guide each ("Host Paperclip on Railway in 15 minutes") with a canonical link to the docs. These rank in search for a long time. |
| 8 | Product Hunt | 2–4 weeks after launch | Once Discord is active and you have tester quotes. |
| 9 | Paperclip's docs or README | After launch | Ask the Paperclip maintainers to list Papercliped as a community integration. |

## 4. Copy

**One-liner:** Run your Paperclip from Claude, ChatGPT or Codex: just ask.

**Short description (directories, 160 chars):** Free, open-source MCP connector for Paperclip. Manage agents, issues, approvals, budgets and reports from Claude, ChatGPT, Codex or any MCP app.

**Long description**
> Papercliped connects Claude, ChatGPT, Codex and any MCP app to your Paperclip, the open-source orchestrator for companies of AI agents. Instead of clicking through the dashboard, ask: "Catch me up", "Give the Web Engineer this task and wake them", "Approve the hire", "Weekly cost report". You approve every connection inside your own Paperclip, choose Read only or Full control, and decide in the control room whether AI apps control Paperclip directly, work through agents, or both — per agent if you like. 30 tools, ready-made reports, 40+ prompts to copy, and step-by-step guides to host Paperclip at home, on a VPS, Railway, Render, Fly.io or Coolify. Free and MIT licensed.

**X thread**
1. Running a company of AI agents on Paperclip? Now you can run it from Claude, ChatGPT or Codex. Just ask. 🧷 Papercliped is free and open source. [demo video]
2. "Catch me up on my Paperclip." "Give the Web Engineer this task and wake them." "Approve the hire." "Weekly cost report." 40+ ready-to-copy prompts → papercliped.co/prompts
3. You stay in control: approve every connection inside your own Paperclip, pick Read only or Full control, and set per-agent rules in the control room.
4. No public Paperclip yet? Step-by-step guides for your own computer (free tunnel), a VPS, Railway, Render, Fly.io and Coolify → docs.papercliped.co/hosting
5. Connect: paste https://mcp.papercliped.co/mcp into your AI app. Code: github.com/OpenSourcx/papercliped ⭐

**Show HN**
- Title: `Show HN: Papercliped – run your AI agent company from Claude or ChatGPT (open source)`
- URL: the GitHub repository.
- First comment:
> Hi HN! Paperclip is an open-source orchestrator where you run a "company" of AI agents (CEO, engineers, budgets, approvals). I kept opening its dashboard to do small things, so I built Papercliped: an MCP server that lets Claude, ChatGPT, Codex or any MCP client operate it in plain language.
>
> How it works: you add one connector URL, approve the sign-in inside your own Paperclip (no passwords pass through), and pick Read only or Full control. A control room inside Paperclip decides per agent whether AI apps may control it directly, only hand it work, or not see it at all. Every call is checked and audit-logged; Paperclip keys are encrypted at rest.
>
> It's MIT licensed, hosted for free, and you can self-host the bridge or run it locally with `npx papercliped`. I'd love feedback on the permission model and on what you'd want to ask your agents.

**Reddit (r/selfhosted angle)**
> **I wrote step-by-step guides for hosting Paperclip (AI agent orchestrator) on a VPS, Railway, Render, Fly.io, Coolify or at home with a tunnel** — official Docker image, persistent disk, first-admin setup, backups. They end with connecting it to Claude/ChatGPT through Papercliped, the open-source MCP bridge I maintain, but the hosting part stands on its own: docs.papercliped.co/hosting. Corrections welcome.

## 5. Directories

Submit the short and long descriptions above, the avatar icon, the banner, the connector URL `https://mcp.papercliped.co/mcp` (Streamable HTTP, OAuth) and the repository URL. Check each site's current submission steps.

- **Official MCP Registry** (registry.modelcontextprotocol.io): published with its `mcp-publisher` tool from a `server.json`; lists remote servers and npm packages (`papercliped`).
- **Smithery**, **Glama**, **PulseMCP**, **mcp.so**: submit forms or GitHub-based listings.
- **awesome-mcp-servers** lists on GitHub: a one-line pull request under the right category.
- **Anthropic's connector directory** and the **Claude Code plugin** listings: the plugin marketplace is already in this repository (`.claude-plugin/marketplace.json`).
- **Codex plugin** listings, if a public directory exists; the marketplace is in `.agents/plugins/marketplace.json`.

## 6. Demo video (60 seconds)

Screen-record at 1080p, split screen: AI app on the left, Paperclip dashboard on the right. No music needed; captions on.

1. (0–5 s) Title card: the banner image. Caption: *Run your Paperclip from any AI app.*
2. (5–20 s) Type *"Catch me up on my Paperclip."* Show the answer.
3. (20–40 s) *"Give the Web Engineer an issue to fix the signup page, wake them, and tell me when they're done."* Show the issue appear and the agent start in Paperclip.
4. (40–50 s) *"Approve the hire request."* The approval flips in the dashboard.
5. (50–60 s) Control room: flip the switch to **Agent only**. End card: `papercliped.co · free and open source`.

Record a vertical 30-second cut of steps 2–4 for X and short-video platforms.

## 7. Launch day

| Time (US Eastern) | Do |
| --- | --- |
| Day before | Final run-through; status page green; release notes up; demo uploaded. |
| 8:00 | Show HN post + first comment. |
| 8:15 | X thread; post in Paperclip's Discord; announce in your own Discord. |
| 8:30–12:00 | Answer every comment and question. Log every setup problem as an issue. |
| 12:00 | First Reddit post. |
| Evening | Patch release for anything found today. Thank testers publicly. |
| Next 7 days | One Reddit sub per day, one gallery prompt per day on X, directories submitted, one dev.to guide. |

## 8. Measure

- **papercliped.co/status**: users, connections, sign-in success and errors. Check daily for two weeks and note which post ran the day before.
- **GitHub**: stars, traffic (Insights → Traffic → referring sites), issues labelled `feedback`.
- **npm**: weekly downloads of `papercliped` and `papercliped-paperclip-plugin`.
- **Sign-in failures** on the status page are setup problems: each one is a docs fix waiting to happen.
