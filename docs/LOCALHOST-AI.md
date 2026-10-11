# Localhost AI: design

Status: draft. Nothing here is built. This is a design for a self-hosted appliance that merges a Proxmox-class host with Paperclip as its control plane, so the machine is managed by agents instead of by a person clicking through an admin UI.

## One-line pitch

A box you own where Paperclip is not an app running on the OS but the layer that creates and manages the OS's resources: virtual machines, containers, storage, network, GPUs and secrets. A private cloud workspace you reach from a browser or from any MCP client through Papercliped.

## Principles

1. **Paperclip is the authority.** Identity, policy, budgets, approvals and the audit log stay in Paperclip. Nothing else decides who may do what.
2. **Agents propose, a broker executes.** No model ever holds host credentials. A small deterministic service performs a fixed allowlist of actions.
3. **Everything is a connector.** Model access, the host itself, and apps (GitHub, Slack) all use the same Application, Connection, Profile, Binding and Gateway model Paperclip already has.
4. **Secrets live in the Vault.** One server-wide place, with values never shown in the UI, logs or agent context.
5. **Local-first, cloud-optional.** The box works with no outside accounts. Hosted models and remote access are connectors you add.
6. **Recoverable.** A locked Vault, a dead model or a crashed Paperclip must never brick the machine.

## Architecture

```
          browser / phone / MCP client (via Papercliped)
                          |
                   Paperclip control plane
        companies, agents, tasks, budgets, approvals, audit
                          |
        +-----------------+------------------+
        |                 |                  |
     Vault          Connectors/Gateway   Sandbox provider
 (secrets, keys)   (apps, models, OS)      (Proxmox LXC/VM)
        |                 |                  |
        +--------- Host broker (allowlist, no LLM) ---------+
                          |
              Debian + Proxmox VE (KVM, LXC, ZFS, network, GPU)
```

Trust boundaries:

- Agent sessions run in sandboxes and are untrusted. They reach Paperclip only through its HTTP bridge and reach files only through workspace sync.
- Paperclip never talks to the hypervisor directly. It calls the host broker, and only the broker holds hypervisor credentials.
- The Vault root key is not stored in the Vault and not in Paperclip's database.

## 1. Vault

Reuses Paperclip's secrets system. The new pieces are the root key and the onboarding step.

What is reused:

- Secret metadata with values held by a provider (`server/src/secrets/`: local encrypted provider, provider registry, external stubs).
- Company-scoped secrets and per-user secrets with different ownership rules.
- Secret proposals: an agent proposes a change and an authorized reviewer accepts or rejects it.
- Runtime delivery of only the references an actor and run are authorized for, with redaction in logs and errors.
- Named provider vaults with routing metadata only.

What is new:

- **Root key.** A passphrase, and a TPM or hardware key where available, created at install and shown once. It unlocks the local encrypted provider. Per Paperclip's bootstrap rule, the secret that unlocks the vault cannot live in the vault.
- **Unlock at boot.** Modes: interactive on the console or over the LAN, TPM auto-unseal for unattended boxes (with a stated weaker threat model), or a recovery key.
- **Host-level secrets** (hypervisor API token, backup credentials, DNS or tunnel tokens) are held by the broker's own vault scope. Agents can request that one be rotated but can never read it.
- **Rotation** for host-level credentials, with the same kid-based approach the bridge already uses for sealing keys.

Open question: whether TPM auto-unseal is offered at v1 or only passphrase unlock.

### Who owns the tokens

The user owns every system-wide token. They are entered, rotated and revoked by the user in the Vault, never by an agent.

| Token | Set by | Delivered to |
| --- | --- | --- |
| Hypervisor API token | User (onboarding, rotated in Vault settings) | The host broker only |
| GitHub, hosted model API keys, other connector credentials | User, through the normal connection setup | The connection runtime, per grant, per run |
| Vault root key and recovery key | User, at install | Nobody; entered at unlock |

Rules:

- Agents can propose a change (a secret proposal or a connection request) and the user approves it. An agent can never set, read or widen a system-wide token.
- Paperclip runs the system, but it holds the hypervisor token only by reference. The Vault delivers the value to the broker process, not to Paperclip's application code or any session. A compromised Paperclip server can ask the broker for allowlisted actions; it cannot walk away with hypervisor access.
- Sessions never receive a system-wide token. Each run gets short-lived, run-bound credentials derived from what the actor is authorized for (Paperclip's runtime tokens already expire after an hour and are rejected once the heartbeat ends).
- Changing or revoking a token takes effect on the next call. Revoking the hypervisor token is the kill switch described in section 7.

## 2. Connectors

Everything an agent can touch is a connection in `/:company/apps`, governed by profiles, bindings, policies (`allow`, `block`, `require_approval`, `rate_limit`) and the call audit log. Tools are classed `read`, `write` or `destructive`.

Three families:

| Family | Examples | Notes |
| --- | --- | --- |
| Apps | GitHub, Slack, mail | Existing Paperclip connectors and the `connection_request` flow |
| Models | Local runtime, hosted provider API key, router | See section 4 |
| Host | The OS connector | New, always installed, see section 3 |

Agents discover and request connections with `connections_search` and `connection_request`. The user completes setup in a card in the task thread, and the agent never sees credentials.

## 3. The OS connector and host broker

The new core component. It is a first-party connection whose tools map onto host actions.

### Broker

- A small service on the host, written for auditability, with no model in it.
- Holds the hypervisor token, scoped to the least privilege that works.
- Accepts requests only from Paperclip, authenticated with a per-instance credential, and only for actions on its allowlist.
- Validates every argument against a schema and a per-action policy. Every call is written to an append-only log that Paperclip mirrors into its audit trail.
- Applies hard limits regardless of what Paperclip says: maximum guest count, maximum per-guest and total CPU, RAM, disk and GPU, a protected set of guests and datasets that agents can never delete, and no host shell.

### First-cut tool surface

| Tool | Risk | Default policy |
| --- | --- | --- |
| `host.status`, `guest.list`, `storage.list`, `net.list` | read | allow |
| `guest.create` (LXC or VM from an approved template) | write | require approval above budget |
| `guest.start`, `guest.stop`, `guest.snapshot`, `guest.clone` | write | allow within budget |
| `guest.resize` | write | require approval |
| `guest.destroy` | destructive | require approval always |
| `storage.create_volume`, `storage.attach` | write | require approval |
| `storage.destroy_volume` | destructive | require approval always |
| `net.expose_port` | write | require approval always |
| `gpu.assign` | write | require approval |
| `backup.run`, `backup.restore` | write / destructive | allow / require approval |

There is no raw command tool. Anything not in the table does not exist.

### Resource budgets

Paperclip already budgets spend. Extend budgets with resource dimensions (CPU, RAM, GPU hours, disk, bandwidth). Budgets are per agent and per company. The broker enforces the hard ceilings, and Paperclip enforces the soft ones and routes overages to approval.

### Declarative state

Agents should not run imperative scripts against the host. The broker stores desired state per guest (template, resources, mounts, ports). Agents edit the desired state and the broker reconciles. This gives diffs, review and rollback.

## 4. Models

Model access is a connection, not a settings page. Paperclip's AI connections already model providers, subscription or API key sign-in, personal or shared accounts, and per-agent access.

Three setups, all selected in the normal connection flow:

1. **Local.** A connection to a local runtime (Ollama or vLLM) on the box.
2. **Hosted.** A provider connection whose API key lives in the Vault.
3. **Hybrid.** An AI connection router over both. The routing policy prefers local and escalates to hosted on a hard task, low confidence or failure, with Paperclip budgets as the limiter.

Notes:

- Routers are experimental and off by default in Paperclip. The shipped policy plugin is round robin and quota based. Difficulty-based escalation needs a new policy plugin against the `ai.connections.route` contract. A router sees metadata and proposes a member. It never receives credentials.
- GPU scheduling is shared between serving the local model and guests that request GPUs. This needs an explicit policy and is an open problem.

### Local endpoints (verified against Paperclip's docs, 2026-10)

Paperclip already supports local and custom model endpoints as first-class connections. They are rows on **Connectors** tagged `model-provider`, with a URL, protocol and optional auth. The harness decides which protocols work:

| Harness | Custom or local route |
| --- | --- |
| OpenCode (legacy and new runner) | Chat Completions |
| Hermes local | Chat Completions |
| Codex (legacy and new runner) | Responses |
| Claude (legacy and new runner) | Messages |
| Gemini CLI, Grok | Native only |

For a local runtime such as Ollama or vLLM, the practical path is the OpenCode or Hermes harness with a Chat Completions connection. That is the only combination I would expect to work without extra translation, and it has not been run end to end by us.

Constraints that shape the design:

- **"Localhost" means the agent's execution environment.** Paperclip documents that a loopback URL refers to the sandbox the agent runs in. A model server on the host is therefore not reachable at `localhost` from a session guest. Options: a loopback forwarder inside each guest (preferred, since it keeps the URL a loopback and needs no TLS), or serve the model over HTTPS on the private bridge. Paperclip requires HTTPS for non-loopback URLs, and plain HTTP is allowed only for loopback.
- **The guest must not reach the broker or hypervisor network,** so the forwarder is the only extra route a guest gets, and it points at the model service only.
- **Saving a custom connection proves nothing.** Only fixed official provider endpoints get a key check. A custom endpoint is verified by the **Run test** action using the real harness in the real environment. Onboarding should run it.
- **No model catalog discovery for custom gateways.** Model IDs are entered by hand, so the local-runtime connector should supply them from the runtime's own model list.
- **Keys stay out of the guest.** For native OpenCode custom gateways the key lives in the runner process, and the harness only receives a session-scoped loopback capability limited to that model's endpoint, with redirects rejected. A keyless local runtime needs none of this, but a remote hosted fallback benefits from it directly.
- **Real-world signal.** The OpenCode adapter has retry logic for model listing against a shared Ollama daemon that is busy generating, so this setup is already exercised upstream. The same behavior means a single local model will queue concurrent sessions, which matters for the GPU scheduling question.

Still unverified: tool-calling quality of local models under these harnesses. This is a model-capability question, not something the code answers, and it decides whether local-only is usable for agent work or only for routing and drafting.

## 5. Workspace

A browser workspace served from the box, in the style of a hosted coding workspace.

- Each conversation is a Paperclip task with an agent.
- Each session runs in its own sandbox from the Proxmox sandbox provider (LXC by default, VM for riskier work). Sessions can be snapshotted, forked and paused, and survive closing the tab.
- A session receives only the secrets and connections its actor is authorized for.
- Papercliped is the remote door: an MCP client can create sessions, read status and approve cards on the same instance.

### Fast sessions

Paperclip creates sessions on demand, so lease time is a product requirement. Targets are to be measured, not assumed.

- **Template clones.** One template per harness (agent CLI and toolchain preinstalled), kept as a ZFS snapshot. A lease is a linked clone, which is cheap and fast for LXC.
- **Warm pool.** A small number of pre-started guests per template, sized by budget. Leases take one from the pool and the pool refills in the background.
- **Nothing secret in the image.** Templates contain no credentials. Run-bound credentials are injected at lease time and die with the lease.
- **Cheap teardown.** Releasing a lease destroys the clone. Snapshot first only when the user asked to keep the session.
- **Admission control.** The broker's hard ceilings bound how many guests can exist, so a runaway agent cannot exhaust the host by creating sessions.

Sandbox provider: Paperclip already defines a sandbox provider plugin shape (see the Kubernetes provider: lease lifecycle, pod exec, file sync, network policy, image allowlist, secret manager). A Proxmox provider implements the same contract: acquire a lease by cloning a template, run commands and sync files in, apply a network policy, release by destroying the guest. The provider talks to the broker, not to the hypervisor.

Runner fit: with the experimental runner, the server launches `paperclip-runnerd` inside the realized execution environment (the guest). Runnerd opens an **outbound** authenticated WebSocket (PRP v1) back to the server using a short-lived, one-use ticket bound to the company, agent, issue, run, session and turn. It never receives a broad Paperclip API credential, and the browser never connects to it. Runs recover across runner or network interruption without repeating effects. That means a guest needs only an outbound route to Paperclip, which matches the sandbox boundary below and keeps guests off the management network. The direct adapters remain the fallback while the runner is behind its flag.

Sandbox boundary: Paperclip's sandbox requirements treat the sandbox as untrusted and allow only two authorities across it: workspace file sync and the Paperclip HTTP bridge. The Proxmox provider must preserve that. Guests get no route to the broker or the hypervisor management network.

## 6. Onboarding

1. Create the admin account.
2. Create the Vault root key and unlock mode. Show the recovery key once.
3. Network: LAN address, optional private-network or tunnel connector for remote access.
4. Connect an AI account: local, hosted, or hybrid.
5. Add server-wide secrets (anything the admin wants available to approved agents).
6. Create the first company and the first infra agent, with a resource budget and the default approval policies above.
7. Optional: connect Papercliped so MCP clients can reach the instance.

## 7. Recovery and safety

- **Emergency console.** A plain local console and CLI that works with Paperclip, the model and the Vault all down. It can unlock the Vault, restart services, roll back to the last known good desired state, and disable the OS connector.
- **Kill switch.** One action revokes the broker credential Paperclip uses. Agents lose all host capability immediately; running guests keep running.
- **Snapshots before change.** Destructive and resize actions snapshot first by default.
- **Prompt injection.** Treat all content an agent reads as hostile. The defence is structural: approvals on destructive and exposing actions, schema validation in the broker, no raw shell, hard ceilings. Do not rely on the model to refuse.
- **Update safety.** Host updates are applied as an agent-proposed, human-approved task, with a snapshot and automatic rollback.

## 8. Reuse versus build

| Need | Reuse from Paperclip | Build |
| --- | --- | --- |
| Secrets storage and delivery | Secrets service, providers, proposals, redaction | Root key, unlock modes, host-level scope |
| Connections, policies, approvals, audit | Connections, gateway, profiles, `connection_request` | OS connector definition |
| Model accounts | AI connections, saved keys, personal and shared accounts | Local runtime connection, verification of the OpenAI-compatible path |
| Routing | AI connection routers (experimental) | Local-first escalation policy plugin |
| Sandboxes | Sandbox provider contract and SDK | Proxmox provider |
| Runner and workspace UI | Runner (experimental), web UI, plugin SDK | Session lifecycle on LXC, workspace polish |
| Budgets | Spend budgets | Resource dimensions |
| Remote access | Papercliped bridge | Host connector tools exposed there |
| Host control | None | **Host broker** |
| Install and recovery | None | Installer image, emergency console |

## 9. Phased plan

1. **Broker and OS connector, read-only.** Status, listing, and the audit pipeline. Prove the trust boundary.
2. **Proxmox sandbox provider.** Sessions in LXC on an existing Proxmox host. No new OS yet.
3. **Write actions with approvals and resource budgets.** Desired-state reconciliation, snapshots, kill switch.
4. **Models.** Local runtime connection, hosted connection, hybrid router policy.
5. **Vault root key and onboarding.**
6. **Installer image and emergency console.** Only after the earlier phases are used for real.

Phases 1 to 3 work on any existing Proxmox box, which allows testing the idea before committing to a distribution.

## 10. Open questions

- Runner maturity. Read from Paperclip's ADR and compatibility docs (2026-10): the runner (`@paperclipai/paperclip-runner`, adapter `paperclip_runner`) is **experimental and behind a default-off instance flag**, and the ADR status is "Proposed". Qualified providers are Codex, OpenCode, Claude Managed, AWS AgentCore and pinned ACPX profiles for Claude and Codex. It is a good architectural fit (see section 5) but not a stable base. v1 should support the direct adapters too, and treat the runner as an opt-in. I read the architecture documents and the package layout, not the Rust runner internals.
- TPM auto-unseal at v1 or later.
- Single node only for v1, or a plan for clustering.
- GPU sharing policy between the local model and guests.
- Licensing and branding of redistributing a Proxmox-based image, and whether an overlay installer on stock Proxmox avoids the problem.
- Whether this lives in this repository or in a new one. Papercliped is the remote-access bridge, and the broker and installer are a different product surface.
