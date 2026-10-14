# Community: Discord, Discussions and socials

A ready-to-follow setup for the Discord, plus where everything else lives. Papercliped's community is **OpenSourcedd**: the Discord server (https://discord.gg/cAECU68jSA) and r/OpenSourcedd on Reddit, both set in `web/src/config/community.ts`. Other links show up on the website only once they're set (`VITE_X_URL`, `VITE_DISCUSSIONS_URL`, `VITE_FORUM_URL` at build time; `VITE_DISCORD_URL` / `VITE_REDDIT_URL` override the defaults). Nothing here needs a bot.

## 1. Create the server (about 20 minutes)

1. Discord → **+ → Create My Own → For a club or community**. Name: **Papercliped**. Icon: `web/public/brand/mascot-dark.svg` exported to PNG (or the 512px social image).
2. **Server Settings → Enable Community.** This turns on rules screening, a rules channel and an announcements channel.
3. **Safety Setup:** verification level **Medium** (verified email, on Discord 5+ minutes); explicit media filter **all members**; turn on **AutoMod** with "Block commonly flagged words", "Block mention spam" (limit 5) and a custom rule that blocks messages matching `pcs_`, `pcb_` and `sk-` (secret keys and tokens), with the reply "Never post secret keys. Make a new one in the Papercliped plugin."
4. **Invite link:** never expires, no use limit. Put it in `VITE_DISCORD_URL` (Render env for the website build) and tell a maintainer to add it to `.github/ISSUE_TEMPLATE/config.yml`.

## 2. Channels

| Category | Channel | Who can post | What for |
| --- | --- | --- | --- |
| **Start here** | `#rules` | Maintainers | Server rules (below); Community "rules screening" uses it |
| | `#welcome` | Maintainers | What Papercliped is, links to docs and install steps |
| | `#announcements` | Maintainers | Releases (automatic, below) and news; members can follow it into their own servers |
| | `#get-contributor` | Everyone | Post a link to your merged PR to get the Contributor role |
| **Community** | `#general` | Everyone | Chat |
| | `#help` (Forum channel) | Everyone | One post per question; tags: Claude, ChatGPT, Codex, Plugin, Self-hosting, Solved |
| | `#ideas` (Forum channel) | Everyone | Feature ideas; good ones become GitHub issues |
| | `#show-and-tell` | Everyone | What you built with your agents; the only place for self-promotion |
| **Build** | `#contributors` | Contributors and up | Coordinating work, reviews, design questions |
| | `#releases-feed` | Bot (webhook) | Every GitHub release, automatically |
| | `#maintainers` (private) | Maintainers | Moderation and security coordination; never discuss vulnerability details anywhere else |

## 3. Roles

| Role | Colour | Given to | Permissions beyond default |
| --- | --- | --- | --- |
| **Maintainer** | Cream `#e9e4b0` | People with merge and release rights on GitHub | Manage messages, timeout members, post in Start here, see `#maintainers` |
| **Triager** | Blue | People with GitHub triage access | Manage threads in `#help`/`#ideas`, mark Solved |
| **Contributor** | Green | Anyone with a merged pull request | Post in `#contributors` |
| **Member** | default | Everyone who accepts the rules | Post in Community |

Keep the list of Maintainers on Discord identical to GitHub's. Remove roles when people step back.

## 4. Rules (paste into `#rules`)

1. Be kind. Follow the [code of conduct](https://github.com/OpenSourcx/papercliped/blob/main/CODE_OF_CONDUCT.md).
2. **Never post secret keys, tokens or Paperclip addresses with credentials.** If you do by accident, make a new key in the Papercliped plugin straight away and tell a maintainer.
3. Security problems go to support@papercliped.co or GitHub's private reporting, never a channel.
4. One question per `#help` post, with what you tried and the error you saw.
5. No spam or DMs to people you don't know. Self-promotion only in `#show-and-tell`.
6. Stay on topic: Papercliped, Paperclip and running AI agents.
7. Maintainers' moderation decisions are final; appeal by email to support@papercliped.co.

## 5. Welcome message (paste into `#welcome`)

> **Welcome to Papercliped!** Papercliped connects Claude, ChatGPT, Codex and any MCP app to your Paperclip.
>
> • Install it: https://github.com/OpenSourcx/papercliped#add-it-to-your-ai-app
> • Docs: https://docs.papercliped.co
> • Stuck? Open a post in #help. Ideas go in #ideas.
> • Want to contribute? Read https://github.com/OpenSourcx/papercliped/blob/main/CONTRIBUTING.md, then grab a `good first issue`.
>
> Never post your secret key or tokens.

## 6. Onboarding

**Server Settings → Onboarding:** default channels `#welcome`, `#general`, `#help`, `#announcements`. One question, "What do you use Papercliped with?" (Claude / ChatGPT / Codex / Plugin in Paperclip / Self-hosting). Each answer is just a tag for now; it helps us see where people come from.

## 7. Releases into Discord automatically

Every push to `main` becomes a GitHub release (see [RELEASING.md](RELEASING.md)). To post them:

1. In `#releases-feed`: **Edit Channel → Integrations → Webhooks → New Webhook**, copy its URL.
2. GitHub → repository **Settings → Webhooks → Add webhook**. Payload URL: the Discord URL **with `/github` added at the end**. Content type `application/json`. **Let me select individual events → Releases** only.
3. Optionally do the same for `#announcements`, so major and minor releases are visible there; patches stay in the feed.

## 8. Becoming a contributor (how roles are given)

1. Someone's pull request is merged.
2. They post the link in `#get-contributor`.
3. A maintainer checks it and gives the Contributor role (and adds them to the release thanks).

Triager and Maintainer are by invitation, decided by the maintainers together; see "From first PR to maintainer" in [CONTRIBUTING.md](../CONTRIBUTING.md).

## GitHub Discussions (the forum)

Turn on **Discussions** in the repository settings with the categories Q&A, Ideas, Show and tell and Announcements. Then set `FORUM_URL=https://github.com/OpenSourcx/papercliped/discussions` on the bridge (Render), so `forum.papercliped.co` redirects there, and `VITE_DISCUSSIONS_URL` / `VITE_FORUM_URL` for the website. Pin a "Start here" discussion that links the README install steps.

## X (social)

Create the account, set `VITE_X_URL`, and post major and minor releases from the changelog feed (`https://papercliped.co/changelog.xml`).
