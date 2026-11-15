# Manage machines in ePaperclip

**What you'll do:** find a virtual machine or container, start or stop it, open its console and change its settings.

## Before you start
- You are signed in ([first sign-in](/docs/epaperclip-first-sign-in)).
- Proxmox decides who may do what. If an action is refused, the page says your Proxmox account doesn't have permission, and the fix is a Proxmox permission, not an ePaperclip setting.

## Steps
1. In the sidebar, under **Machines**, choose a machine, or choose **Machines** for the full list.
2. On the machine's page, use **Start** or **Shut down** in the header. **Power options** has pause, hibernate, resume, reset and timeouts.
3. Choose **Console** for the built-in screen or serial terminal. A terminal's corner button opens it in a window of its own.
4. Open **Hardware** to change processor and memory, disks, network devices and, for a container, DNS and features. Changes that need a restart show as pending changes until you apply them.
5. **Overview** has the hostname, addresses and editable notes and tags. **Permissions** shows who may use this machine.

## What you should see
The machines list, with status, CPU and memory for each machine.

![The ePaperclip machines page](screen:machines)

## If it fails
- **"Your Proxmox account doesn't have permission".** Ask a Proxmox administrator for the permission on that machine (`/vms/<id>`).
- **Addresses are empty.** A VM shows them only while it is running with the QEMU guest agent; a stopped machine has none to show.
- **More:** the ePaperclip repository's `docs/MACHINE.md` lists every control on the machine page.
