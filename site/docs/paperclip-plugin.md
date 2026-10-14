# Paperclip plugin

The Papercliped plugin puts Papercliped inside Paperclip. It adds the [control room](/docs/control-room): a **Papercliped** entry in the sidebar that opens a page where you see every connected AI app, choose what each may do and which agents it applies to, set [API only, Full or Agent only](/docs/access-modes) for every agent or one at a time, read what was used and what was blocked, and look after your account. It also adds a **Papercliped** tab on every agent's page and a widget for the dashboard.

The plugin manages your Papercliped account and the limits on AI apps. It reads your agents' names, roles and status to list them, and never changes anything in Paperclip. AI apps still connect through Papercliped as before.

## Install (Paperclip admin)
**Automatic (recommended).** When you connect your Paperclip from an AI app, the address step has a box, ticked by default: **Also install the Papercliped plugin in my Paperclip**. After you approve the sign-in, Papercliped asks your Paperclip to install it using Paperclip's own installer and your own approved key. It installs one fixed package, `papercliped-paperclip-plugin`, at the exact version that matches the service, and only when you are the Paperclip's instance admin. If you are not an admin, if it is already installed, or if your Paperclip can't install plugins, nothing happens and your connection works as usual. Untick the box to skip it.

**By hand.** Install the npm package `papercliped-paperclip-plugin` from **Settings → Plugins** in Paperclip (instance admin only). You can remove it there at any time, whichever way it was installed.

The plugin asks for these capabilities: store its own data, make outbound web requests (to Papercliped), read agents (to list them), and add a sidebar entry, a page with its own menu, an agent tab and a dashboard widget.

**Updating from an earlier version.** Paperclip won't update a plugin to a version that asks for new permissions without an admin's approval, so go to **Settings → Plugins**, remove Papercliped, and install it again (or connect your Paperclip again with the install box ticked). You may need to link your account again; your Papercliped account, sessions and settings are kept at Papercliped and are not affected.

The bridge address defaults to `https://papercliped.co`. If you host your own bridge, change **Papercliped bridge URL** in the plugin's settings. It must be `https`.

## Link your account
1. In Paperclip, open **Papercliped** in the sidebar.
2. Enter the **username** and **secret key** you got when you first connected Claude or ChatGPT, and click **Link**.

Papercliped checks the key once and hands the plugin a link token. The key itself is not stored in Paperclip. Each person in your Paperclip links their own Papercliped account; one person's link is never used for another.

Lost your secret key? Connect from your AI app again and choose **Connect your Paperclip**: you keep your account and get a new key.

## What you can do
The [control room](/docs/control-room) has six sections:

- **Overview:** the access switch (API only, Full, Agent only), your numbers, and what needs a look.
- **Sessions:** every connected app. Name it, set its level, choose its tools and which agents it applies to, see its recent calls, or disconnect it. It applies on the app's next request.
- **Agents:** what Papercliped may do with each agent, including turning one off.
- **Tools:** every tool, by what it does and what your settings allow.
- **Activity:** recent calls, including the ones that were blocked.
- **Settings:**
  - **Privacy:** appear anonymously in the service's logs, or switch back.
  - **Linked Paperclips:** see every Paperclip linked to your account, unlink this one, or remove an old one.
  - **Account** (asks for your secret key again):
    - **Make a new secret key.** Shown once. The old key stops working and other linked Paperclips have to link again; this one stays linked.
    - **Disconnect my Paperclip.** Papercliped forgets your Paperclip key and asks your Paperclip to revoke it. Every app stops working and the plugin unlinks. Your account stays.
    - **Delete my account.** Removes your username, stored key and every connection. Type your username to confirm.

Outside the control room: the **Papercliped tab** on an agent's page sets what AI apps may do with that one agent, and the **dashboard widget** shows the access switch in small.

## Good to know
- The plugin runs as trusted code inside Paperclip, so install it only from the official package. The automatic install is limited to that one package and to the version that matches the service, and it is always your choice on the connect screen.
- The link token stays on your Paperclip server and is never shown on the page. It can only manage your account: it can't call any Paperclip tool.
- There is no separate website page for this any more; the old `/manage` address points here.
