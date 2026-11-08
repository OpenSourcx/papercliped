# Papercliped V2: “The power of the Pin”

Status: **design and product experience contract**, updated 2026-11-08. This describes the intended complete customer experience. It is authoritative for site composition, storytelling, route organization and product-language decisions, **not** evidence that every integration is live. Refer to component READMEs and accepted production verification for actual release status.

## Brand thesis

**Master headline:** The power of the Pin.

**Master promise:** Use your homelab to the fullest.

**Primary CTA:** Use ePaperclip. Clicking it must lead to a real product/installation path, never an invented download or account sign-in.

**Personality:** Calm, capable, endearing. Pin may be expressive, responsive and playful in contextual moments; the user's machine, data, safety and actionable navigation must always take visual priority.

**One-liner:** ePaperclip is the Proxmox-native home for your homelab, with Pin as your system companion, Papercliped as your AI connection layer, and Connect as the future managed way back to your own machine.

**Who it serves:** homelab owners, makers, students and dev teams running Proxmox who want more than isolated VM panels. Do not imply use on unsupported hosts.

## Brand examples we studied

- Linear: clear category positioning, restrained premium design, product UI demonstrating the value, one decisive CTA. https://linear.app/
- Raycast: personality and functional UX combined, extensions shown as practical value, tactile interaction. https://www.raycast.com/
- Our choice: familiar desktop UI visual grammar and a deliberately human Pin moment, not copied brand assets or design.

## Family structure and product rights

| Product | Role | Customer value | Implementation authority |
| --- | --- | --- | --- |
| ePaperclip | Flagship local software | Own and operate your Proxmox machine and AI workforce | OpenSourcx/papercliped-engine |
| Pin | Personal assistant/agent | Understand, plan, assist and execute within permissions | papercliped-engine / docs/PIN.md |
| Papercliped MCP | Open-source bridge/plugin | Bring Claude, ChatGPT, Codex and other clients to Paperclip | OpenSourcx/papercliped |
| Papercliped Connect | Hosted companion SaaS | Central account, registered devices, managed tunnel, billing | OpenSourcx/papercliped-connect |
| PinOS | Future complete distribution | System-level embodiment of the same platform | Future, not the current Proxmox-hosted release |

Do not confuse upstream Paperclip AI with our independent Papercliped project, or describe Connect as a remote administrator.

## Homepage IA (V2)

1. Minimal header: official Papercliped wordmark, Product menu (Overview, ePaperclip, Pin, Papercliped MCP, Connect), Docs, Resources, Community; one primary CTA: Use ePaperclip.
2. Hero: “The power of the Pin.” / “Use your homelab to the fullest.” 1–2 supporting sentences, primary ePaperclip CTA and secondary Meet Pin. Release availability is disclosed in quiet supporting copy, not conflated with primary value.
3. PinStage: official Pin orb and a stylized host panel, three example conversations: My homelab, Make a plan, Stay in control. Assistant/Agent mode toggle, click orb to move forward. Motion reflects reduced-motion preference. Sample data label and no background/API calls.
4. Product family: four equal but differentiated cards. ePaperclip is #01. Every card has a real dedicated route.
5. System/host overview: machines, storage, companies, access. Use conceptual interface when actual runtime screenshots are not yet verified; label it as such.
6. Onboarding path: Bring Proxmox, make it your own, give Pin a purpose.
7. Closing CTA: Use ePaperclip. Secondary Connect an AI app.

## Product routes

- \`/epaperclip\`: what it is, host vs agent planes, why owner control matters, release-candidate install docs. Never point to a stable release until it exists. Full technical source: https://github.com/OpenSourcx/papercliped-engine/blob/main/docs/USER-GUIDE.md
- \`/pin\`: the companion modes and permission model, animated/interactive conceptual demo, explanation of current and future runtime.
- \`/papercliped\`: available hosted/self-hosted MCP and the control room, familiar tools, read-only/full-control and tool/agent session policy. Main CTA goes to current \`/docs/getting-started\`.
- \`/connect\`: the managed reachability value proposition and future sign-in/pairing journey. Describe clearly that Connect does not collect Proxmox admin credentials and does not bypass local permissions.
- Preserve docs host routing, existing legal, security, brand and community pages, prompt gallery and status.

## Complete V2 sign-in and device journey: target UX contract

The marketing site is **not** the identity provider and does not itself implement these flows. Backends must implement the following with reviewed cross-repo contracts:

1. Visitor chooses “Sign in with Papercliped” or “Connect a device”. The approved Auth host handles verified session, OIDC/PKCE and account recovery; only enable public buttons when tested and reachable.
2. Canonical \`bridge.accounts.id\` remains the single account across Papercliped MCP, Auth, Connect and hosted Console. Never auto-merge by email. Never use legacy MCP secret or plugin token as unrestricted browser credential.
3. Sign-in succeeds into the account hub with sessions, connected apps, devices, security and subscription view. Each action respects the authenticated session and reauthentication gates.
4. To associate a Proxmox device, create a short-lived public-key pairing challenge. Require both account owner confirmation and an approved local Proxmox admin.
5. Local ePaperclip identity is independent; a hosted identity can associate/federate only through explicit local policy. No implicit root or elevated role.
6. Connect entitles a stable device hostname and cloudflared tunnel. Tunnel routes to the customer's device; Connect must not become the proxy/data plane or store customer model keys, VM data, Pin memory or host admin tokens.
7. Revoke/rename/rotate/suspend must update device state promptly. A dropped connection cannot make the local host unavailable; Proxmox port 8006 remains the emergency recovery route.
8. Legal, billing, trial, support and account deletion must be safe and implemented before commercial release.

Canonical evidence:
- https://github.com/OpenSourcx/papercliped-connect/blob/main/docs/IDENTITY.md
- https://github.com/OpenSourcx/papercliped-connect/pull/27 (merged OIDC)
- https://github.com/OpenSourcx/papercliped-connect/pull/34 (merged handoff, not deployed by PR)
- https://github.com/OpenSourcx/papercliped/pull/47 (merged handoff, not enabled by PR)
- https://github.com/OpenSourcx/papercliped-engine/pull/16 (open proposal, still requires implementation/review)

## Pin behavior

- Pin is NOT a second Paperclip company CEO.
- Assistant: explains state, monitors, proposes, and asks for approval for meaningful changes.
- Agent: can follow explicitly scoped policies, budgets, approved capabilities and routines. Must not imply global unlimited shell/root privileges.
- Language -> plan -> deterministic brokered action, never arbitrary uncontrolled hypervisor execution.
- User-facing playful patterns: orb react/tilt, focus hints, concise help, contextual next action, optional motion, low interference with tasks.
- Demo states must be marked sample; no fictional uptime/metrics/revenue as if real.
- Desired later live interaction: validated read-only metrics, approvals, host and agent status, secure typed workflow, real audit feed, cancel/revoke and error states.

## Visual grammar

- Reuse the existing Papercliped site theme tokens, self-hosted fonts, CSP, branded mascot and official Pin orb from \`papercliped-engine/brand/pin-orb.svg\`.
- Spacious editorial headline, tightly edited product copy, quiet card grids, contrast-safe accent use, generous mobile layout.
- Responsive from 375px to desktop. One \`h1\` per route. Keyboard-accessible tabs and toggles, visible focus rings, labels, informative links.
- Honor \`prefers-reduced-motion\` and theme variations. All interactions must be real UI state changes, no inert decorative CTAs.
- Respect the site's no third-party requests, no tracking, and strict CSP.

## Engineering source-of-truth and release quality

The site is a *visual target* for agents implementing the platform and marketing frontend. If marketing describes a future workflow, use this document as product intent and GitHub APIs/backend contracts as the technical source.

Definition of done:
- Route exists, readable and linked from site navigation.
- CTA resolves to a real destination, with release state accurately disclosed.
- Accessible and responsive screenshots reviewed.
- Unit, contrast, TypeScript build and Chromium route checks green.
- Internal Docs/MCP connector flows still operate.
- No secrets, third-party client requests, or fake live metrics.
- No production auth/billing flag changed just for a marketing launch.
- Prod deployment and cache verification distinct from PR merge; verify \`papercliped.co\` serves the new hero before saying “live.”

## Phase progression

**V2 website:** can ship when code and visual QA pass, independently of the full Pin runtime.

**V2 product functionality:** the initial safe public experience requires real-host ePaperclip testing, versioned identity and local authorizations, Pin model runtime and organization data wiring, managed Connect tunnel proof, billing tests and security review. Keep those as engineering gates; do not erase them merely to match page copy.
