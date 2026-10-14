# Changelog

## Unreleased

## v2.5.3 — the OpenSourcedd brand kit

- **OpenSourcedd brand kit.** OpenSourcedd, the community around Papercliped, has its own mark: an open ring with the Papercliped face. papercliped.co/brand now carries its icons (rounded and circle-safe, SVG and PNG up to 1024 px), the Discord server banner, the X header and the r/OpenSourcedd banners for desktop and the Reddit app, all in light and dark, in `web/public/brand/opensourcedd/` and `web/public/brand/community/`. Everything is rebuilt by `web/scripts/community-cards.mjs`.

## v2.5.2 — join the OpenSourcedd community

- **Join the community.** Papercliped's community is now live as **OpenSourcedd**: the [Discord server](https://discord.gg/cAECU68jSA) and [r/OpenSourcedd](https://www.reddit.com/r/OpenSourcedd) on Reddit. Both are linked from the website footer and community page, GitHub's "New issue" page, the README and the contributing guide.

## v2.5.1 — Paperclip keys renew themselves

- **Connections no longer break after 30 days.** Newer Paperclip versions expire the key Papercliped gets when you approve the sign-in after 30 days. Papercliped now renews it about a week before: it asks your Paperclip for a fresh key (named "Papercliped (your username)", same 30-day expiry), stores it encrypted and revokes the old one. Keys of people who rarely use their connection are renewed by the periodic sweep. If a renewal fails, the current key keeps working and it is tried again later. Older Paperclip versions, whose keys don't expire, work as before. Self-hosters on Postgres: run the database migration before starting this version (`npm run migrate`, or `BRIDGE_AUTO_MIGRATE=1`); keys stored before it are assumed to expire 30 days after they were connected, and the first renewal check reads the real date from Paperclip.
- **Community cards.** Ready-to-post images for the launch and the new r/OpenSourcedd community, light and dark, 1600×900, in `web/public/brand/community/` (rebuilt by `web/scripts/community-cards.mjs`). Download them from papercliped.co/brand, and the README now opens with the launch card.

## v2.5.0 — icon pack, launch-ready docs and tester feedback

- **Icon pack.** papercliped.co/brand has a one-click ZIP with every Papercliped icon in light and dark: the app icon from 16 to 1024 px, a favicon, profile pictures safe for circle crops (Discord, X, GitHub, npm, MCP directories), an Android/installable-app icon, an X header, a 16:9 banner and link-preview images. They're built from the real mascot and the site's own components by `web/scripts/icon-pack.mjs`, so they always match. The website now also has a classic favicon, an Apple touch icon and a web app manifest.
- **Docs ready for launch.** Getting started and *Any AI app* now cover Codex and Claude Code (plugin or MCP server). ChatGPT setup leads with the MCP connector in developer mode, with GPT Actions as the alternative. The glossary explains the control room, sessions and access modes. The FAQ explains which access mode a blocked pause or wake needs. Stale links to the old manage page now point to the control room.
- **Tester feedback form.** GitHub → New issue → *Tester feedback* asks testers which app and host they used, where they got stuck and what they asked. A launch kit for maintainers (`docs/LAUNCH-KIT.md`) covers the pre-launch checklist, a founding-tester program, where to promote, ready-to-paste posts and the demo script.

## v2.4.2 — Show the real reason a plugin action failed

- **Fixed: the Papercliped page inside Paperclip now shows the real reason a sign-in or save failed**, such as "That username and secret key don't match." Paperclip reports every plugin failure as HTTP 502, and a proxy in front of Paperclip (Cloudflare, for one) replaces that with its own "Bad gateway" page, so the page showed only "Request failed: 502". The plugin now returns failures as ordinary answers and the page turns them back into messages.

## v2.4.1 — Show the real error instead of [object Object]

- **Fixed: the Papercliped page inside Paperclip showed "[object Object]" instead of the real error** (for example when the username or secret key didn't match). It now shows the message.

## v2.4.0 — the control room: manage every session, agent and tool inside Paperclip

- **The control room.** The Papercliped plugin now opens a control room inside Paperclip, in Paperclip's own design: a left menu that replaces the company menu (Overview, Sessions, Agents, Tools, Activity, Settings), the way Paperclip's own agent page does. See every connected AI app, what each may use, which agents it applies to, and what it has done. New guides: **The control room** and **API only, Full or Agent only**.
- **An access switch: API only, Full or Agent only.** One three-position switch (with a sliding knob, keyboard support and a small version for the dashboard) decides how AI apps may work with your Paperclip. **API only**: look and control Paperclip directly (pause, budgets, approvals, goals) but don't hand work to agents. **Agent only**: look and work through agents (create, assign and comment on issues, wake an agent) but no direct control. **Full** (the default, so nothing changes until you choose): both. It takes effect on the app's next request.
- **Set any agent apart.** On the Agents page, or on a new **Papercliped tab on every agent's page**, give an agent its own mode, or turn it **Off**: AI apps can't see it, touch it, or see what is assigned to it. Off agents are removed from lists and reports before the report is written, so they can't leak into a summary.
- **Sessions you can manage.** Every connected app is a session: give it a name, change its level, choose exactly which of the tools it may use (grouped as Look, Work through agents and Direct control), and choose whether it applies to everyone or only selected agents. A session limited to selected agents works only with those agents; it can't use views across every agent, and the page says so.
- **Blocked calls are visible.** A refused call returns a plain message naming the setting and where to change it (with a `policy` code in the API), and shows as **Blocked** in the new Activity page, which lists the newest calls, their session, tool and result, never what was sent or returned. AI apps are no longer shown tools that can never run for their session.
- **A dashboard widget** with the access switch in small, the number of sessions and how many calls were blocked today.
- **Tool reference shows each tool's kind** (a new "Works in" column), and `paperclip_api_request` is described correctly: `GET` works in every mode.
- **For API users:** new management endpoints `GET /sessions`, `POST|DELETE /sessions/:id`, `GET|POST|PUT /policy`, `GET /tools` and `GET /activity`; a new error class `policy_blocked` in the public API's aggregate error classes; migration `007_control_room.sql` adds two nullable columns and needs no backfill.
- **Update note.** Paperclip won't update a plugin to a version that asks for new permissions without an admin's approval, so to get the control room remove the Papercliped plugin in Settings → Plugins and install it again (or connect your Paperclip again with the install box ticked). Your account, sessions and settings are kept.
- **The Papercliped plugin now looks like part of Paperclip.** Its sidebar entry has the same paperclip icon, spacing, type, hover and highlighted-when-open look as Tasks, Artifacts and Cases, and the page uses Paperclip’s own cards, inputs, buttons, tabs and text styles, so it follows your theme (light, dark, seasonal) instead of imitating it.
- **Fixed: the Papercliped page inside Paperclip no longer invites your browser to fill in your Paperclip login.** The page shares an address with Paperclip’s own sign-in, so browsers offered your saved Paperclip email and password in the "Link your Papercliped account" fields, one click from sending that password to Papercliped as a "secret key". Those fields (and the confirm boxes) now tell the browser not to autofill. If you linked an account on 2.2.1, nothing needs doing; if a saved login was ever filled in, do not press Link.

## v2.3.0 — host your Paperclip anywhere, and a prompt gallery

- **Host your Paperclip: a step-by-step guide for every option.** A new docs section takes you from nothing to a running Paperclip with a public `https://` address, connected to Papercliped and answering your first prompt. It covers your own computer with a free tunnel (Cloudflare Tunnel, Tailscale Funnel, ngrok), a VPS with Docker and Caddy (Hetzner, DigitalOcean, Linode, Oracle's free tier), Railway, Render, Fly.io and Coolify, with a comparison of cost and effort. Every guide uses the official Paperclip image and the settings current Paperclip needs: authenticated mode with public exposure, your public URL, the two secrets, a persistent disk at `/paperclip`, creating the first admin with `paperclipai auth bootstrap-ceo`, and signing in your agents with API keys or a subscription. They also cover updates and backups. Hosts that sleep or have no disk are flagged as unsuitable.
- **Prompt gallery.** More than 40 ready-to-copy prompts at papercliped.co/prompts and in the docs (Guides → Prompt gallery). Run Paperclip in plain words instead of clicking through the dashboard: catch up in the morning, hand out issues, wake an agent and follow its run, answer approvals, set budgets and get reports. Each prompt shows the access level it needs and the tools it uses. You can search and filter by category or level.
- **Docs fixes:** the setup guide now uses Paperclip's real setting names and the current health check fields. Troubleshooting covers "hostname not allowed", connections that stop after Paperclip's 30-day key expiry (reconnect to fix), and agents stopping on restarts. The FAQ explains how Papercliped relates to Paperclip's new built-in MCP endpoint. Numbered steps with code blocks, and quotes, now render properly in the docs.

## v2.2.1 — the Papercliped plugin now installs in Paperclip

- **Fixed: the Papercliped plugin could not be installed in Paperclip.** Paperclip rejected it with a bare "400" because the sidebar entry declared a page route, which Paperclip only allows on pages. Installing it, automatically while connecting or by hand from Settings → Plugins, now works. The plugin’s tests now run Paperclip’s own manifest check so this can’t come back. If you ticked the box while connecting on 2.2.0, nothing was installed: connect again, or install it from Settings → Plugins.

## v2.2.0 — install the Papercliped plugin while connecting

- **The Papercliped plugin can install itself while you connect.** The "Connect your Paperclip" step has a new box, ticked by default: *Also install the Papercliped plugin in my Paperclip*. After you approve the sign-in, Papercliped asks your Paperclip to install `papercliped-paperclip-plugin` through Paperclip's own installer, using your own approved key. It installs one fixed package at the exact version that matches the service, only if you are the instance admin, and does nothing if the plugin is already there, you are not an admin, or your Paperclip has no plugin support. It never delays or fails your connection, and the outcome is logged as a short `plugin` event (installed, already, denied, unsupported or failed). Untick the box to skip it; installing by hand from Settings → Plugins still works.
- **Docs tidy-up:** the OAuth flow diagram and the security notes no longer mention a third "Admin" level (there are exactly two: Read only and Full control), and the repository ignores generated files (`openapi.json`, `.wrangler/`, coverage output) so they can't be committed by accident.
- **Fixed:** the website’s changelog date test only allowed 5–6 October 2026 and would have failed every later release; it now accepts any real date between the first release and today. The package check (`scripts/check-packages.mjs`) also runs on Windows now.

## v2.1.0 — two access levels, manage in Paperclip, new website

- **Dependencies up to date:** Zod 4 (tool schemas and the ChatGPT Actions OpenAPI now come from Zod's built-in JSON Schema; the published contract is unchanged), the latest MCP SDK, undici 8, TypeScript 7, Vitest 5, React 19 and esbuild 0.28 in the plugin, and GitHub Actions v7. No known vulnerabilities in either package. Dependabot now also watches the website and groups minor and patch updates into one pull request per package.

- **Install in one step from Claude Code and Codex.** Both plugin marketplaces live in this repository: `/plugin marketplace add OpenSourcx/papercliped` in Claude Code, `codex plugin marketplace add OpenSourcx/papercliped` in Codex. The plugin now connects to the hosted server (`https://mcp.papercliped.co/mcp`) instead of a local build that wasn't in the repository; people running Paperclip on their own machine use `npx papercliped@latest` (see the README).
- **A README that gets you running:** what Papercliped is and copy-paste setup for Claude, Claude Code, Codex, ChatGPT, any MCP app and local Paperclips, without visiting the docs.
- **Every push is a release.** CI publishes both npm packages, tags the commit and writes the GitHub release from the changelog and the commit descriptions. `scripts/version.mjs` bumps Major.Minor.Patch in every file, and a release skill for Claude and Codex (`.claude/skills/release`, `.agents/skills/release`) explains when to use which, and how to adopt the same flow in other repositories.
- **Ready for contributors:** `SECURITY.md` (private reporting, response times), a contributor guide with the path from first PR to maintainer, `CLAUDE.md`/`AGENTS.md` for AI coding agents, and a complete Discord setup in `docs/COMMUNITY.md`.

- **New website, phase 1 (foundation):** `web/`, a static React + Tailwind site with self-hosted fonts (Bricolage Grotesque, Inter, JetBrains Mono), the mascot as an animated component (eyes follow the pointer, blinks; still with reduced motion), a component kit and a `/kit` showcase page. **Seasonal themes:** the default `clip` theme plus two palettes per season, each with light and dark, rotating on a schedule that is the same for everyone on a given day; visitors can pick a theme and light/dark/system mode. Every theme passes WCAG AA contrast (tested), every route is checked in headless Chromium under the strict CSP, and nothing is loaded from third parties. Not yet served by the bridge (phase 4).
- **New website, phase 2 (pages):** a full landing page (live user count, an interactive how-it-works stepper, a permission playground generated from the real tool list, the two plugins, security highlights, FAQ), a **changelog page** built from this file with New/Improved/Fixed filters and an Atom feed (`/changelog.xml`), a **community page** (a suggest-a-feature form that pre-fills a GitHub issue, bug reports, contributing; social links only appear once they exist), a **brand page** with mascot and wordmark downloads and usage rules, and privacy and terms rendered from the same Markdown as the bridge. Playful but accessible interactions (lifting buttons, tilting cards, a mascot that hops), checked for sideways scrolling on a 375px phone. Also: `CODE_OF_CONDUCT.md`, issue and pull request templates, `docs/COMMUNITY.md` (forum and Discord plan), sitemap, robots.txt and a social preview image.

- **Public stats API** (no sign-in): `GET /api/public/v1/info`, `status`, `stats`, `series` and `errors` (plus `openapi.json`) publish aggregate users, live connections, sign-in success and failure reasons, request success rate, latency percentiles, error mix and load. Aggregate only: no usernames, aliases, ids, Paperclip addresses, app names or IPs, and no per-user breakdown (tested against memory and Postgres). GET-only, CORS-open without credentials, cached 30 s, 60 requests per minute per address. Types in `src/public-api/types.ts`. New docs page: **Public API and status**.
- **Status page** on the new website (`/status`): live status badge, people, connections, request and sign-in success, latency percentiles, and charts for requests and errors, response time and sign-ins, plus error-mix, sign-in-failure and top-tool bars. Every chart has a text summary and a table view and never relies on colour alone; it refreshes every 30 seconds.
- **Removed the operator panel from this repository** (`papercliped-panel`, `src/panel/`, the demo, `PANEL_*` settings, `docs/panel-role.sql`). The operator dashboard now lives in a separate, access-controlled service. Nothing changed in the database: the telemetry tables and the read-only `panel_*` views are still written and kept for it. `npm run build` now cleans `dist/` first.

- **New website, phase 3 (docs):** a docs site at `/docs` with a three-column layout (collapsible sections with counts, the article with breadcrumb, last-updated date, copy link and edit-on-GitHub, and an "On this page" outline that follows your scroll), previous/next links, copy buttons on code, and **Ctrl/Cmd-K search** built at compile time (no outside service). The **GitHub star count** shows in the header: the bridge fetches it from GitHub and caches it for an hour (`GET /api/public/v1/repo`), so browsers never call GitHub directly.
- **Much more documentation:** new pages What is Papercliped? (with a glossary), Run it yourself, Tool reference (generated from the code), Manage API, Environment variables, Command line, Limits and errors, and FAQ. Docs now have 20 pages in five sections; the bridge serves the same pages until the new site goes live.

- **The bridge serves the new website** (from `web/dist`, built into the Docker image) with **host routing** (`PUBLIC_HOSTS`): `papercliped.co` for the site, `docs.papercliped.co/topics` for the docs, `mcp.`/`api.papercliped.co` for MCP, OAuth and the APIs, `forum.` redirects to the forum, `www` redirects to the apex. Old `/docs/...` links redirect to the docs host. Every host still answers the protocol and API paths. Unknown pages return a real 404. Without the built site (e.g. the npm package), the bridge serves its Markdown pages as before. Setup and the issuer decision: `docs/DOMAINS.md`.
- **Sign-in, consent and manage pages restyled** with the website's fonts (Bricolage Grotesque, Inter, JetBrains Mono) and colours, including dark mode. Still plain server-rendered HTML.
- **New tool `papercliped_service_status`** (read only): the AI can check whether the hosted service is working, from the public status API. The catalogue is now 30 tools.
- **Paperclip plugin:** a "Papercliped service" card shows the bridge's public status (no link needed).

- **AI apps now connect at `https://mcp.papercliped.co/mcp`** (the OAuth issuer moves to `mcp.papercliped.co`; the website, docs and `/manage` stay on `papercliped.co`). Docs show the connector address through a new `{{MCP}}` placeholder, so self-hosted bridges show their own. Anyone connected before must remove the connector and add the new address.

- **Website redesign:** a bolder homepage (a centred headline, pill buttons, a gradient pill hero with the mascot in the middle; click it for a wave), a shorter header (Product, Docs, Resources, Community, search, GitHub stars, Get started). The docs get their own header (links left, "papercliped Docs" centred, search and stars right), a sidebar grouped into Learn, Reference and Project with icons, counts and collapsible sections, and a page header with breadcrumb, tag and a Copy link menu (view the Markdown source, suggest an edit). The changelog moves into the docs layout as expandable release cards.
- **Light and dark now follow your device automatically.** The manual System/Light/Dark switch is gone (an old saved choice is cleared); the seasonal palettes still rotate on their own.

- **Two access levels: Read only and Full control.** Full control is now every tool (pause, wake, terminate, issues, goals, comments, approvals, budgets and raw API writes), so you can run your Paperclip from anywhere. The separate "Admin" level is gone; existing admin grants and apps that still ask for it get Full control (migration `006_two_levels.sql` tidies stored grants). The sign-in page, the manage page, the Paperclip plugin, the docs and the website playground all show the two levels.

- **Managing your account moved into Paperclip.** The Papercliped plugin is now the connection manager: link it with your username and secret key (checked once, not stored), then change levels, disconnect apps, switch anonymity, see and remove linked Paperclips, make a new secret key (this Paperclip stays linked), disconnect your Paperclip or delete your account. The `/manage` web page, its cookie sign-in, one-time link codes and the beta opt-in are gone (`/manage` now points to the plugin docs); the manage API accepts plugin tokens only.

- **Docs live at `docs.papercliped.co/<page>`** (for example `docs.papercliped.co/permissions`), with a real docs landing at `docs.papercliped.co/`: search, the connector address, four start-here cards and every topic. Old `/topics/...` and `papercliped.co/docs/...` links redirect.

- **A cleaner homepage hero:** instead of decorative art, a live demo of the product. An AI app on the left steers a Paperclip on the right (pause an agent, weekly report, approve a request), using the real tool names, with tabs to replay each one. The footer gets X, GitHub and Discord icons (X and Discord point to the community page until their addresses are set).

- **The Papercliped page in Paperclip, rebuilt** with Paperclip's own components (status badges, metric cards, tables, toasts) so it looks native: a service panel, an account summary, and tabs for Connected apps (level dropdown, two-step disconnect), Privacy, Linked Paperclips and Account (new secret key shown once with copy, disconnect Paperclip, delete account). Covered by UI tests against the real plugin actions.

## v2.0.0 — stable open-source build

Papercliped v2 is the free, open-source foundation: the bridge, the connector for Claude and any MCP app, and the Paperclip plugin. Paid features (managed subdomains, pricing, legal) are planned for v3 (`docs/V3-SUBDOMAINS.md`).

- **New home: `https://papercliped.co`.** Every reference to the old domain is gone. The Paperclip plugin's default bridge URL is now `https://papercliped.co`. Operators: set `BRIDGE_PUBLIC_URL=https://papercliped.co`; apps connected under the old address must connect again (the OAuth issuer changed). Cloudflare + Render setup: `docs/LAUNCH.md` §3.
- **Two plugins, documented side by side:** Papercliped for AI apps (Claude, ChatGPT, any MCP client) and the Papercliped plugin for Paperclip. New docs page: **Any AI app (MCP)**.
- **Automated npm publishing** through GitHub Actions with npm trusted publishing (OIDC, no token): one tag publishes `papercliped` and `papercliped-paperclip-plugin` and creates the GitHub release (`docs/RELEASING.md`). CI now also packs both packages and installs them as a user would, and a test keeps every version string in step.
- **Foundation:** CodeQL, Dependabot, dependency audit and read-only permissions in CI; `CONTRIBUTING.md`; `docs/SITEMAP.md` (every page and endpoint); new docs page **Set up your Paperclip** (public address with or without a domain); the security doc covers plugin links.
- Fixed: the Claude Code install command in the README (`/plugin install papercliped@papercliped`).

Not tested live: the Paperclip plugin has never run inside a real Paperclip, and the release workflow has not run yet (it can only run on GitHub).

## v1.2.0-beta.1 — Paperclip plugin

- **Paperclip plugin** (`plugin/`, npm `papercliped-paperclip-plugin`, a separate package built on `@paperclipai/plugin-sdk`): a **Papercliped** sidebar entry and page inside Paperclip to link your account, list connected apps, switch them between Read only and Full control (beta), disconnect them, toggle anonymity, and unlink. The bridge URL is configurable (https only).
- **Plugin link API**: `POST /api/manage/plugin-link` (beta, browser session) makes a one-time `pcl_…` code (10 minutes, single use); `POST /api/manage/plugin-link/exchange` trades it for a long-lived `pcb_pl_…` token (rate-limited by address; wrong, used and expired codes answer identically); `GET /api/manage/plugin-links`; `DELETE /api/manage/plugin-links/:id`. The `/manage` page gains a **Link Paperclip plugin** section.
- **Plugin tokens** are accepted as `Authorization: Bearer` on the manage API (no CSRF header needed). They hold no scopes, so they cannot call any Paperclip tool or the MCP endpoint, and they cannot mint codes, change the beta, sign out, or reach any action that needs the secret key (rotate key, disconnect Paperclip, delete account); those return 403 and need the browser. A token can remove only itself.
- **Making a new secret key now also revokes every plugin link.**
- New docs page: Paperclip plugin.
- New docs page: **Set up your Paperclip**, a step-by-step guide to getting a public https address (Cloudflare Tunnel with your own domain, or Tailscale Funnel, ngrok or a Cloudflare quick tunnel without one).

Not tested: the plugin has never run inside a live Paperclip. It is covered by unit tests against a fake bridge and the SDK's test harness only.

## v1.1.0-beta.2 — connection manager, public site

- **Beta connection manager** at `/manage` and a management API (`/api/manage/*`): sign in with username + secret key, see every connected app, switch it between Read only and Full control (beta) with immediate effect, disconnect it, toggle anonymity, make a new secret key, disconnect your Paperclip, delete your account. Sensitive actions re-ask for the secret key; Admin is never grantable from here. Opt in with **Join the beta** on the permission screen (migration `005_beta.sql`, applied automatically).
- **Full control (beta)** is offered to everyone on the permission screen; Admin only when the app asks for it.
- **Public site** served by the bridge: an interactive landing page ("Papercliped, not Paperclipped."), live user count, docs (getting started, create your account, permissions, anonymous mode, manage connections, security, ChatGPT, troubleshooting), privacy and terms. A new smiling-paperclip favicon on every page.
- Windows-friendly test suite; `npm publish` only builds.
- Set `SITE_CONTACT` (an email or support URL) so the privacy and terms pages show a real contact.


## v1.0.0-beta.1 — first public beta

Papercliped connects Claude and ChatGPT to your own Paperclip: control agents, sync state, pull reports.

- **MCP server** (stdio + Streamable HTTP) and **ChatGPT Actions** (generated OpenAPI) over Paperclip's REST API.
- **Hosted multi-tenant bridge** with its own OAuth 2.1 server (DCR, PKCE, rotating refresh tokens, scopes read/control/admin).
- **Papercliped accounts**: choose a unique username (6–32 chars, at least one number or `. # _`) and get a secret key. Sign in with the key, or reconnect by approving in your Paperclip — you keep your account and a live connection.
- **Anonymous mode**: show as an alias (e.g. `Ann02`) in logs and the operator panel.
- **SSRF-hardened egress** for user-supplied Paperclip URLs; sealed (AES-256-GCM) stored credentials with key rotation.
- **Operator panel — a separate program** (`papercliped-panel`) reading a read-only database role: latency, system faults, success rate, user count, and the community log (`09:25:30 og.kpnwrld - joined cliped`).
- Free-tier friendly: keep-alive worker, database heartbeat, auto-migrate; one-paste Supabase schema (`docs/supabase-schema.sql`).

Known limits: not yet validated against live Render / Supabase / claude.ai / ChatGPT; code has not had an independent security audit. See `docs/SECURITY.md`.
