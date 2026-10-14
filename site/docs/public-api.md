# Public API and status

Papercliped publishes how the service is doing as **aggregate numbers**, free to read with no sign-in: for status pages, dashboards and anyone curious. The website's status page uses the same API.

## What it is (and isn't)
- **Aggregate only.** Totals, rates, latency percentiles and fixed categories. It never returns usernames, aliases, account or connection ids, Paperclip addresses, app names, IP addresses, tokens or free text, and never breaks numbers down per person or per Paperclip.
- **Read only.** `GET` only. No cookies, no credentials.
- **Open to any site.** CORS allows any origin for `GET`.
- **Cached and limited.** Responses are cached for 30 seconds (`Cache-Control: public, max-age=30`). Each address may make 60 requests per minute; beyond that you get `429` with `Retry-After: 60`.

Base URL: `{{URL}}`

## Endpoints
| Endpoint | What you get |
| --- | --- |
| `GET /api/public/v1/info` | Service name, version, schema version, the endpoint list, limits |
| `GET /api/public/v1/status` | `status` (`ok`, `degraded` or `down`), version, uptime |
| `GET /api/public/v1/stats?window=24h` | Users, connections, sign-ins, requests, errors and load for the window |
| `GET /api/public/v1/series?window=24h` | The same numbers over time, in fixed buckets |
| `GET /api/public/v1/errors?window=24h` | Error mix by class and sign-in failures by reason |
| `GET /api/public/v1/repo` | The project's GitHub stars, forks and open issues (the bridge fetches them and caches for an hour) |
| `GET /api/public/v1/openapi.json` | An OpenAPI description of this API |
| `GET /api/public/stats` | Legacy: `{ "users": n, "connections": n }` |

`window` is `1h` (5-minute buckets), `24h` (hourly buckets) or `7d` (6-hour buckets); the default is `24h`. Anything else returns `400`.

## Status
```
curl {{URL}}/api/public/v1/status
{"schemaVersion":1,"status":"ok","version":"2.0.0","uptimeSeconds":5400,"checkedAt":"2026-10-06T18:30:00.000Z"}
```
`ok` means working normally (or quiet). `degraded` means slower than usual or a few system faults. `down` means a major problem, such as the database failing or many requests faulting.

## Stats
```
curl "{{URL}}/api/public/v1/stats?window=24h"
```
| Field | Meaning |
| --- | --- |
| `service` | `version`, `uptimeSeconds`, `status` |
| `users` | `total` accounts, `active` (made a call in the window), `new` (joined in the window) |
| `connections.live` | AI-app connections that currently work |
| `auth` | `flowsStarted`, `flowsCompleted`, `flowsFailed`, `successRate` (completed ÷ started, or `null`), `failuresByReason` |
| `requests` | Tool calls: `count`, `errors`, `faults` (system problems, not caller mistakes), `successRate`, `latencyMs` (`p50`, `p95`, `p99`), `callsPerMinute`, `byTool` (calls per tool name from the public catalogue) |
| `errors` | `total` and `byClass` |
| `load` | `eventLoopLagP99Ms`, `dbPingMs`, `memoryMb`, `bridgesReporting` (`null` when no bridge reported recently) |

**Sign-in failure reasons** (a fixed list): `bad_credentials`, `rate_limited`, `denied`, `expired`, `unreachable`, `invalid_instance`, `too_many_attempts`, `other`.

**Error classes** (a fixed list): `invalid_input`, `insufficient_scope`, `read_only`, `policy_blocked`, `upstream_4xx`, `upstream_5xx`, `upstream_unreachable`, `rate_limited`, `unauthorized`, `internal`, `other`. Anything the service records outside these lists is counted as `other`, never shown as text.

## Series
Each bucket has `t` (start time), `requests`, `errors`, `faults`, `p95Ms`, `authCompleted`, `authFailed` and `newUsers`. Every bucket in the window is present, with zeros when nothing happened.

## Stability promise
Every response has `schemaVersion` (currently `1`). Within `/v1` we only **add** fields; we never rename, remove or change the meaning of one. A breaking change gets a new `schemaVersion` and a new path (`/v2`), and `/v1` keeps working for at least 90 days after `/v2` ships. TypeScript types are in the repository at `src/public-api/types.ts`; copy or import them.

## For integrators
The separate domain service and its operator dashboard read **this public API** for system-level numbers. Anything account-specific (one person's connections, their subdomain, billing) will come through a **separate, authenticated service-to-service API** that is not part of this repository and not public.

## Why we publish this
Being open about reliability helps you decide whether to trust the service, and helps us notice problems early. We publish only numbers that can't identify anyone; see [Privacy](/privacy).
