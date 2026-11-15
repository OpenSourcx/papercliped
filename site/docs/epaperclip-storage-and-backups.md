# Storage and backups in ePaperclip

**What you'll do:** look at storage and disks, create a backup job, and restore or prune backups.

## Before you start
- You are signed in with a Proxmox account that may use storage and backups. As everywhere, Proxmox decides permissions.
- A storage that can hold backups exists on the host.

## Steps
1. In the sidebar, under **Host**, choose **Storage** to see each storage and its usage, or **Disks** for the physical disks.
2. Choose **Backups**. A backup job has a schedule (the next five runs are shown as you type), a storage, the machines it covers, a mode and a compression setting. Exactly one way of choosing machines applies: every machine, chosen machines or a pool.
3. **Not covered** lists machines that no job includes, with a shortcut to create a job for them.
4. To restore, open a backup on its storage and choose **Restore**: as a new machine (its own number or the next free one) or over the original (the machine must be stopped, and you type its number).
5. To free space, choose **Prune**, pick a retention and use **Preview**: it shows what would be kept, protected or removed. Removing asks you to type the storage name.

## What you should see
The backups page, with the jobs and the machines they cover.

![The ePaperclip backups page](screen:backups)

## If it fails
- **A stale edit is refused.** Proxmox rejects an edit made on an out-of-date copy. Reload the page and edit again.
- **Deleting needs you to type a name.** That is deliberate, for jobs, backups and prune.
- **Taking a single file out of a Proxmox Backup Server snapshot isn't supported yet.** The page says so; restore as a new machine, or use Proxmox Backup Server's own tools.
- **More:** the repository's `docs/BACKUP.md` and `docs/DISKS.md`.
