# Account-page API: connected AI apps

The Papercliped account page (auth.papercliped.co/account) lists the AI apps (Claude, ChatGPT, Codex, any MCP client) connected to the signed-in person's account, and lets them disconnect one. The grants live here, in the gateway; Connect only proves who is signed in.

| Endpoint | Purpose | Body |
| --- | --- | --- |
| `POST /account/apps` | List the account's live grants | `{ "assertion": "<apps.list>" }` |
| `POST /account/apps/revoke` | Revoke one grant | `{ "assertion": "<apps.revoke for that grant>", "grantId": "<id>" }` |

**Off by default.** Set `BRIDGE_ACCOUNT_API_PUBLIC_KEY` (the Ed25519 public key, PEM) on a `BRIDGE_MODE=multi` bridge to turn it on. It has its own key and does not depend on `BRIDGE_CENTRAL_AUTH`; turning it on changes nothing about how apps connect. Without the key both endpoints answer 404.

**Assertion.** A JWT-shaped, EdDSA-signed token from Connect: header type `PCD-MCP-ACCOUNT`, issuer `https://connect.papercliped.co`, audience `https://mcp.papercliped.co/account`, the account id as `sub`, exactly one `purpose` (`apps.list` or `apps.revoke`), the grant id as `gid` for a revoke only, 60 seconds, and a random `jti` that works once. A login handoff cannot be used here, or the other way round (different type and audience).

**Rules.** The only allowed `Origin` is `https://auth.papercliped.co`; CORS allows `POST` and a JSON body, never credentials; no cookie and no bearer is read. A person only ever sees or revokes their own grants: someone else's grant, a missing one and an already-revoked one all answer 404. Responses never contain a credential, token or instance address. Rate limited per address. Disabled accounts get 403.

Rollout and rollback are in the Connect repository: `docs/runbooks/connected-apps.md`.
