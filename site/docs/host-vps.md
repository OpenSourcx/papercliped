# Host Paperclip on a VPS with Docker

A small rented server running the official Paperclip image, with Caddy in front for the `https://` certificate. This is the best value for a Paperclip that's on all the time, and every step is copy and paste.

**You'll end up with:** Paperclip at `https://paperclip.yourdomain.com`, restarting by itself, with its data on the server's disk, connected to Papercliped.

**Time:** about 30 minutes. **Cost:** the server (about €5–12 a month) and a domain.

## Before you start

- **A domain** you can add DNS records to (any registrar works). You'll use a subdomain like `paperclip.yourdomain.com`.
- **An SSH key.** On macOS, Linux and Windows 10+, run `ssh-keygen` in a terminal and press Enter at each question if you don't have one.

## 1. Rent the server

Pick **Ubuntu 24.04**, at least **2 GB of memory (4 GB recommended)**, and add your SSH key when asked.

| Provider | A plan that fits (Oct 2026, approx.) | Notes |
| --- | --- | --- |
| Hetzner | CX23 (2 vCPU, 4 GB), about €5.50 | Best value; EU and US locations |
| DigitalOcean | Basic Droplet 2 GB, about $12 | Choose a *Droplet*, not App Platform |
| Linode (Akamai) | Shared 2 GB, about $12 | |
| Oracle Cloud Always Free | Ampere A1, $0 | Free but fiddly: see [Oracle notes](#oracle-cloud-free-tier) |

Note the server's **public IPv4 address**.

## 2. Point your domain at it

At your DNS provider, add an **A record**: name `paperclip`, value the server's IP. (If your DNS is on Cloudflare, set it to **DNS only**, the grey cloud, so Caddy can get its certificate.) It usually works within a few minutes.

## 3. Install Docker and open the firewall

Connect to the server (`ssh root@YOUR_IP`), then:

```
curl -fsSL https://get.docker.com | sh
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp
ufw --force enable
```

## 4. Create the settings

Replace `paperclip.yourdomain.com` with your address:

```
mkdir -p ~/paperclip && cd ~/paperclip
cat > .env <<EOF
DOMAIN=paperclip.yourdomain.com
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
PAPERCLIP_TOOL_ACTION_SIGNING_SECRET=$(openssl rand -hex 32)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
EOF
chmod 600 .env
```

Leave the two API keys empty if you'll sign your agents in with a subscription instead (step 8).

## 5. Create the Docker Compose file

```
cat > docker-compose.yml <<'EOF'
services:
  paperclip:
    image: ghcr.io/paperclipai/paperclip:latest
    container_name: paperclip
    restart: unless-stopped
    pids_limit: 2048
    environment:
      PAPERCLIP_DEPLOYMENT_MODE: authenticated
      PAPERCLIP_DEPLOYMENT_EXPOSURE: public
      PAPERCLIP_PUBLIC_URL: https://${DOMAIN}
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET}
      PAPERCLIP_TOOL_ACTION_SIGNING_SECRET: ${PAPERCLIP_TOOL_ACTION_SIGNING_SECRET}
      TRUST_PROXY: uniquelocal
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
    volumes:
      - paperclip-data:/paperclip
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443", "443:443/udp"]
    environment:
      DOMAIN: ${DOMAIN}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on: [paperclip]
volumes:
  paperclip-data:
  caddy-data:
  caddy-config:
EOF
```

What this does: runs the official image (no building), keeps everything Paperclip stores in the `paperclip-data` volume, and only Caddy is reachable from the internet. Paperclip uses its built-in Postgres on that volume.

## 6. Create the Caddy file

```
cat > Caddyfile <<'EOF'
{$DOMAIN} {
    reverse_proxy paperclip:3100
}
EOF
```

Caddy gets and renews the certificate by itself and passes Paperclip's live updates (WebSockets) through.

## 7. Start it and create your account

```
docker compose up -d
docker compose logs -f paperclip
```

Wait until the log says the server is listening (press Ctrl+C to stop watching; Paperclip keeps running). Then create the one-time invite for your admin account:

```
docker compose exec -u node paperclip npx --yes paperclipai auth bootstrap-ceo --data-dir /paperclip --base-url https://paperclip.yourdomain.com
```

Open the link it prints, create your account, and set up your first company.

Optional, once you have your account: add `PAPERCLIP_AUTH_DISABLE_SIGN_UP: "true"` under `environment:` and run `docker compose up -d` to close public sign-ups.

## 8. Sign in your agents

Either put `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` in `.env` and run `docker compose up -d`, or sign in with your subscription inside the container:

```
docker compose exec -it -u node paperclip claude
docker compose exec -it -u node paperclip codex
```

Logins are saved in the `paperclip-data` volume, so they survive restarts and updates.

## 9. Check and connect

```
curl https://paperclip.yourdomain.com/api/health
```

You want `"status":"ok"`, `"deploymentExposure":"public"` and `"bootstrapStatus":"ready"`. Then [connect Papercliped](/docs/hosting#connect-papercliped) and send *"Catch me up on my Paperclip."*

## Updates

When your agents are idle (an update restarts Paperclip and stops runs in progress):

```
cd ~/paperclip && docker compose pull && docker compose up -d
```

To pin a version instead of `latest`, use a tag like `ghcr.io/paperclipai/paperclip:2026.1005.0` and read Paperclip's release notes before changing it.

## Backups

Everything is in the `paperclip-data` volume. The safest copy is with Paperclip stopped:

```
cd ~/paperclip && docker compose stop paperclip
docker run --rm -v paperclip_paperclip-data:/data -v "$PWD":/backup alpine tar czf /backup/paperclip-$(date +%F).tgz -C /data .
docker compose start paperclip
```

Copy the `.tgz` somewhere off the server. Many providers also sell automatic server snapshots for a small fee.

## Use a separate Postgres (optional)

For bigger setups, add a Postgres service and point Paperclip at it:

```
  db:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: paperclip
      POSTGRES_PASSWORD: change-me-long-random
      POSTGRES_DB: paperclip
    volumes:
      - pgdata:/var/lib/postgresql/data
```

Then add `DATABASE_URL: postgres://paperclip:change-me-long-random@db:5432/paperclip` to Paperclip's `environment:` and `pgdata:` under `volumes:`. Do this on a fresh install; moving existing data needs a database export and import.

## Oracle Cloud free tier

Oracle's Always Free Ampere A1 servers are free but take extra steps:

- Open ports 80 and 443 in **two places**: the VCN's security list in the Oracle console, **and** the server's own firewall (Oracle's Ubuntu images ship strict `iptables` rules; allow 80 and 443 there or replace them with `ufw`).
- A1 servers are ARM; the Paperclip image supports ARM, so nothing else changes.
- Free capacity is often "out of host capacity" in popular regions, and Oracle can reclaim idle free servers. Fine for trying things, risky for anything you rely on.

## Troubleshooting

- **Caddy can't get a certificate:** the A record isn't pointing at the server yet, port 80 or 443 is closed, or Cloudflare's orange-cloud proxy is on. Check with `docker compose logs caddy`.
- **"This hostname is not allowed":** `PAPERCLIP_DEPLOYMENT_EXPOSURE` isn't `public`, or `PAPERCLIP_PUBLIC_URL` doesn't match the address you're using.
- **The container keeps restarting:** run `docker compose logs paperclip`. A missing `BETTER_AUTH_SECRET` or a public URL that isn't `https://` stops it at startup.
- **Agents fail straight away:** they have no API key or login (step 8).
- More: [Troubleshooting](/docs/troubleshooting).
