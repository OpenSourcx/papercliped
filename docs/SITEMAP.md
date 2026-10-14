# Site map: every page and endpoint

Current as of v2.0.0 (read from the route code). Items marked **(planned v3)** do not exist yet. `{{URL}}` is the bridge's public address (today `https://papercliped.co`).

## 0. Hosts
One service, routed by host (`PUBLIC_HOSTS`, `src/web/`): `papercliped.co` the website, `docs.papercliped.co` the docs (landing at `/`, pages at `/<page>`), `mcp.`/`api.papercliped.co` the protocol and APIs, `forum.` a redirect, `www.` a redirect to the apex. See `docs/DOMAINS.md`. Below, docs paths are shown as `/docs/<page>`; on the docs host they are `/<page>`.

## 1. Public website (React, `web/`; the bridge's Markdown pages in `src/site/` are the fallback)
| Path | Page |
| --- | --- |
| `/` | Landing page ("Papercliped, not Paperclipped."), live user count |
| `/status` | Live status page (public API) |
| `/changelog` | Changelog (and `/changelog.xml` feed) |
| `/community` | Community |
| `/brand` | Brand assets |
| `/kit` | Design kit (not indexed) |
| `/docs` | Redirects to `/docs/getting-started` |
| `/docs/getting-started` | Getting started |
| `/docs/what-is-papercliped` | What is Papercliped? (overview and glossary) |
| `/docs/self-hosting` | Run it yourself |
| `/docs/tools` | Tool reference (generated from `src/tools.ts`) |
| `/docs/manage-api` | Manage API |
| `/docs/environment` | Environment variables |
| `/docs/cli` | Command line |
| `/docs/limits-and-errors` | Limits and errors |
| `/docs/faq` | FAQ |
| `/docs/signup` | Create your account |
| `/docs/connect-your-paperclip` | Set up your Paperclip (public address, tunnels, domains) |
| `/docs/manage` | Manage connections |
| `/docs/paperclip-plugin` | Paperclip plugin |
| `/docs/permissions` | Permissions |
| `/docs/control-room` | The control room |
| `/docs/access-modes` | API only, Full or Agent only |
| `/docs/anonymous-mode` | Anonymous mode |
| `/docs/public-api` | Public API and status |
| `/docs/security` | Security |
| `/docs/other-ai-apps` | Any AI app (MCP) |
| `/docs/chatgpt` | ChatGPT setup |
| `/docs/troubleshooting` | Troubleshooting |
| `/privacy` | Privacy policy |
| `/terms` | Terms of service |
| `/favicon.svg`, `/favicon.ico` | Favicon |
| `/api/public/stats` | JSON: user and connection counts only (legacy; see section 6) |
| `/domain` **(planned v3)** | Get a public address: guide, own domain, or the paid managed subdomain |
| `/docs/subdomain-terms` **(planned v3)** | Subdomain Terms (drafted separately) |

## 2. Sign-in and consent (OAuth screens, shown inside Claude/ChatGPT flows) — `src/oauth/`
| Path | Purpose |
| --- | --- |
| `GET /authorize` | Start: sign in with username and secret key, or connect your Paperclip |
| `GET /authorize/status` | Polling while the user approves in Paperclip |
| `POST /authorize/login`, `/connect`, `/instance`, `/approved`, `/username`, `/welcome`, `/continue`, `/decision` | The steps of the screens above (login, enter address, approve, pick username, secret key shown once, consent: Read only / Full control, Appear anonymously) |
| `/authorize` link "No public address?" **(planned v3)** | Links to `/domain` |

## 3. Account management (inside Paperclip, via the plugin) — `src/manage/`
| Path | Purpose |
| --- | --- |
| `GET /manage` | Old address: redirects to `/docs/paperclip-plugin` |
| `/api/manage/*` | JSON API used by the Paperclip plugin (bearer token only, no cookies): `plugin-link/sign-in`, `me`, `connections`, `connections/:id`, `sessions`, `sessions/:id`, `policy`, `tools`, `activity`, `privacy`, `plugin-links`, `plugin-links/:id`, `secret/rotate`, `paperclip/disconnect`, `account/delete` (the last three need the secret key again) |
| Domain section in the plugin **(planned v3)** | Pro members: address, tunnel status, token, port, release |

## 4. AI client endpoints
| Path | Purpose |
| --- | --- |
| `/mcp` | MCP over Streamable HTTP (Claude and other MCP clients) |
| `/actions/<tool>` | ChatGPT Actions, one per tool |
| `/openapi.json` | OpenAPI description for GPT Actions |
| `/register`, `/token`, `/revoke` | OAuth 2.1 dynamic client registration, tokens, revocation |
| `/.well-known/oauth-authorization-server` | OAuth server metadata |
| `/.well-known/oauth-protected-resource`, `/.well-known/oauth-protected-resource/mcp` | Protected-resource metadata |

## 5. Operations
| Path | Purpose |
| --- | --- |
| `/healthz` | Liveness |
| `/readyz` | Readiness (database ping) |

## 6. Public stats API (no sign-in, aggregate only) — `src/public-api/`
| Path | Purpose |
| --- | --- |
| `GET /api/public/v1/info` | Version, endpoints, limits |
| `GET /api/public/v1/status` | ok / degraded / down |
| `GET /api/public/v1/stats?window=1h\|24h\|7d` | Users, connections, sign-ins, requests, errors, load |
| `GET /api/public/v1/series?window=…` | The same over time |
| `GET /api/public/v1/errors?window=…` | Error mix and sign-in failure reasons |
| `GET /api/public/v1/repo` | GitHub stars, forks and open issues (cached hourly, fetched by the bridge) |
| `GET /api/public/v1/openapi.json` | OpenAPI for this API (separate from the Actions document) |

The operator dashboard is a separate, access-controlled service and is not part of this repository.

## 7. Not web pages
- **Paperclip plugin** (`plugin/`, runs inside Paperclip): sidebar entry "Papercliped" and page at `/<company>/papercliped`.
- **Home-server provisioner** **(planned v3)**: no pages; polls the bridge's job queue.
- **Repo docs** (`docs/`, not served): ARCHITECTURE, SECURITY, LAUNCH, DEPLOY-RENDER, RELEASING, SITEMAP, V3-SUBDOMAINS, oauth, chatgpt, legal templates, SQL files.
