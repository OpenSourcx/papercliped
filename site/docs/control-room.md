# The control room

The control room is Papercliped inside Paperclip: one place to see every AI app connected to your Paperclip, what each is allowed to do, and what it has done. It opens from **Papercliped** in Paperclip's sidebar and uses Paperclip's own look, so it follows your theme.

You need the [Paperclip plugin](/docs/paperclip-plugin) installed and your Papercliped account linked. Everything here takes effect on the app's **next request**: nothing needs reconnecting.

## How it fits together
Three things decide what an AI app can do. Papercliped checks all three on every call, and the strictest one wins.

| Layer | Where you set it | Decides |
| --- | --- | --- |
| **Access switch** | Overview, Agents, dashboard widget, agent tab | Whether AI apps may control Paperclip directly, work through agents, or both ([API only, Full or Agent only](/docs/access-modes)), for every agent or one agent at a time |
| **Session** | Sessions | Which tools one connected app may use, and which agents it applies to |
| **Level** | Sessions | Read only or Full control, as chosen when the app connected ([Permissions](/docs/permissions)) |

## The menu
While the control room is open, Paperclip's left menu is replaced by Papercliped's, the same way it is on an agent's page. **Back to Paperclip** at the top returns you.

### Overview
The front page. The **access switch** is a three-position switch: **API only**, **Full** (the default) and **Agent only**. Click a position, or use the arrow keys when the switch has focus. It saves at once. Beside it: how many sessions you have, how many agents, the calls made today and how many were blocked, a short list of things that need a look (a session that never made a call, an agent turned off, blocked calls, a Paperclip key that is not connected), and the latest calls.

### Sessions
Every AI app connected through Papercliped is a **session**. Open one to change:

- **Name.** Rename a session to tell two apps or two devices apart. Up to 60 characters.
- **Level.** Read only or Full control.
- **Tools.** *All tools* means every tool its level and the switch allow. Untick it to choose exactly which tools this session may use, grouped as **Look**, **Work through agents** and **Direct control**. When a session is Read only, tools that change things are greyed out with "Needs Full control".
- **Agents.** *Everyone* (including agents you add later), or **selected agents**. A session limited to selected agents works only with those agents: it can look at them, pause them, wake them, give them work, and use issues assigned to them. It cannot use views across every agent, such as reports, the org chart, goals and approvals, because those would show agents it doesn't apply to. The page says so when you choose it.
- **Recent calls** for just this session, and **Disconnect**.

Save with **Save changes** (it stays disabled until something changed and says what's wrong if a list is empty). **Discard** puts everything back.

### Agents
Papercliped follows the access switch for every agent. Here you can set any agent apart: **Default**, **API only**, **Full**, **Agent only** or **Off**.

**Off** hides the agent completely. AI apps can't see it, can't touch it, and don't see anything assigned to it or its spending in lists and reports. Use it for agents you never want an AI app near.

The default for every agent can also be changed from this page. Settings for agents that no longer exist (or are in another company) are listed so you can remove them.

### Tools
All tools an AI app can use, grouped by what they do, with what the switch allows right now and how many of your sessions can use each. Use it to answer "can my laptop session pause an agent?" without opening each session.

### Activity
The newest calls through your sessions: when, which session, which tool, and the result: **OK**, **Blocked** (by your settings) or **Failed** (with the reason, such as "Paperclip unreachable"). Filter by session, or to blocked and failed only. It refreshes every 20 seconds.

Activity shows *what was used and what happened*. It never records what was sent to a tool or what came back. On the hosted service it is kept for 30 days.

### Settings
Privacy (appear anonymously in the service's logs), the Paperclips linked to your account, and the account itself (a new secret key, disconnect your Paperclip, delete the account). These ask for your secret key again. See [Anonymous mode](/docs/anonymous-mode).

## In the rest of Paperclip
- **An "Papercliped" tab on every agent's page.** Set what AI apps may do with *this* agent, and see which sessions reach it.
- **A dashboard widget.** The access switch in small, with the number of sessions and blocked calls.
- **A sidebar entry**, with the paperclip icon, under your other sections.

## Good to know
- These settings limit what AI apps can do **through Papercliped**. They don't change what your own Paperclip account can do in Paperclip itself.
- A blocked call returns a plain message to the AI app saying which setting stopped it and where to change it, so it doesn't keep retrying. See [Limits and errors](/docs/limits-and-errors).
- Tools that can never run for a session (switched off by the access switch or left out of its tool list) are not shown to the AI app at all.
- Totals the Paperclip server already added up (for example total spend) still include hidden agents. Lists, reports by agent and anything built from them don't.
- New permissions need approval in Paperclip. If you installed an earlier version of the plugin, remove it and install it again from **Settings → Plugins** to get the control room (see [Paperclip plugin](/docs/paperclip-plugin)).
