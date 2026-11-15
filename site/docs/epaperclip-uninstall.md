# Uninstall ePaperclip

**What you'll do:** remove ePaperclip from your Proxmox host, keeping or deleting its data.

## Before you start
- A root shell on the host.
- Proxmox itself is untouched either way.

## Steps
1. Remove the services and programs, and keep your data and settings:

   ```
   epaperclip uninstall
   ```

2. To remove the data and settings and the service users too:

   ```
   epaperclip uninstall --purge
   ```

3. If you installed with apt, `apt remove epaperclip` does the first and keeps your data as well.

## What you should see
Both services are gone and everything under `/opt/epaperclip` is removed. Without `--purge`, the installer says where your data stayed: `/var/lib/epaperclip-engine`, `/var/lib/epaperclip`, `/etc/epaperclip` and `/etc/default/epaperclip`. Installing again picks them up as they were.

## If it fails
- **You want to keep your data.** Don't use `--purge`, and copy those four locations off the host first.
- **More:** [ePaperclip security](/docs/epaperclip-security) and [Install ePaperclip](/docs/install-epaperclip).
