# ePaperclip security: what it runs as and what it can touch

This page is for a Proxmox administrator deciding whether to put ePaperclip on a host. Every statement comes from the project's own units, installer and security notes, named in the source line under each answer. Anything we could not verify is left out. For the full threat model and the list of audited findings, read `docs/SECURITY.md` in the ePaperclip repository.

## Is it installed as root?
The installer runs as root, once. The services it sets up do not.

- The console runs as the user `epaperclip`, the engine as `epaperclip-engine` and the agent resource broker as `epaperclip-broker`.
- Their systemd units set `NoNewPrivileges=yes`, `ProtectSystem=strict`, `ProtectHome=yes` and `PrivateTmp=yes`, restrict address families, and cap memory (512 MB for the console, 4 GB for the engine).
- The console's only capability is binding port 443 (`CAP_NET_BIND_SERVICE`). The engine's capability set is empty.

Source: `deploy/epaperclip.service`, `deploy/epaperclip-engine.service`, `deploy/epaperclip-broker.service`.

## What does run as root?
Three small helpers do the few jobs that need it:

1. the update helper, which runs an update or rollback an administrator asked for;
2. the container helper, which runs commands inside agent containers;
3. the publishing helper, which manages the publishing tunnel.

The container helper loads no application code, dependencies or configuration from writable service state, and the update path treats the console as hostile: a compromised console must not become root. Source: `deploy/epaperclip-exec.mjs` (header comment), `deploy/epaperclip-update.service`, `docs/SECURITY.md` ("Who is who").

## What can it do on Proxmox?
It signs people in with Proxmox's own login, including two-factor, and calls the Proxmox API as the signed-in person. A user can do in ePaperclip what Proxmox already lets them do and nothing more. A Proxmox administrator is root-equivalent on the host already. Source: `docs/ARCHITECTURE.md` (sign-in), `docs/SECURITY.md` ("Who is who").

## What does the installer change, and what does it never touch?
- It checks first, and changes nothing if something is missing: Proxmox VE 8 or newer, memory, disk, ports 443 and 3100, the Proxmox proxy and the node certificate.
- It brings its own pinned Node.js, checked against a pinned SHA-256, in `/opt/epaperclip/node`. Your system's Node.js is not used or changed.
- It installs the engine with `npm ci` from a lockfile that pins an exact version and checks every package's integrity hash, and it runs no package's install scripts.
- It builds the new version beside the old one, test-starts it on a spare local port, and only then swaps it in. If the new services are not healthy it puts the previous version back by itself.
- Proxmox's own interface on port 8006 is not touched.

Source: `docs/INSTALL.md` ("What the installer promises"), `deploy/epaperclip-cli.sh` (usage text).

## Where do agents run?
Never on the host. They run in unprivileged Proxmox containers, or on worker machines you enrol. The container provider refuses a privileged container, a host bind mount, a passed-through device or a raw `lxc.*` setting, at validation, probe and acquire, so agent code cannot reach host files or host credentials. Until a Proxmox administrator has set up agent containers, the engine refuses to run any agent. Source: `docs/PROXMOX-SANDBOX.md` ("Unprivileged containers", "No host mounts"), `README.md`.

## Are releases signed?
Yes. CI signs a small manifest (version, SHA-256, size, file name) with an Ed25519 key that only CI holds. The installer and the update helper verify it against a public key pinned in the repository; no signature, no install. The apt repository is signed with its own key: check that the fingerprint printed by `gpg --show-keys /usr/share/keyrings/epaperclip-archive-keyring.gpg` reads `2DC0 0D1A 1A87 1018 F797 E7CE F565 5E1B 9FA7 5813` before you trust it. Source: `docs/RELEASING.md`, `docs/INSTALL.md`.

## How do I remove it?
`epaperclip uninstall` stops and removes both services and everything under `/opt`, and keeps your data and settings (`/var/lib/epaperclip-engine`, `/var/lib/epaperclip`, `/etc/epaperclip`). `epaperclip uninstall --purge` removes those too. If you are unsure, try ePaperclip in a nested Proxmox VM first. Source: `docs/INSTALL.md` ("Uninstall").

## What we have not verified
We have not run the installer on every Proxmox configuration, and some of the engine's tests run against a fake Proxmox rather than a real host; the project's own notes say which. If you find a problem, report it privately through the repository's security reporting rather than in a public issue.
