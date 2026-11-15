# First sign-in to ePaperclip

**What you'll do:** open ePaperclip for the first time, sign in with your Proxmox account and finish the short setup.

## Before you start
- ePaperclip is installed and running ([install guide](/docs/install-epaperclip)). `epaperclip status` should say both services are running.
- You have a Proxmox account on this host, in any realm Proxmox itself offers (`pam`, `pve`, LDAP, and so on). ePaperclip has no password of its own and no cloud account.

## Steps
1. In a browser, open `https://<your-host>/` on port 443. The installer prints the address when it finishes. Your browser may warn about the certificate: ePaperclip uses the node's own Proxmox certificate.
2. Enter your Proxmox user name, password and **realm**, the same ones you use for Proxmox itself. If you use two-factor, it asks for the code as Proxmox does.
3. The first start sets up the engine's database (a few hundred migrations). The installer waits for it, but if you open the page very early it can take up to a few minutes to answer.
4. On a new device, a short setup asks for your name, the device's name, whether Pin starts as an **Assistant** or an **Agent**, an AI provider (you can choose **connect later**) and what Pin may look at.

## What you should see
The overview page for your host, with CPU, memory and disk, the machines running, and your machines in the sidebar.

![The ePaperclip overview page](screen:overview)

What each person can see and do is exactly what their Proxmox permissions allow; every action runs as that person.

## If it fails
- **The page doesn't load.** Run `epaperclip status` on the host. If a service is stopped, start it with `systemctl start epaperclip epaperclip-engine`, then read the log with `journalctl -u epaperclip -n 100`.
- **Sign-in is refused.** Use the same realm you use for Proxmox. ePaperclip asks Proxmox to check the password, so if Proxmox refuses it, so does ePaperclip.
- **More:** [Troubleshooting](/docs/troubleshooting).
