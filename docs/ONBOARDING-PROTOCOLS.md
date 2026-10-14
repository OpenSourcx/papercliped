# Onboarding: how each protocol step works

Notes on what happens from "add the connector" to "the AI can call tools", with the exact exchange at each step.
**Observed** = captured from the live service (`https://mcp.papercliped.co`, v2.2.0, 2026-10-07).
**From code** = read from `src/` but not exercised live in this pass (it needs a real Paperclip sign-in).

## The whole flow

```
AI app                         Papercliped bridge                      the user's Paperclip
  |  1 POST /mcp (no token) ------>|                                          |
  |<----- 401 + WWW-Authenticate --|                                          |
  |  2 GET  protected-resource ---->|   (where is the login server?)           |
  |  3 GET  authorization-server -->|   (what endpoints, what is supported?)   |
  |  4 POST /register ------------->|   (dynamic client registration)          |
  |  5 open /authorize in browser ->|   (PKCE, S256)  ... sign-in pages ...    |
  |                                 |-- 6 probe GET /api/health -------------->|
  |                                 |-- 7 POST /api/cli-auth/challenges ------>|
  |        user approves in Paperclip's own UI  <-----------------------------|
  |                                 |-- 8 poll challenge, GET /cli-auth/me --->|
  |<-- 9 redirect with ?code=... ---|                                          |
  | 10 POST /token (code+verifier)->|                                          |
  |<----- access + refresh token ---|                                          |
  | 11 POST /mcp  Bearer token ---->|-- 12 tool call with the user's key ----->|
```

## 1. Unauthenticated call is answered with a pointer (Observed)
`POST /mcp` with no token returns `401` and

`WWW-Authenticate: Bearer resource_metadata="https://mcp.papercliped.co/.well-known/oauth-protected-resource", scope="paperclip:read"`

This is the MCP authorization spec's discovery trigger: the client learns where to read the resource metadata. The `scope` hint is the minimum (read).

## 2. Protected-resource metadata (Observed)
`GET /.well-known/oauth-protected-resource` returns the resource (`https://mcp.papercliped.co/mcp`), its one authorization server (`https://mcp.papercliped.co`), the scopes `paperclip:read` and `paperclip:control`, and `bearer_methods_supported: ["header"]`.
The connector URL a user pastes must equal `<BRIDGE_PUBLIC_URL>/mcp`, because the issuer is baked into every token (changing it logs everyone out).

## 3. Authorization-server metadata (Observed)
`GET /.well-known/oauth-authorization-server` lists `/authorize`, `/token`, `/register`, `/revoke`; response type `code` only; grants `authorization_code` and `refresh_token`; PKCE method `S256` only; token endpoint auth `none` (public clients); scopes `paperclip:read`, `paperclip:control`, `offline_access`; and `authorization_response_iss_parameter_supported: true` (the redirect carries `iss`, which defends against mix-up attacks).

## 4. Dynamic client registration (Observed)
`POST /register` with a name and `redirect_uris` returns a `client_id` (`pcb_c_...`), no secret (public client), and the granted grant types and scopes.
Redirect URIs are checked against an allow-list of hosts (`claude.ai`, `claude.com`, `chatgpt.com`, plus loopback for local tools): a registration with another host is refused with `400`.

## 5. /authorize and the sign-in pages (Observed first page, rest From code)
The client opens `/authorize?response_type=code&client_id&redirect_uri&code_challenge&code_challenge_method=S256&state&scope&resource`. The bridge stores the request as a short-lived pending record and answers with **"Sign in to Papercliped"**, which has two forms:
- **Log in** (`POST /authorize/login`): username + secret key (`pcs_...`), for returning users.
- **Connect your Paperclip** (`POST /authorize/connect`): for new users or lost keys.

Every page carries a one-time request id and a CSRF token; steps must arrive in order (an out-of-order post just re-shows the right page). The pages are plain server-rendered HTML with a strict CSP.

### Connect path (From code, pages in `src/oauth/pages.ts`)
1. **Connect your Paperclip** (`POST /authorize/instance`): the user types their Paperclip address (public `https`, port 443 unless allowed). New in 2.2.0: a box, ticked by default, "Also install the Papercliped plugin in my Paperclip". The address passes the SSRF guard (public addresses only, no redirects, size and time limits, at most 5 tries per request).
2. **Probe**: `GET <paperclip>/api/health` must answer JSON with `status` and `deploymentMode: "authenticated"`. This is the step that failed on 2026-10-07 when the instance's database was down (the endpoint hung, which the bridge reports as "connection failed").
3. **Challenge**: `POST <paperclip>/api/cli-auth/challenges` (Paperclip's own CLI-login flow) returns a challenge id, a secret, a pending board token and an approval link. The bridge validates every field before use.
4. **Approve in Paperclip** (page "Approve in your Paperclip"): the user opens the approval link on their own Paperclip, signs in there (the bridge never sees that password) and approves. The page polls `/authorize/status`.
5. **Approved** (`POST /authorize/approved`): the bridge checks the challenge is approved, then `GET /api/cli-auth/me` with the board token to learn the Paperclip user id. If that Paperclip user already has a Papercliped account the user is signed straight in. If the box was ticked, the plugin install starts in the background here (see below).
6. **Username** (new users): choose a username (and optionally anonymity); the account is created.
7. **Secret key**: shown once. It signs the user in next time without Paperclip's approval.
8. **Access level**: exactly two, **Read only** (`paperclip:read`) and **Full control** (`paperclip:control`, every tool). Read only is preselected unless the app asked for control.
9. **Decision** (`POST /authorize/decision`): the bridge issues a one-use authorization code (valid 60 seconds) bound to the client, redirect URI, PKCE challenge and scopes, and redirects to the app with `?code=...&state=...&iss=...`.

### Log-in path (From code)
Username + secret key replaces steps 1-5. If the stored Paperclip credential has expired, the bridge sends the user back through the connect path once ("Your Paperclip connection has expired").

## 6. Plugin install during connect (From code, tested against a stand-in Paperclip)
Only if the box is ticked, after step 5 succeeds and without delaying the redirect:
1. `GET <paperclip>/api/plugins` with the user's new board token; look for plugin key `papercliped.remote-control`.
2. Already there: stop (event detail `already`). `403/404`: stop (`unsupported`).
3. Otherwise `POST <paperclip>/api/plugins/install` with exactly `{ packageName: "papercliped-paperclip-plugin", version: <this bridge's version> }`. Paperclip allows it only for an instance admin (`403` otherwise, recorded as `denied`). The response's package name is checked.
   Paperclip runs `npm install <pkg>@<version> --ignore-scripts` into its own plugins folder, then checks the plugin's manifest against its schema, the plugin API version, the capabilities, page-route conflicts and the minimum host version, and registers it. A failure at any of those is a bare `400` in Paperclip's log with no reason. (Observed 2026-10-07: 2.2.0 downloaded fine, then failed the schema because its sidebar slot declared a `routePath`. Fixed in 2.2.1; the plugin's tests now run Paperclip's own `pluginManifestV1Schema`.)
4. One `plugin` event is recorded with a single word: `installed`, `already`, `denied`, `unsupported` or `failed`. Nothing here can fail the connection.

## 7. Token exchange (Observed error shape, rest From code)
`POST /token` with `grant_type=authorization_code`, the code, `redirect_uri`, `client_id` and the PKCE `code_verifier`. A wrong or expired code returns `{"error":"invalid_grant","error_description":"Invalid or expired authorization code"}` (Observed). On success the bridge returns an opaque access token (`pcb_at_...`, 1 hour by default) and a rotating refresh token (30 days by default, `offline_access`). Tokens are stored only as hashes; the user's Paperclip key is stored sealed (encrypted) with the bridge secret.

## 8. Calling tools (From code)
`POST /mcp` with `Authorization: Bearer pcb_at_...`. The bridge looks up the grant, decrypts the user's Paperclip key, checks the grant's scopes against the tool (read-only tools need `paperclip:read`; anything that changes state needs `paperclip:control`), calls that user's Paperclip `/api`, and writes one audit event (tool name, whether it changed anything, ok or a coarse error class, scope needed, timings, the caller's grant id, username and Paperclip host; never tool arguments or results). Each connection is rate-limited (120 calls a minute by default). A refresh token swaps for a new pair and is single-use: presenting an old one a second time is treated as theft and revokes the whole connection (`Refresh token already used`). A refresh can never ask for more than the original grant.

## 9. Ending a connection (From code)
`POST /revoke`, disconnecting in the Papercliped plugin, or 30 days of inactivity revokes the grant, and the bridge asks the user's Paperclip to revoke the board key it was issued (`POST /api/cli-auth/revoke-current`, best effort).

## What was not done in this pass
No account was created and no real sign-in was approved. The steps marked From code have not been exercised against a live Paperclip in this pass.
