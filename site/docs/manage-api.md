# Manage API

The JSON API behind the [Paperclip plugin](/docs/paperclip-plugin). It only ever acts on the account the token belongs to.

Base path: `{{URL}}/api/manage`. Responses are JSON with `Cache-Control: no-store`. Requests with a body send `Content-Type: application/json`.

## Linking
`POST /plugin-link/sign-in` with `{ "username": "...", "secret": "pcs_...", "instanceHost": "paperclip.example.com", "paperclipUserId": "..." }` answers `{ "token": "pcb_pl_..." }`. The secret key is checked once and not stored. Every other call sends `Authorization: Bearer pcb_pl_...`. There are no cookies.

The token has no scopes: it can't call MCP, Actions or any Paperclip tool. It lasts 180 days, and ends when you unlink, make a new secret key, disconnect your Paperclip or delete your account.

## Endpoints
| Method and path | What it does |
| --- | --- |
| `POST /plugin-link/sign-in` | Link: username + secret key → plugin token |
| `GET /me` | Name, anonymity, connected Paperclip |
| `GET /connections` | Connected apps with level and last use (also `GET /sessions`, which is the same list under the name the control room uses) |
| `GET /sessions` | Sessions: each with `label`, `level`, `tools` (or `null` for all) and `agents` (or `null` for everyone) |
| `POST /sessions/:id` `{ "label", "tools", "agents", "level" }` | Change one session. Leave a field out to keep it; `null` clears a limit. Takes effect on the next request |
| `DELETE /sessions/:id` | Disconnect a session |
| `GET /policy` | The access switch and per-agent settings: `{ "mode": "api" \| "full" \| "agent", "agents": { "<agent id>": "api" \| "full" \| "agent" \| "off" } }` |
| `POST /policy` (or `PUT`) | Replace them with the same shape |
| `GET /tools` | Every tool with its `access` and its `surface` (`read`, `agent` or `api`) |
| `GET /activity?session=:id&limit=:n` | The newest tool calls (names and outcomes only), up to 200 |
| `POST /connections/:id` `{ "level": "read" \| "control" }` | Change an app's level |
| `DELETE /connections/:id` | Disconnect an app |
| `POST /privacy` `{ "anonymous": true }` | Turn anonymity on or off |
| `GET /plugin-links` | Linked Paperclips (`current` marks this token's) |
| `DELETE /plugin-links/:id` | Remove one of your links (`self` for this one) |
| `POST /secret/rotate` `{ "secret": "..." }` | New secret key; answers `{ secret, token }` (every other link ends) |
| `POST /paperclip/disconnect` `{ "secret": "..." }` | Forget your Paperclip key and disconnect every app (and every link) |
| `POST /account/delete` `{ "secret": "...", "confirm": "<username>" }` | Delete the account |

The last three need your secret key in the request.

A session's `tools` must be known tool names and `agents` agent ids; an empty list is refused (use `null` for "all"). Per-agent settings equal to the default are dropped. See [API only, Full or Agent only](/docs/access-modes).

The activity list holds, for each call: `at`, `tool`, `ok`, `blocked`, `status`, `error` (a coarse class such as `policy_blocked`), `ms`, `session` and `app`. It never holds what was sent to a tool or what came back.

## Errors
`400` bad input, `401` wrong username or key when linking, or the token is unknown, expired or revoked, `403` wrong secret key for a sensitive action, `404` no such connection or link (also for other people's), `429` too many requests.

## Limits
Linking and secret-key checks share the sign-in page's limits (see [Limits and errors](/docs/limits-and-errors)). Other requests are limited to 120 per minute per account.
