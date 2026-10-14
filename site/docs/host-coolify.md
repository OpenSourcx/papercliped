# Host Paperclip with Coolify

Coolify is a free, open-source control panel you install on your own server. It gives you a Railway-style dashboard (deploys, domains, certificates, logs, a terminal) on a VPS you pay for directly.

**You'll end up with:** Coolify on your server, running Paperclip at `https://paperclip.yourdomain.com`, connected to Papercliped.

**Time:** about 30 minutes. **Cost:** your server. Coolify itself needs about 2 GB of memory, Paperclip another 2–4 GB, so pick an **8 GB** server (for example Hetzner's 8 GB plans). Self-hosted Coolify is free; Coolify Cloud (they run the panel, you bring the server) is about $5 a month.

## 1. Get a server and install Coolify

1. Rent an Ubuntu 24.04 server with 8 GB of memory (see the provider table in [VPS with Docker](/docs/host-vps#1-rent-the-server)).
2. Connect with `ssh root@YOUR_IP` and run Coolify's installer:
   ```
   curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
   ```
3. Open `http://YOUR_IP:8000` and create your Coolify admin account straight away (the first person to open it becomes the admin).

## 2. Point your domain at it

At your DNS provider, add an **A record**: `paperclip` → your server's IP (on Cloudflare: **DNS only**, grey cloud).

## 3. Create Paperclip

1. In Coolify: **Projects → your project → New Resource → Docker Image**.
2. Image: `ghcr.io/paperclipai/paperclip:latest`.
3. **Ports Exposes:** `3100`.
4. **Domains:** `https://paperclip.yourdomain.com`. Coolify gets the certificate for you.

## 4. Add storage, health check and settings

- **Persistent Storage → Add → Volume:** destination path **`/paperclip`**.
- **Health check:** path `/api/health`, port `3100`.
- **Environment Variables:** add

```
PAPERCLIP_DEPLOYMENT_MODE=authenticated
PAPERCLIP_DEPLOYMENT_EXPOSURE=public
PAPERCLIP_PUBLIC_URL=https://paperclip.yourdomain.com
BETTER_AUTH_SECRET=YOUR-FIRST-SECRET
PAPERCLIP_TOOL_ACTION_SIGNING_SECRET=YOUR-SECOND-SECRET
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

Make each secret with `openssl rand -hex 32` (run it on the server). Then **Deploy**.

Prefer Docker Compose? Choose **Docker Compose** as the resource type and paste the Paperclip service from the [VPS guide](/docs/host-vps#5-create-the-docker-compose-file) **without** the `caddy` service: Coolify's own proxy takes Caddy's place.

## 5. Create your account

Open the resource's **Terminal** tab and run:

```
HOME=/paperclip gosu node npx --yes paperclipai auth bootstrap-ceo --data-dir /paperclip --base-url https://paperclip.yourdomain.com
```

Open the invite link, create your account and your first company. Optionally add `PAPERCLIP_AUTH_DISABLE_SIGN_UP=true` and redeploy to close public sign-ups. To sign agents in with a subscription, run `HOME=/paperclip gosu node claude` in the same terminal.

## 6. Check and connect

```
curl https://paperclip.yourdomain.com/api/health
```

You want `"status":"ok"`, `"deploymentExposure":"public"` and `"bootstrapStatus":"ready"`. Then [connect Papercliped](/docs/hosting#connect-papercliped) and send *"Catch me up on my Paperclip."*

## Updates and backups

- **Update:** **Redeploy** pulls the newest image (restarts Paperclip, so do it when agents are idle).
- **Backups:** Coolify can back up its own databases to S3-compatible storage; for Paperclip's volume, use your provider's server snapshots or the `tar` backup from the [VPS guide](/docs/host-vps#backups).
- Keep Coolify itself updated from its settings page.

## Troubleshooting

- **No certificate:** the A record isn't pointing at the server yet, or Cloudflare's proxy is on.
- **"This hostname is not allowed":** `PAPERCLIP_PUBLIC_URL` doesn't match the domain.
- **Data reset after redeploy:** the volume isn't mounted at exactly `/paperclip`.
- More: [Troubleshooting](/docs/troubleshooting).
