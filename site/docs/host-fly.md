# Host Paperclip on Fly.io

Fly.io runs the official Paperclip image on a small virtual machine in the region you pick, with a volume for its data and a free `https://` address. Everything happens from the `fly` command line.

**You'll end up with:** Paperclip at `https://<app>.fly.dev` (or your own domain), always on, connected to Papercliped.

**Time:** about 20 minutes. **Cost:** a `shared-cpu-1x` machine with 2 GB is about $11 a month, `shared-cpu-2x` with 4 GB about $22, plus the volume ($0.15 per GB a month). Fly has no free allowance for new accounts and needs a card. Check Fly's pricing page for current numbers.

## Before you start

Install `flyctl` (see Fly's install page; on macOS `brew install flyctl`, on Linux `curl -L https://fly.io/install.sh | sh`, on Windows `pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"`), then:

```
fly auth login
mkdir paperclip-fly && cd paperclip-fly
```

## 1. Create the app

```
fly launch --image ghcr.io/paperclipai/paperclip:latest --no-deploy
```

Pick an app name (this becomes `https://<app>.fly.dev`) and a region near you. Say **no** to any database Fly offers; Paperclip brings its own.

## 2. Create the volume

Use the same region you picked (for example `iad`, `lhr`, `fra`, `syd`):

```
fly volumes create paperclip_data --size 10 --region iad
```

## 3. Write `fly.toml`

Replace the file `fly launch` made with this, changing `app`, `primary_region` and the URL:

```
app = "your-app-name"
primary_region = "iad"

[build]
  image = "ghcr.io/paperclipai/paperclip:latest"

[env]
  PAPERCLIP_DEPLOYMENT_MODE = "authenticated"
  PAPERCLIP_DEPLOYMENT_EXPOSURE = "public"
  PAPERCLIP_PUBLIC_URL = "https://your-app-name.fly.dev"
  PORT = "3100"

[[mounts]]
  source = "paperclip_data"
  destination = "/paperclip"

[http_service]
  internal_port = 3100
  force_https = true
  auto_stop_machines = "off"
  auto_start_machines = true
  min_machines_running = 1

  [[http_service.checks]]
    method = "GET"
    path = "/api/health"
    interval = "30s"
    timeout = "5s"
    grace_period = "60s"

[[vm]]
  size = "shared-cpu-2x"
  memory = "4gb"
```

`auto_stop_machines = "off"` matters: a stopped machine stops your agents mid-task.

## 4. Add the secrets and deploy

```
fly secrets set BETTER_AUTH_SECRET=$(openssl rand -hex 32) PAPERCLIP_TOOL_ACTION_SIGNING_SECRET=$(openssl rand -hex 32)
fly deploy --ha=false
```

Add your agents' keys the same way if you use them: `fly secrets set ANTHROPIC_API_KEY=... OPENAI_API_KEY=...`.

`--ha=false` keeps it to **one machine**: a volume belongs to one machine, and two copies of Paperclip must never share data.

## 5. Create your account

```
fly ssh console
```

Inside the machine:

```
HOME=/paperclip gosu node npx --yes paperclipai auth bootstrap-ceo --data-dir /paperclip --base-url https://your-app-name.fly.dev
```

Open the invite link it prints, create your account and your first company. Optionally close public sign-ups afterwards: `fly secrets set PAPERCLIP_AUTH_DISABLE_SIGN_UP=true`.

To sign agents in with a subscription instead of keys, run `HOME=/paperclip gosu node claude` (or `codex`) in the same console. The login is saved on the volume.

## 6. Your own domain (optional)

```
fly certs add paperclip.yourdomain.com
```

Create the DNS records it prints, then change `PAPERCLIP_PUBLIC_URL` in `fly.toml` to the new address and `fly deploy` again.

## 7. Check and connect

```
curl https://your-app-name.fly.dev/api/health
```

You want `"status":"ok"`, `"deploymentExposure":"public"` and `"bootstrapStatus":"ready"`. Then [connect Papercliped](/docs/hosting#connect-papercliped) and send *"Catch me up on my Paperclip."*

## Updates and backups

- **Update:** `fly deploy` pulls the newest `latest` image. It restarts the machine, so runs in progress stop; update when agents are idle.
- **Backups:** Fly snapshots volumes daily (`fly volumes snapshots list`). Keep your own copy for anything important.

## Troubleshooting

- **Health check failing:** `fly logs`. Usually a missing secret or a public URL without `https://`.
- **"This hostname is not allowed":** `PAPERCLIP_PUBLIC_URL` doesn't match the address you opened.
- **Two machines running:** `fly scale count 1`. Never run more than one.
- More: [Troubleshooting](/docs/troubleshooting).
