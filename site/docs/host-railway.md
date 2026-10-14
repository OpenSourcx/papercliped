# Host Paperclip on Railway

Railway runs the official Paperclip image for you: no server to look after, a free `https://` address, and a dashboard for everything. The fewest steps of any always-on option.

**You'll end up with:** Paperclip at `https://<name>.up.railway.app` (or your own domain), its data on a Railway volume, connected to Papercliped.

**Time:** about 15 minutes. **Cost:** Railway bills by usage. Paperclip with 1–2 GB of memory, always on, is roughly **$10–25 a month** on the Hobby plan ($5 a month including $5 of usage). Railway's free plan is too small for Paperclip (0.5 GB of memory). Check Railway's pricing page for current numbers.

## Before you start

- A Railway account on the **Hobby** plan (or the trial, to try it).
- Two random secrets. Make each with `openssl rand -hex 32`, or have your password manager generate a 64-character password of letters and numbers.

> **About community templates:** Railway's template gallery has community-made Paperclip templates. They're not made by Paperclip or by us. They can be quicker, but check that they set `PAPERCLIP_DEPLOYMENT_EXPOSURE=public` and attach a volume at `/paperclip`. The steps below use the official image directly, so you know exactly what's running.

## 1. Create the service

1. In Railway, **New Project → Docker Image** (or **Deploy a Docker Image**).
2. Image: `ghcr.io/paperclipai/paperclip:latest`. Railway creates the service and starts a first deploy; it's fine if that one doesn't work yet.

## 2. Add the volume

Right-click the service (or use the command palette) → **Attach Volume**. Mount path: **`/paperclip`**. This is where Paperclip keeps its database, secrets key, uploads, workspaces and agent logins. Without it, everything is lost on each deploy.

## 3. Get your address

Service → **Settings → Networking → Generate Domain**. If Railway asks for the port, enter **3100**. Note the address, like `https://paperclip-production-1234.up.railway.app`.

Want your own domain? Use **Custom Domain** instead, add the CNAME record Railway shows at your DNS provider, and use that address below.

## 4. Add the settings

Service → **Variables → Raw Editor**, paste and fill in:

```
PAPERCLIP_DEPLOYMENT_MODE=authenticated
PAPERCLIP_DEPLOYMENT_EXPOSURE=public
PAPERCLIP_PUBLIC_URL=https://YOUR-ADDRESS
BETTER_AUTH_SECRET=YOUR-FIRST-SECRET
PAPERCLIP_TOOL_ACTION_SIGNING_SECRET=YOUR-SECOND-SECRET
PORT=3100
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

`PAPERCLIP_PUBLIC_URL` must be exactly your address from step 3, with `https://` and no slash at the end. Leave the API keys empty if you'll sign agents in with a subscription (step 7).

**Optional managed database:** add a Postgres from **New → Database → PostgreSQL** and set `DATABASE_URL=${{Postgres.DATABASE_URL}}`. Without it Paperclip uses its built-in Postgres on the volume, which is cheaper and fine for most people.

## 5. Health check and memory

- Service → **Settings → Deploy → Healthcheck Path:** `/api/health`.
- Keep **serverless / app sleeping off**. A sleeping Paperclip stops your agents.
- Watch memory in the **Metrics** tab for the first days; you pay per GB used.

Deploy (Railway usually redeploys after variable changes; otherwise press **Deploy**).

## 6. Create your account

Install the Railway CLI (`npm i -g @railway/cli`), then in a terminal:

```
railway login
railway link
railway ssh
```

Pick your project and service when asked. Inside the container:

```
HOME=/paperclip gosu node npx --yes paperclipai auth bootstrap-ceo --data-dir /paperclip --base-url https://YOUR-ADDRESS
```

Open the invite link it prints, create your account and your first company. Then, optionally, add `PAPERCLIP_AUTH_DISABLE_SIGN_UP=true` to the variables to close public sign-ups.

## 7. Sign in your agents

Put `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` in the variables, or sign in with a subscription from `railway ssh`:

```
HOME=/paperclip gosu node claude
```

The login is saved on the volume.

## 8. Check and connect

```
curl https://YOUR-ADDRESS/api/health
```

You want `"status":"ok"`, `"deploymentExposure":"public"` and `"bootstrapStatus":"ready"`. Then [connect Papercliped](/docs/hosting#connect-papercliped) and send *"Catch me up on my Paperclip."*

## Updates and backups

- **Update:** service → **Deployments → Redeploy** pulls the latest `latest` image. A service with a volume has a short downtime on each deploy, and runs in progress stop, so do it when agents are idle.
- **Backups:** Railway volumes have backups in the volume's settings; turn on scheduled backups. If you use Railway Postgres, it has its own backups.

## Troubleshooting

- **Deploy fails its health check:** look at the deploy logs. Usually a missing `BETTER_AUTH_SECRET`, or `PAPERCLIP_PUBLIC_URL` not starting with `https://`.
- **"This hostname is not allowed":** `PAPERCLIP_PUBLIC_URL` doesn't match the address you opened, or exposure isn't `public`.
- **Everything reset after a deploy:** the volume isn't mounted at exactly `/paperclip`.
- **Agents are killed or slow:** give the service more memory (2–4 GB).
- More: [Troubleshooting](/docs/troubleshooting).
