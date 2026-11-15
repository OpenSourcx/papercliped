# Update and roll back ePaperclip

**What you'll do:** install a newer release, and go back to the previous one if you need to.

## Before you start
- A root shell on the host, or a Proxmox administrator in the console.
- Releases are signed and checked before anything is installed, and an older release is refused. Updating never touches Proxmox's own interface on port 8006.

## Steps
1. If you installed with apt, update with your system:

   ```
   apt update && apt install --only-upgrade epaperclip
   ```

2. If you installed with npm or the release download, use ePaperclip's own command, which installs the newest signed release (on an apt host, apt owns updates):

   ```
   epaperclip update
   ```

3. In the console, open **Settings**, then **Updates** to check, schedule or install an update.
4. To go back, run `epaperclip rollback`, or choose **Go back to the previous version** in the console. It swaps the previous version back, including the engine's database copy taken before the upgrade. There is one step of history.

## What you should see
`epaperclip status` shows the new version and both services running. If the swapped-in services aren't healthy, the installer puts the previous version back by itself.

## If it fails
- **"already on <version>".** You are already up to date.
- **A host managed by apt refuses another installer.** Keep using apt, or remove the apt package first (your data is kept) before using npm or the release download.
- **More:** [Install ePaperclip](/docs/install-epaperclip).
