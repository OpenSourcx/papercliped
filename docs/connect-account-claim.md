# Connect account claim issuer (disabled by default)

This bridge provides the EXISTING Papercliped account identity; Connect adds a profile in the same Supabase database.

The new `POST /api/manage/connect-claim` route is **disabled unless** the server has `CONNECT_CLAIM_SIGNING_KEY` (at least 32 bytes). Use a freshly generated signing key specifically for Connect; **never reuse** `BRIDGE_SECRET`, OAuth secrets, or Paperclip credentials.

The route verifies the owner's existing username + secret key via the current throttled `manageLogin` function, then returns a 60-second HMAC-SHA256 assertion with `iss=https://papercliped.co`, `aud=papercliped-connect`, canonical account `sub`, unique `jti`, and an SHA256 binding to the claimed OIDC issuer + subject. Connect must independently verify the authenticated OIDC principal, check exact binding and atomically consume the `jti` in `connect.account_assertion_replays`.

**Security boundaries:** This is **not** an OIDC provider, browser session, Connect entitlement, MCP grant, or Proxmox access. The issuer does not itself verify third-party OIDC identities. Never accept the issuer/subject from an unverified browser session on the Connect side. Do not enable this route until a proper account-claiming UX, CSRF defenses, secret rotation and privacy handling are reviewed. No code is deployed from this branch.

This route does not modify stored accounts or grants. It never stores or returns the user's secret key. Existing plugin sign-in and MCP OAuth behavior are unchanged.

The bridge and Connect service must share the dedicated secret over their trusted server environments only. The client browser must never receive it.
