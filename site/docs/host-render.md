# Host Paperclip on Render

Render runs the official Paperclip image as a web service with a persistent disk and a free `https://` address.

**You'll end up with:** Paperclip at `https://<name>.onrender.com` (or your own domain), its data on a Render disk, connected to Papercliped.

**Time:** about 15 minutes. **Cost:** Paperclip needs at least 2 GB of memory, which is Render's **Standard** instance (about $25 a month), plus the disk ($0.25 per GB a month; 10 GB is plenty to start). Render's free instances **sleep and can't have a disk**, and the 512 MB Starter instance is too small, so neither works for Paperclip. Check Render's pricing page for current numbers.

## Before you start

- A Render account with a payment method.
- Two random secrets. Make each with `openssl rand -hex 32`, or have your password manager generate a 64-character password of letters and numbers.

## 1. Create the web service

1. **New → Web Service → Existing Image** (deploy an existing image from a registry).
2. Image URL: `ghcr.io/paperclipai/paperclip:latest`.
3. Pick a region near you and the **Standard** instance type (2 GB) or larger.

## 2. Add the settings

Under **Environment Variables**, add:

| Key | Value |
| --- | --- |
| `PAPERCLIP_DEPLOYMENT_MODE` | `authenticated` |
| `PAPERCLIP_DEPLOYMENT_EXPOSURE` | `public` |
| `PAPERCLIP_PUBLIC_URL` | `https://YOUR-SERVICE.onrender.com` (you'll see the exact name after creating it; update this then) |
| `BETTER_AUTH_SECRET` | your first secret |
| `PAPERCLIP_TOOL_ACTION_SIGNING_SECRET` | your second secret |
| `PORT` | `3100` |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | optional, for your agents |

## 3. Add the disk and health check

Under **Advanced**:

- **Add Disk:** mount path **`/paperclip`**, size 10 GB. This is where Paperclip keeps its database, secrets key, uploads, workspaces and agent logins.
- **Health Check Path:** `/api/health`.

Create the service. When it's live, check that `PAPERCLIP_PUBLIC_URL` matches the address Render shows at the top of the page exactly; if not, fix it (Render redeploys).

**Your own domain:** **Settings → Custom Domains → Add**, create the DNS record Render shows, and change `PAPERCLIP_PUBLIC_URL` to the new address.

**Optional managed database:** create a Render Postgres (a paid one; the free one is deleted after 30 days) and set `DATABASE_URL` to its **Internal** URL. Without it Paperclip uses its built-in Postgres on the disk.

## 4. Create your account

Open the service's **Shell** tab and run:

```
HOME=/paperclip gosu node npx --yes paperclipai auth bootstrap-ceo --data-dir /paperclip --base-url https://YOUR-SERVICE.onrender.com
```

Open the invite link it prints, create your account and your first company. Optionally, add `PAPERCLIP_AUTH_DISABLE_SIGN_UP=true` afterwards to close public sign-ups.

## 5. Sign in your agents

Add `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`, or sign in with a subscription from the Shell tab (`HOME=/paperclip gosu node claude`). The login is saved on the disk.

## 6. Check and connect

```
curl https://YOUR-SERVICE.onrender.com/api/health
```

You want `"status":"ok"`, `"deploymentExposure":"public"` and `"bootstrapStatus":"ready"`. Then [connect Papercliped](/docs/hosting#connect-papercliped) and send *"Catch me up on my Paperclip."*

## Updates and backups

- **Update:** **Manual Deploy → Deploy latest reference** pulls the newest `latest` image. A service with a disk can't do zero-downtime deploys: the old instance stops first, so runs in progress end. Update when agents are idle.
- **Backups:** Render takes daily snapshots of disks; you can restore them from the disk's settings. Keep your own copy too for anything important.

## Troubleshooting

- **Deploy fails:** read the logs. Usually a missing `BETTER_AUTH_SECRET`, or a public URL without `https://`.
- **"This hostname is not allowed":** `PAPERCLIP_PUBLIC_URL` doesn't match the address you're opening.
- **Data gone after a deploy:** the disk isn't mounted at exactly `/paperclip`.
- More: [Troubleshooting](/docs/troubleshooting).
