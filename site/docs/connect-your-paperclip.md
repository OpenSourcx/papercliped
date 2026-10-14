# At home, with a tunnel

Run Paperclip on your own computer and give it a public `https://` address with a free tunnel. You don't open any ports on your router. This is the cheapest way to start, and a good way to try Papercliped before you rent a server.

**You'll end up with:** Paperclip on your computer, reachable at a public address like `https://paperclip.yourdomain.com` or `https://my-pc.my-tailnet.ts.net`, connected to Papercliped.

**Good to know:** while your computer sleeps or is off, your agents and your AI app's connection stop. For a Paperclip that's always on, use a [VPS or a hosting platform](/docs/hosting).

## 1. Choose a tunnel

| Tunnel | Your address | Stays the same? | Needs | Good for |
| --- | --- | --- | --- | --- |
| **Cloudflare Tunnel** | `https://paperclip.yourdomain.com` | Yes | A domain on Cloudflare (free plan) | Daily use (recommended) |
| **Tailscale Funnel** | `https://<computer>.<tailnet>.ts.net` | Yes | A free Tailscale account | Daily use without a domain |
| **ngrok** | one free `*.ngrok-free.app` address | Yes | A free ngrok account | Daily use without a domain |
| **Cloudflare quick tunnel** | random `*.trycloudflare.com` | **No, changes every restart** | Nothing | Trying it for an afternoon |

Pick one and **work out your address first**: Paperclip needs to know it during setup (step 2). The tunnel sections below show how to get it.

## 2. Install Paperclip in public mode

You need **Node.js 24.11 or newer** (check with `node -v`; get it from nodejs.org).

```
npx paperclipai onboard
```

When it asks:

- **Deployment mode:** `authenticated` (people sign in).
- **Exposure:** `public`.
- **Public URL:** your tunnel address from step 1, for example `https://paperclip.yourdomain.com` (with `https://`, no slash at the end).
- **Bind:** `loopback`. The tunnel connects from your own computer, so Paperclip doesn't need to listen on your network.

These choices are the same as the settings `PAPERCLIP_DEPLOYMENT_MODE=authenticated`, `PAPERCLIP_DEPLOYMENT_EXPOSURE=public` and `PAPERCLIP_PUBLIC_URL`, which you can also set as environment variables. Onboarding creates the secrets Paperclip needs and saves them in `~/.paperclip/instances/default/.env`. Start Paperclip with:

```
npx paperclipai run
```

It listens on port **3100**. (If something else already uses 3100, Paperclip quietly picks another port and prints it; use that port in the tunnel instead.)

**Already running Paperclip on this computer** in the default `local_trusted` mode (no login)? Change it with `npx paperclipai configure --section server`: choose `authenticated`, `public`, and your tunnel address. Never put a `local_trusted` Paperclip behind a public address: anyone who finds it could control it.

**Prefer Docker?** Use the Compose file from the [VPS guide](/docs/host-vps#5-create-the-docker-compose-file) without the `caddy` service, add `ports: ["127.0.0.1:3100:3100"]` to the Paperclip service, and set `DOMAIN` to your tunnel's hostname.

## 3. Start the tunnel

Follow the section for the tunnel you chose, then come back for step 4.

### Cloudflare Tunnel (with your domain)

Stable address on your own domain. The tunnel and DNS are free on Cloudflare's free plan; the domain itself isn't (Cloudflare Registrar sells them at cost).

1. **Put your domain on Cloudflare:** create a free account, add your domain, and switch its nameservers to the two Cloudflare gives you (at the company where you bought the domain). Wait until Cloudflare shows it as active.
2. In the Cloudflare dashboard, open **Zero Trust → Networks → Tunnels → Create a tunnel**, choose **Cloudflared**, and name it `paperclip`.
3. Cloudflare shows an install command for Windows, macOS or Linux that includes a token, like `cloudflared service install eyJ…`. Run it on this computer. It installs `cloudflared` as a service that starts with the computer. (Keep the token private; it's the key to your tunnel.)
4. Under **Public Hostname**, add: subdomain `paperclip`, your domain, service type **HTTP**, URL **`localhost:3100`**. Save.

That's it: `https://paperclip.yourdomain.com` now reaches your Paperclip. Don't turn on Cloudflare Access, Bot Fight Mode or a WAF challenge for this hostname (or exempt `/api/*`), or Papercliped will be blocked.

<details><summary>Prefer the command line?</summary>

```
cloudflared tunnel login
cloudflared tunnel create paperclip
cloudflared tunnel route dns paperclip paperclip.yourdomain.com
```

Create `config.yml` in your `.cloudflared` folder (`~/.cloudflared` on macOS and Linux):

```
tunnel: <TUNNEL-ID>
credentials-file: <PATH-TO-THE-CREDENTIALS-FILE>.json
ingress:
  - hostname: paperclip.yourdomain.com
    service: http://localhost:3100
  - service: http_status:404
```

Try it with `cloudflared tunnel run paperclip`, then install it as a service with `cloudflared service install` (`sudo` on Linux and for start-at-boot on macOS). **On Windows** the service runs as SYSTEM, so it doesn't read your user folder: put `config.yml` and the credentials file in `C:\Windows\System32\config\systemprofile\.cloudflared\`, then run `cloudflared.exe service install` from an Administrator PowerShell. The dashboard method above avoids all of this.

</details>

### Tailscale Funnel (no domain)

1. Create a free Tailscale account and install Tailscale on this computer.
2. Run:
   ```
   tailscale funnel --bg 3100
   ```
   The first time, it walks you through turning on HTTPS certificates and Funnel for your tailnet. It prints your address, like `https://my-pc.my-tailnet.ts.net`, and keeps running in the background.
3. Funnel only serves on ports 443, 8443 and 10000; the command above uses 443, which is what Papercliped needs. Funnel addresses always end in `.ts.net` (no custom domains), and bandwidth is limited, which is fine for Papercliped's small requests.

Find your address any time with `tailscale funnel status`.

### ngrok (no domain)

1. Create a free ngrok account. Your account gets one free static address (under **Domains** in the ngrok dashboard), like `your-name.ngrok-free.app`. You can't choose it on the free plan.
2. Install ngrok and add your authtoken (the dashboard shows the exact command).
3. Run, with your own address:
   ```
   ngrok http --url=your-name.ngrok-free.app 3100
   ```
4. On the free plan ngrok shows a "You are about to visit…" page to **web browsers** the first time. Click **Visit Site** when you open Paperclip in your browser; requests from programs like Papercliped aren't affected. If a connection ever fails with an unexpected HTML page, this page is the likely cause.

To keep ngrok running after you close the terminal, see ngrok's docs on running it as a service (`ngrok service install`).

### Cloudflare quick tunnel (trial only)

No account, no domain. Install `cloudflared`, then:

```
cloudflared tunnel --url http://localhost:3100
```

It prints a random `https://something.trycloudflare.com` address. Use that as the public URL in step 2 (`npx paperclipai configure --section server` if you already onboarded). **The address changes every time you restart it**, and then Papercliped can't reach your Paperclip until you set the new address in Paperclip and connect again. Quick tunnels are for testing only.

## 4. Create your account

In another terminal on the same computer:

```
npx paperclipai auth bootstrap-ceo --base-url https://your-address
```

It prints a one-time invite link. Open it, create your account and your first company. (If you switched an existing Paperclip from `local_trusted`, it may instead print a one-time **claim** link when it starts; either works.)

## 5. Check it works

From another network (your phone on mobile data is a good test):

```
curl https://your-address/api/health
```

(On Windows PowerShell use `curl.exe`.) You want JSON with `"status":"ok"`, `"deploymentMode":"authenticated"`, `"deploymentExposure":"public"` and `"bootstrapStatus":"ready"`.

## 6. Connect Papercliped

1. Add the connector in your AI app. In Claude: **Settings → Connectors → Add custom connector**, address `{{MCP}}/mcp`.
2. Choose **Connect your Paperclip**, enter your public address (just the address, no path) and approve the request in your Paperclip. The box **Also install the Papercliped plugin in my Paperclip** is ticked by default; it installs the [Paperclip plugin](/docs/paperclip-plugin) and its [control room](/docs/control-room) for you if you are your Paperclip's instance admin.
3. Pick a username, save the secret key you're shown once, and choose **Read only** or **Full control**. Every screen: [Create your account](/docs/signup).
4. Send your first prompt: *"Catch me up on my Paperclip."* More in the [prompt gallery](/docs/prompts).

## Keep it running

- **Turn off sleep** on this computer, or your agents and connection stop whenever it sleeps.
- **Start Paperclip with the computer.** The Cloudflare dashboard tunnel and Tailscale already do; for Paperclip itself, add `npx paperclipai run` to your login items (macOS), Task Scheduler (Windows) or a systemd service (Linux), or use the Docker setup, which restarts by itself.
- **Update Paperclip** with `npx paperclipai@latest run` when your agents are idle.

## Keep it safe

- **Expose only Paperclip.** Point the tunnel at port 3100 and nothing else on your computer.
- **Never expose `local_trusted` mode.** Always `authenticated` + `public`.
- **Keep Paperclip up to date.**
- **You can cut access any time:** disconnect apps in the [Paperclip plugin](/docs/paperclip-plugin), or revoke the key in Paperclip.

## Troubleshooting

- **"Could not reach your Paperclip":** the tunnel or Paperclip isn't running, a new DNS name hasn't spread yet (give it a few minutes), or the address isn't on port 443. Test with `curl` from another network.
- **"Private address" errors:** you entered a LAN address, `localhost` or `http://`. Use the public `https://` address from your tunnel.
- **"This hostname is not allowed for this Paperclip instance":** Paperclip's public URL doesn't match the tunnel address, or exposure is still `private`. Fix it with `npx paperclipai configure --section server` and restart.
- **A challenge or login page appears:** exempt `/api/*` from Cloudflare Access, Bot Fight Mode, "Under Attack" mode or any managed challenge.
- **Worked yesterday, not today:** the computer slept, the tunnel stopped, or a quick tunnel's address changed.
- More: [Troubleshooting](/docs/troubleshooting).
