# papercliped-paperclip-plugin

Papercliped inside Paperclip: a **control room** for the AI apps connected to your Paperclip. See every session, choose what each may use and which agents it applies to, set **API only / Full / Agent only** for every agent or one at a time, and read what happened, in Paperclip's own design.

Guides: [The control room](https://docs.papercliped.co/control-room) and [API only, Full or Agent only](https://docs.papercliped.co/access-modes). Design notes for contributors: `docs/CONTROL-ROOM.md` in the repository.

> Tested against a fake bridge, the SDK test harness, and Paperclip's own manifest and capability validators; the UI's classes were checked against a live Paperclip's stylesheet.

## Install
From **Settings → Plugins** in Paperclip, install the npm package `papercliped-paperclip-plugin` (instance admin only). Capabilities requested: `plugin.state.read`, `plugin.state.write`, `http.outbound`, `agents.read`, `ui.sidebar.register`, `ui.page.register`, `ui.detailTab.register`, `ui.dashboardWidget.register`. Paperclip won't *upgrade* a plugin to a version that asks for new capabilities without an admin's approval: moving from 2.2.x to 2.4, remove the plugin and install it again.

Config: **Papercliped bridge URL** (default `https://papercliped.co`, must be https).

## Use
1. In Paperclip open **Papercliped** in the sidebar.
2. Enter your Papercliped username and secret key and click **Link** (the key is checked once by the bridge and not stored).

Then use the control room: **Overview** (the access switch), **Sessions** (name, level, tools, agents, recent calls, disconnect), **Agents** (a mode per agent, or Off), **Tools**, **Activity**, and **Settings** (privacy, linked Paperclips, your account: new secret key, disconnect Paperclip, delete account; these ask for the secret key again). There is also a **Papercliped tab on every agent's page** and a **dashboard widget**.

## How it works
- The page calls plugin **actions** (`status`, `link`, `connections`, `sessions`, `setSession`, `policy`, `setPolicy`, `tools`, `activity`, `agents`, `setLevel`, `disconnect`, `privacy`, `links`, `removeLink`, `unlink`, `rotateSecret`, `disconnectPaperclip`, `deleteAccount`, `serviceStatus`). Actions receive the host-verified `actor.userId` and `companyId` (the page's own parameters are never trusted for either); the bridge token is stored in plugin state keyed by a hash of that id and is never returned to the page.
- The worker calls the bridge's `/api/manage` with `Authorization: Bearer pcb_pl_…`. That token has no scopes: it cannot call Paperclip tools. Secret-key actions send the key in that one request; it is never stored.
- Plugin UI and worker are trusted, same-origin code in Paperclip; install only from the official package.

## Develop
```sh
npm install
npm run typecheck && npm test
npm run build     # worker, manifest and UI bundles in dist/
```
Layout: `src/bridge.ts` (bridge client), `src/keys.ts` (per-user state keys), `src/handlers.ts` (action logic), `src/worker.ts`, `src/manifest.ts`, `src/ui/` (`index.tsx` mounts the slots; `Slots.tsx` the left menu, agent tab and dashboard widget; `Sidebar.tsx` the sidebar entry; `room.tsx` shared data and navigation; the pages `Overview`, `Sessions`, `AgentsView`, `ToolsView`, `ActivityView`, `Settings`; `Switch.tsx` the access switch; `look.ts` Paperclip's classes; `LinkForm.tsx`, `Confirm.tsx`, `Service.tsx`). The page uses Paperclip's own components from `@paperclipai/plugin-sdk/ui` (`StatusBadge`, `MetricCard`, `DataTable`, `KeyValueList`, `Spinner`, `ErrorBoundary`, toasts), so it matches the host. `test/ui.test.tsx` drives the page against the real handlers and a fake bridge.
