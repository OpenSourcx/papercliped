# Paperclip compatibility

Papercliped talks to a Paperclip it does not ship, over Paperclip's REST API and its plugin system. This page says which Paperclip versions that has been checked against, how, and what to do when a new one comes out.

## Supported versions

| Paperclip (`paperclipai`) | Status | Checked how |
| --- | --- | --- |
| **2026.1023.0** (latest stable at the time of writing) | Supported, certified | A real instance (Node 24.21, embedded Postgres) ran the login flow, key renewal, every route the tools call, the plugin install and the role checks below. `test/paperclip-contract.test.ts` pins its route list. |
| 2026.1005.0 | Supported, not run live | The same contract test passes against its OpenAPI document: every route the bridge calls exists there. |
| 2026.1012.0 | Expected to work, not checked | Between the two above. |
| 2026.318.0 to 2026.1001.0 | Best effort | `/agents/:id/wakeup` and `/board-api-keys` exist from 2026.318 on. Older keys never expire, so renewal is skipped. |
| Nightly, canary, beta | Not supported | They change without notice. |

Paperclip needs Node 24.11 or later (`engines` of the package). Papercliped itself does not run Paperclip, so this only matters for the person who hosts it.

## What Papercliped calls

- **Login:** `POST /cli-auth/challenges`, the person approves in Paperclip's own page, `GET /cli-auth/challenges/:id`, then `GET /cli-auth/me`.
- **Key renewal:** `GET /board-api-keys` (to read this key's expiry), `POST /board-api-keys` with the old key (a new key for the same user, 30-day expiry), `POST /cli-auth/revoke-current` with the old key. Checked live on 2026.1023.0: the new key works, the old one answers 401 once revoked.
- **Tools:** the routes in `src/tools.ts`. `paperclip_wake_agent` uses `POST /agents/:id/wakeup` with `{ source: "on_demand", triggerDetail: "manual" }`. Paperclip also serves a legacy `POST /agents/:id/heartbeat/invoke` (empty body allowed), kept only for old callers; `/wakeup` rejects a request with no JSON body with a 400.
- **Plugin:** `GET /plugins`, `POST /plugins/install` (instance admins only, anyone else gets 403, reported as "denied"). The plugin is built against `@paperclipai/plugin-sdk` 2026.1023.0, plugin API version 1, and its manifest passes `pluginManifestV1Schema`; it was installed into a running 2026.1023.0 and reached `ready`.

## Which Paperclip role the connected person needs

The key Papercliped holds is the Paperclip user's own board key: it can do what that user can do in their companies, nothing is narrowed on Paperclip's side. So the role is the person's company membership. Measured on 2026.1023.0 with one key per role:

| Tool | Viewer | Operator | Admin |
| --- | --- | --- | --- |
| List companies, agents, issues, costs, activity, approvals | yes | yes | yes |
| Create or update issues, comment, create goals | **no (403)** | yes | yes |
| Pause, resume, wake, set budget, terminate an agent | **no (403)** | yes | yes |
| Install the Papercliped plugin into Paperclip | no | no | no (instance admin only) |

- **Read only** access in Papercliped needs only **Viewer**.
- **Full control** needs **Operator**. Owner and Admin add nothing the tools use (they add inviting people, approving join requests and managing permissions), so use Operator as the least-privilege role.
- Since 2026.1023 an Operator holds 14 permission grants (it held 1): create and configure agents, create skills, manage environments, invite users, assign tasks, pipelines, and the tool grants. Papercliped's tools use none of the extra ones. If that is more than you want, narrow the member in Paperclip (`PATCH /companies/:id/members/:memberId/permissions`) or give the person Viewer and accept read only.
- The one-click plugin install needs an **instance admin**. Anyone else installs the plugin from Paperclip's own plugin page.

## Key expiry

Paperclip's board keys expire after 30 days. Papercliped renews each key about a week before (see `docs/SECURITY.md` and the changelog for 2.5.1). Renewal uses the old key, so a key that has already expired (401) cannot be renewed: the person connects again. Keys on Paperclip versions that list no expiry are treated as expiring 30 days after they were issued until the first renewal check reads the real date.

## When a new Paperclip comes out

1. Start a throwaway instance of it (loopback, its own `PAPERCLIP_HOME`), sign up, claim the instance.
2. `node scripts/paperclip-routes.mjs http://127.0.0.1:<port> <version>` rewrites `test/fixtures/paperclip-routes.json`.
3. `npm test`. A failure in `test/paperclip-contract.test.ts` names the call that no longer exists.
4. Bump `@paperclipai/plugin-sdk` in `plugin/package.json`, run the plugin's typecheck, tests and build, and install the built plugin into the instance.
5. Update the table above and add a changelog entry.
