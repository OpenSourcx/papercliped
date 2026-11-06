# Connect account claim issuer (disabled by default)

This bridge provides the EXISTING Papercliped account identity; Connect adds a profile in the same Supabase database.

The new `POST /api/manage/connect-claim` route is **disabled unless** the server has `CONNECT_CLAIM_SIGNING_KEY` (at least 32 bytes). Use a freshly generated signing key specifically for Connect; **never reuse** `BRIDGE_SECRET`, OAuth secrets, or Paperclip credentials.

The route also needs `CONNECT_SUPABASE_PUBLISHABLE_KEY` (the Paperclipped project's public key; without it the route stays 404). The caller sends `{username, secret, accessToken}`: the bridge asks Supabase Auth who the `accessToken` belongs to (confirmed email, not anonymous, not banned), so issuer and subject are never taken from the request. It then verifies the owner's existing username + secret key via the throttled `manageLogin` function, binds the identity to the account in `bridge.account_identities` (409 if the account or the identity is already bound to another), and returns a 60-second HMAC-SHA256 assertion with `iss=https://papercliped.co`, `aud=papercliped-connect`, canonical account `sub`, unique `jti`, and an SHA256 binding to the claimed OIDC issuer + subject. Connect must independently verify the authenticated OIDC principal, check exact binding and atomically consume the `jti` in `connect.account_assertion_replays`.

**Asymmetric signing (preferred).** With `CONNECT_CLAIM_ED25519_PRIVATE_KEY` set (Ed25519, PKCS#8 PEM, `\n` escapes allowed) the assertion is signed `EdDSA` with header `{alg:"EdDSA", typ:"PCD-ACCOUNT-ASSERTION", v:2, kid}` (`CONNECT_CLAIM_KEY_ID`, default `pcd-claim-1`); Connect verifies with the matching public JWK (`CLAIM_PUBLIC_JWKS`) and rotates keys by kid. If both keys are set the Ed25519 key is used. An invalid Ed25519 key stops startup. `CONNECT_CLAIM_SIGNING_KEY` (HS256, `v:1`) remains for one release and is then removed.

**Security boundaries:** This is **not** an OIDC provider, browser session, Connect entitlement, MCP grant, or Proxmox access. The issuer does not itself verify third-party OIDC identities. The bridge now verifies the Supabase session itself; Connect must still verify binding and consume the `jti`. Do not enable this route until a proper account-claiming UX, CSRF defenses, secret rotation and privacy handling are reviewed. No code is deployed from this branch.

This route does not modify stored accounts or grants. It never stores or returns the user's secret key. Existing plugin sign-in and MCP OAuth behavior are unchanged.

The bridge and Connect service must share the dedicated secret over their trusted server environments only. The client browser must never receive it.


## Central Auth decision (November 5, 2026)

The sole trusted login identity issuer is Supabase Auth in the **existing shared Paperclipped project**: `https://ixwbkbkdxvfmfyiyturx.supabase.co/auth/v1`. The subject is its verified `auth.users.id` UUID. Email OTP and passkeys authenticate to the *same Supabase identity*, which is mapped only after an explicit one-time claim to the existing `bridge.accounts.id`.

The bridge claim contract rejects arbitrary third-party issuers and non-UUID subjects. Note that `issuer` is the entire OIDC issuer URL, including `/auth/v1`. Central `auth.papercliped.co` is the proposed sign-in UI, not the JWT issuer. The current flag stays OFF; no hosted configuration has been changed.
