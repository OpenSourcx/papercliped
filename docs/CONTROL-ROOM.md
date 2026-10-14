# The control room: audit, design and decisions

How v2.4.0 turns the Papercliped plugin into a control room inside Paperclip. Written alongside the build. The user-facing guides are `site/docs/control-room.md` and `site/docs/access-modes.md`; this page is for people changing the code.

Labels: **Observed** = read from Paperclip's installed source (2026.1001.0) or a live instance. **Decided** = a choice made for this release.

## 1. What was asked
- See every session (one connected AI app) and manage it from inside Paperclip: which tools it may use, and whether it applies to everyone or to selected agents.
- Follow Paperclip's native design, as a control room.
- Papercliped integrated into the app like agents: finely manageable access, **full control for every agent and the API by default**, and a main-page switch between **API only | Full | Agent only**.
- Audit Paperclip to see what needs to be integrated with what, and document as we build.

## 2. Audit of Paperclip (Observed)

### What a plugin can be
Paperclip 2026.1001.0 has a plugin system (alpha). The UI slot types are `page`, `detailTab`, `taskDetailView`, `dashboardWidget`, `sidebar`, `routeSidebar`, `sidebarPanel`, `projectSidebarItem`, `globalToolbarButton`, `appShellOverlay`, `toolbarButton`, `contextMenuItem`, `commentAnnotation`, `commentContextMenuItem`, `settingsPage`, `companySettingsPage`. Each needs a capability: `page` ← `ui.page.register`, `sidebar`/`routeSidebar` ← `ui.sidebar.register`, `detailTab` ← `ui.detailTab.register`, `dashboardWidget` ← `ui.dashboardWidget.register`.

- `routeSidebar` replaces the company menu while a route is open. This is how Paperclip's own agent page gets its grouped left menu, so it is the native way to build a control room.
- `detailTab` with `entityTypes: ["agent"]` adds a tab to every agent's page.
- A plugin worker reads agents with `ctx.agents.list` (capability `agents.read`). The host supplies the verified company with every action call (`context.companyId`); the page's own parameters are never trusted for it.
- A `routePath` is allowed only on `page`, `routeSidebar` and `companySettingsPage` slots. The 2.2.0 manifest put one on a `sidebar` slot, which is why Paperclip refused to install it (a bare `400`). The plugin's tests now run Paperclip's own `pluginManifestV1Schema`.
- Paperclip refuses to **upgrade** a plugin whose new version asks for capabilities the old one didn't have (an admin must approve). Moving from 2.2.x to 2.4 therefore means remove and reinstall. Documented in `site/docs/paperclip-plugin.md`.
- Install is `POST /api/plugins/install` (instance admin only), which runs `npm install <pkg>@<version> --ignore-scripts` into `~/.paperclip/plugins`, then validates the manifest (schema, API version, capabilities, route conflicts, minimum host version) and registers it.

### What Paperclip already has that overlaps
- **Tool access** (`/companies/:id/tools/*`, `/tool-connections`, `/tool-profiles`, grants and delegations) and a **tool gateway** (`/tool-gateway/*`, MCP gateways). These govern the tools *agents* use *outward* (GitHub, Google, remote MCP connectors). Papercliped is the opposite direction: AI apps controlling Paperclip *inward*. **Decided:** do not reuse or mirror them; they model a different thing, and a plugin can't extend them. The per-agent **Tools** tab in Paperclip's own UI (`AgentToolsTab`) is the closest native pattern, and is why Papercliped's per-agent control lives on the agent's own page too.
- **Agent permissions** (`PATCH /agents/:id/permissions`), **authorization grants and policies** (capabilities `authorization.*`). These are Paperclip-side permissions for principals inside Paperclip. **Decided:** not used. Papercliped's limits are enforced by the bridge, which every AI call passes through, so they hold for Claude, ChatGPT and any MCP client regardless of Paperclip's version, and need no extra capability.
- **Agent sessions** (`agent.sessions.*`, `task-sessions`, `runtime-state`). These are an agent's own runtime conversations. They are not Papercliped sessions. In the control room a **session** always means a connected AI app (an OAuth grant).

### Native design (Observed from `ui/` and a live page)
shadcn-style components on Tailwind with CSS variables (`--background`, `--card`, `--border`, `--primary`, `--sidebar-accent`, …), light and dark via a `.dark` class, Inter, Lucide icons at 16px. The plugin uses Paperclip's **own compiled classes** (every class used is checked against the live stylesheet, see `plugin/src/ui/look.ts`), the SDK's `StatusBadge`, `MetricCard`, `DataTable` and toast, and Lucide icons. On touch screens Paperclip forces buttons to at least 44px, so controls size themselves from their buttons instead of a fixed height.

## 3. Design

### Sessions
A **session** is one OAuth grant (one connected AI app). `Grant.policy` (new, nullable JSON) holds `{ label, tools, agents }`; `null` for `tools` or `agents` means "all". The access **level** stays in `grant.scopes`.

### The access switch
`Account.policy` (new, nullable JSON) holds `{ mode: "api"|"full"|"agent", agents: { [agentId]: "api"|"full"|"agent"|"off" } }`. No row means Full for every agent, so nothing changes for anyone until they choose.

### Tool surfaces (`src/access/policy.ts`)
Every tool is exactly one of **read** (any read, and `GET` through the raw API tool), **agent** (create/update/comment on issues, wake agent: it hands work to agents), or **api** (every other change: pause, resume, clear error, budget, terminate, goals, approvals, non-`GET` raw API). A mode allows `read` plus: `api` → api, `agent` → agent, `full` → both. A test ties `site/docs/access-modes.md` and the generated tool reference to this classification.

### Enforcement order (`evaluate`, called from `executeTool`)
1. Session tool list. 2. For each agent the call is about (named, assigned or owner, or the assignee of the named issue): Off → refuse; the agent's (or default) mode must allow the surface; the session's agent list must include it. 3. With no agent named, the default mode must allow the surface. 4. A session limited to selected agents may only use tools that name an agent (plus companies, agents list and service status), because every other view looks across all agents. The access level (scopes) is checked before all of this, unchanged.

Refusals are `403` with `{ message, policy: <code> }`, audited as `policy_blocked`, and never reach Paperclip. The message names the setting and where to change it.

### Hiding agents (`src/access/guard.ts`)
For agents set to **Off**, the Paperclip client handed to every tool is wrapped so each response has those agents' records removed (list items, rows keyed by agent id, anything referencing them), **before** the tool builds its answer. A report built from that client cannot name a hidden agent because it never received one. Server-side totals are left as the server computed them (documented). For a session limited to selected agents, `paperclip_list_agents` is narrowed to those agents.

An issue's agent is not named in the call, so for sessions with limits or accounts with per-agent settings the bridge looks the issue up once (`GET /issues/:id`) before deciding; if that fails, a limited session is refused and anyone else lets the tool report the real error.

### What the AI is shown
`visibleTools(scopes, policy)` drops tools that can never run for the session (not in its tool list; no mode allows the surface; tools that look across all agents for a limited session). Tools that *might* run for some agent stay.

### Management API (`src/manage/routes.ts`)
`GET /sessions`, `POST|DELETE /sessions/:id`, `GET|POST|PUT /policy`, `GET /tools`, `GET /activity`. Input is parsed strictly (`parseAccountPolicy`, `parseSessionPolicy`): unknown tool names, empty lists, bad ids and over-long lists are refused; damaged stored JSON falls back to the safe default instead of failing a call. Activity is read from the audit table by grant id and never contains arguments or results.

### Plugin (`plugin/`)
New worker actions: `sessions`, `setSession`, `policy`, `setPolicy`, `tools`, `activity`, `agents`. Five slots: `sidebar` (entry), `page` (the control room), `routeSidebar` (its menu), `detailTab` on agents, `dashboardWidget`. Navigation is `/papercliped?s=<section>&id=<thing>` so links, back and reload work. The access switch is a three-position vertical switch with a sliding knob (arrow keys, announced as a radio group, reduced-motion respected); the same control is reused compactly for agents.

### Database
`007_control_room.sql`: `accounts.policy jsonb`, `grants.policy jsonb`. No backfill. The panel views expose neither column. The generated `docs/supabase-schema.sql` is regenerated and a test fails if it is stale.

## 4. How it was verified
- **Rule engine**: unit tests for every mode, per-agent override, Off, session tool and agent lists, issue assignee, redaction, validation and damaged-row fallback (`test/policy.test.ts`).
- **End to end through the real server** with a fake Paperclip: switching modes changes the next call, nothing blocked reaches Paperclip, Off agents vanish from lists and reports, limited sessions, another account is never affected, activity includes blocked calls and no arguments (`test/control-room.test.ts`).
- **Postgres**: the whole suite (memory, Postgres, and the least-privilege role) ran against a real PostgreSQL 16, including the new store methods.
- **Plugin**: handlers against a fake bridge, the SDK test harness (capabilities are enforced there), and the UI (`plugin/test`).
- **Paperclip's own validators**: the built manifest passes `pluginManifestV1Schema` and the host's capability validator, run on the live instance's installed code.
- **Visual**: every page, the agent tab and the widget were rendered with Paperclip's real stylesheet in light, dark and phone width.

## 5. Known limits and next steps
- Limits apply to calls through Papercliped. The Paperclip key Papercliped holds still has the account's access (see `docs/SECURITY.md`); a bridge compromise bypasses them.
- Server-summed totals include Off agents.
- Activity is capped at 200 rows per request and, on the hosted service, kept 30 days (`BRIDGE_AUDIT_RETENTION_DAYS`).
- The plugin could not be installed into a live Paperclip with these slots before release; the manifest was validated against the live host's code instead. First live install after release should be checked: left menu replaces the company menu on `/papercliped`, the agent tab appears, the widget can be added.
- Paperclip's plugin API is alpha; `routeSidebar` and `detailTab` behaviour may change.
