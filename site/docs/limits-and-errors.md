# Limits and errors

## Rate limits
Limits are per minute unless noted, counted per client address (or per account or connection where it says so). Going over returns `429`; wait and retry.

| What | Limit |
| --- | --- |
| Tool calls through one connection | 120 per minute (`BRIDGE_CALLS_PER_MINUTE`) |
| Sign-in attempts | 20 per address, and 8 per username per 15 minutes |
| Entering Paperclip addresses during connect | 20 per address; each sign-in session allows a few tries |
| New accounts | 10 per address |
| OAuth: client registration / token / revoke | 20 / 60 / 30 per address |
| Manage API (signed in) | 120 per account |
| Linking the Paperclip plugin | shares the sign-in limits |
| Public API (`/api/public/v1/*`) | 60 per address; responses cached 30 s |

## Errors from tools
Tool errors come back to your AI app with a message it can read. Over HTTP (ChatGPT Actions) they are JSON `{ "error": ... }` with these statuses:

| Status | Class | Meaning | What to do |
| --- | --- | --- | --- |
| `400` | `invalid_input` | The request didn't match the tool's inputs | Usually the AI retries with fixed input |
| `403` | `insufficient_scope` | The connection's level is too low for this tool | Switch the app to Full control in the [Paperclip plugin](/docs/paperclip-plugin) |
| `403` | `policy_blocked` | Your settings don't allow this call: the access switch, an agent's setting, or the session's tool or agent list. The error carries a `policy` code (see [API only, Full or Agent only](/docs/access-modes)) | Change the setting in the [control room](/docs/control-room) if you want it allowed |
| `403` | `read_only` | The bridge runs with `PAPERCLIP_READ_ONLY` | Ask the operator |
| `401`, `403`, `404`, `409`… | `upstream_4xx` | Paperclip refused (e.g. your Paperclip key was revoked: reconnect) | Check the message |
| `5xx` | `upstream_5xx` | Paperclip had an error | Try again later |
| `502` | `upstream_unreachable` | Paperclip couldn't be reached | Check your Paperclip and tunnel |
| `429` | `rate_limited` | Too many calls | Slow down |
| `401` | `unauthorized` | Missing or expired token | The app re-authenticates; or reconnect |
| `500` | `internal` | A bug on our side | Report it |

The [public API](/docs/public-api) and the website's status page show these classes as aggregate counts.
