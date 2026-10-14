# OAuth (Phase 2): connect claude.ai, Claude Desktop/mobile and ChatGPT apps

With `BRIDGE_OAUTH=1` the bridge is an OAuth 2.1 authorization server **and** the protected resource (`/mcp`). Clients discover it, register themselves, and send the user through a consent page. The user signs in with **Paperclip's own approval flow**, so the bridge never handles their password.

```
client ──401 + resource_metadata──▶ bridge /mcp
client ──DCR /register──────────────▶ bridge
client ──/authorize (PKCE S256)─────▶ bridge ──create challenge──▶ Paperclip /api/cli-auth/challenges
user   ── opens approvalUrl, signs in to Paperclip, approves ─────▶ Paperclip
user   ── picks Read only / Full control, presses Allow ────────▶ bridge (verifies approval, checks token)
client ──/token (code + verifier)───▶ bridge ──▶ opaque access + rotating refresh token
client ──/mcp  Bearer pcb_at_…──────▶ bridge ──user's board token──▶ Paperclip
```

## Setup (self-hosted)

```sh
export PAPERCLIP_API_URL=http://localhost:3100
export PAPERCLIP_PUBLIC_URL=https://paperclip.example.com   # where the USER's browser reaches Paperclip
export BRIDGE_OAUTH=1
export BRIDGE_PUBLIC_URL=https://bridge.example.com          # https origin, no path
export BRIDGE_SECRET=$(openssl rand -hex 32)                 # keep it; losing/rotating it disconnects everyone
export BRIDGE_DATA_FILE=/var/lib/paperclip-bridge/state.json # omit = memory only (restart disconnects everyone)
npm run start:http                                           # put TLS in front (Caddy / Cloudflare Tunnel / …)
```

- **claude.ai / Desktop / mobile:** Settings → Connectors → *Add custom connector* → `https://bridge.example.com/mcp`. Leave client ID/secret empty (Claude registers itself). Allow Anthropic's egress range `160.79.104.0/21` if you firewall.
- **Claude Code:** `claude mcp add --transport http paperclip https://bridge.example.com/mcp`, then `/mcp` to sign in. (Or keep using stdio.)
- **ChatGPT MCP app (developer mode):** point at the same `/mcp` URL. **[unverified]** ChatGPT's redirect hosts are in the default allow-list from secondary sources; if sign-in is refused with "redirect host … not allowed", add the host to `BRIDGE_OAUTH_REDIRECT_HOSTS`.
- **Instances without the approval flow** (or `local_trusted` with remote clients): `BRIDGE_LOGIN=static` + `BRIDGE_TOKEN`. The consent page then asks the operator for `BRIDGE_TOKEN` and the bridge uses `PAPERCLIP_API_KEY` for upstream calls. Everyone who connects shares that one Paperclip identity.

## Scopes (enforced by the bridge — Paperclip's keys have none)

| Scope | Allows |
| --- | --- |
| `paperclip:read` | lists, reports, sync, raw GET |
| `paperclip:control` | every tool: + pause/resume/wake/terminate, issues & goals, comments, approvals, budgets, raw non-GET |

Control includes read. The user picks a level on the consent page (Read only is preselected unless the app asked for control). The retired `paperclip:admin` scope is accepted as an alias for `paperclip:control`. Tools above the grant aren't even advertised to the model, and a call is refused with `403 insufficient_scope`.
**What scopes do not do:** limit *which company* or agent a grant can touch. The underlying Paperclip board key is user-wide, and the bridge cannot tell which company an agent/issue id belongs to. Per-company scoping needs scoped board keys upstream (Phase 3).

## Security properties (each covered by a test in `test/oauth.test.ts`)

- PKCE `S256` mandatory; single-use 60 s codes; **code replay revokes the tokens it produced**; `client_id`/`redirect_uri` re-checked at exchange.
- Never redirects to an unregistered `redirect_uri`; registration only accepts allow-listed https hosts + loopback (port-agnostic per RFC 8252); public clients only.
- Opaque tokens, only SHA-256 hashes stored; refresh tokens rotate and **reuse revokes the whole grant** and the Paperclip key (`revoke-current`).
- The Paperclip credential is sealed with AES-256-GCM (key derived from `BRIDGE_SECRET`) and deleted on revoke; it is never returned to any client.
- Consent page: CSRF token, CSP (`frame-ancestors 'none'`), escaped client names, loopback warning, rate limits on authorize/decision/token/register and on admin-token guesses.
- Every tool call is audit-logged as a JSON line (tool, mutation, ok/status, grant id, client name, Paperclip user id) — never tokens or arguments.
- Access tokens last 1 h, refresh 30 d (sliding). Operators can revoke a grant via `OAuthProvider.revokeGrant`; users via the client's "disconnect" (`/revoke`).

## Single vs multi-tenant, and storage

- `BRIDGE_MODE=single` (default): the bridge fronts the one Paperclip at `PAPERCLIP_API_URL`. State: a JSON file (`BRIDGE_DATA_FILE`, single process) or Postgres (`DATABASE_URL`).
- `BRIDGE_MODE=multi`: a **public** service. The consent page first asks the user for *their* Paperclip address; the bridge validates it (https, public DNS name only — see `src/net/safe-fetch.ts`), probes `/api/health`, starts the Paperclip approval flow **on that instance**, and binds the grant to it. Requires Postgres, `BRIDGE_LOGIN=paperclip`, and no `BRIDGE_TOKEN`. Deployment: [DEPLOY-RENDER.md](DEPLOY-RENDER.md). Threat model: [SECURITY.md](SECURITY.md).
- The Postgres store (`src/oauth/pg-store.ts`) is multi-process safe: consuming a code/refresh token and rate-limit counting are single atomic statements, and consent state lives in the database too. Migrations: `npm run migrate`.
- FastAPI/Python: not needed — the Node service is the tested implementation; rewriting would duplicate the security-critical logic.

## Not implemented yet

CIMD (Client ID Metadata Documents; the new SSRF-safe fetch makes it feasible), per-company scoping (blocked on Paperclip), a grant-admin web UI (CLI exists), and Anthropic-held client credentials. DCR is the only registration path, so very busy public deployments will accumulate registered clients (idle ones are pruned after 7 days; capped at 1000).
