# Install ePaperclip

ePaperclip runs on your Proxmox host. You install it once, then open its console in a browser and sign in with your Proxmox account. Every action runs as the person who is signed in, so Proxmox's own permissions still decide what they can do.

## What you need
- **Proxmox VE 8 or newer** and root access. The web shell works: in Proxmox choose your node, then **Shell**.
- **Memory:** 4 GB or more recommended. The installer refuses hosts with less than 2 GB. Idle, ePaperclip uses about 1 GB.
- **Disk:** about 3 GB free where `/opt` and `/var/lib` live.
- **Internet** during the install (to nodejs.org and the npm registry, plus your chosen package source).

Try it on a test node first if you can. ePaperclip 1.0 is new, and the installer never reimages or repartitions anything, but a host you can recover is a good place to start.

## Install

Pick one. They all run the same installer and give the same result.

### With apt (recommended)
Add ePaperclip's signed package repository once, then install:

```
curl -fsSL https://apt.papercliped.co/epaperclip-archive-keyring.gpg \
  -o /usr/share/keyrings/epaperclip-archive-keyring.gpg
gpg --show-keys /usr/share/keyrings/epaperclip-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/epaperclip-archive-keyring.gpg] https://apt.papercliped.co stable main" \
  > /etc/apt/sources.list.d/epaperclip.list
apt update
apt install epaperclip
```

The second command prints the key's fingerprint. It must be `2DC0 0D1A 1A87 1018 F797  E7CE F565 5E1B 9FA7 5813` (ePaperclip Releases). If it isn't, stop and don't continue.

Updates then arrive with the rest of your system: `apt update && apt upgrade`.

### With npm
If the host has Node.js 18 or newer:

```
npx epaperclip install
```

Or install it globally with `npm install -g epaperclip`, then run `epaperclip install`. The host's Node.js only starts the installer; ePaperclip's services run on their own pinned Node.js. To upgrade later: `npx epaperclip@latest install`.

### With one command
```
curl -fsSL https://github.com/OpenSourcx/papercliped-engine/releases/latest/download/get.sh | bash
```
This downloads the latest release, checks its signature and checksum, and only then unpacks it and runs the installer.

## Check that it worked
```
epaperclip status
```
It shows the version, how it was installed and whether its services are running. Then open `https://<your-host>/` in a browser (use the host's address or name, port 443) and sign in with your Proxmox account.

## What to do next
1. Sign in with a Proxmox account that has the permissions you want to use.
2. Create your organization, then add your first agent and connect a model to it.
3. To give an AI app (Claude, ChatGPT, Codex) access to your Paperclip, see [Connect Claude](/docs/claude).
4. To add more computing power, add a [worker machine](#add-a-worker-machine).

## Add a worker machine
A worker adds compute on another machine. It connects out to your ePaperclip host, opens no port and holds no Proxmox credentials. On a Linux machine with Node.js 22 or newer:

```
npm install -g epaperclip
sudo epaperclip --worker
```

Then in the ePaperclip console choose **Workers**, then **Add worker**, and copy the pairing code. On the worker:

```
sudo epaperclip --worker connect <code>
```

`epaperclip --worker --check` tells you whether the machine is ready without changing anything. The worker installer is signed and the command refuses to install anything whose signature doesn't verify.

## Update, roll back, uninstall
| Task | Command |
| --- | --- |
| See version and state | `epaperclip status` |
| Update | `apt update && apt upgrade` (apt installs), or `epaperclip update` |
| Go back to the previous version | `epaperclip rollback` |
| Remove it | `epaperclip uninstall` (your data is kept unless you ask otherwise) |
| Restart services | `epaperclip device restart` |
| Read logs | `epaperclip device logs engine --lines 200` |

Don't mix install methods carelessly: apt, npm and the one-command download put the same files in the same places, but only one of them should keep the host up to date. The installer records which one installed last and refuses to install over an apt-managed host with npm or the download, telling you how to switch on purpose.

## If something goes wrong
- **"Not enough memory":** the host has less than 2 GB. Give it more, or use a bigger machine.
- **The installer can't download something:** check that the host can reach nodejs.org and registry.npmjs.org.
- **The page doesn't open:** run `epaperclip status`. If a service isn't running, `epaperclip device logs console --lines 200` and `epaperclip device logs engine --lines 200` say why.
- **Sign-in fails:** use a real Proxmox account (for example `root@pam`) with the permissions you expect.

Still stuck? See [Troubleshooting](/docs/troubleshooting), or write to support@papercliped.co. Never include passwords, tokens or secret keys.
