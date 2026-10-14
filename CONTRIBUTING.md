# Contributing to Papercliped

Thanks for helping! Papercliped is a free, open-source (MIT) bridge between AI apps and [Paperclip](https://github.com/paperclipai/paperclip). Every kind of help counts: bug reports, docs fixes, ideas, answering questions, and code.

## Ways to help

- **Report a bug** with the [bug form](https://github.com/OpenSourcx/papercliped/issues/new/choose). Never paste secret keys, tokens or other people's data.
- **Suggest a feature** with the feature form, or on the [community page](https://papercliped.co/community).
- **Fix something small:** look for issues labelled [`good first issue`](https://github.com/OpenSourcx/papercliped/labels/good%20first%20issue) or [`help wanted`](https://github.com/OpenSourcx/papercliped/labels/help%20wanted).
- **Improve the docs:** every docs page has an "Edit this page on GitHub" link.
- **Help others** in GitHub Discussions, on the OpenSourcedd [Discord](https://discord.gg/cAECU68jSA) and on [r/OpenSourcedd](https://www.reddit.com/r/OpenSourcedd).

Security problems go to [SECURITY.md](SECURITY.md), never a public issue.

## Your first pull request

1. Comment on the issue you want to take, so two people don't do the same work. For anything bigger than a fix, open an issue first and agree the approach.
2. Fork the repository and make a branch: `fix/docs-search-headings`, `feat/plugin-export`.
3. Set up and make your change (below). Add or update tests for what you changed.
4. Add a line under `## Unreleased` at the top of `CHANGELOG.md`, written for users: `- **Fixed:** docs search now finds headings.`
5. Open the pull request and fill in the template. CI must be green.

A maintainer reviews it, usually within a few days. When it's merged, the maintainer picks the version number (see "Releases") and it ships automatically.

## Setup

```sh
npm ci                        # the bridge (also builds)
npm --prefix plugin ci        # the Paperclip plugin (separate package, Node 24.11+)
npm --prefix web ci           # the website
```

Node 22+ for the bridge and website, Node 24.11+ for the plugin. Some bridge tests need Postgres and are skipped without it: set `TEST_DATABASE_URL=postgresql://postgres:<password>@127.0.0.1:5432/<db>`.

## Checks to run before you push

```sh
npm run typecheck && npm test                                                     # bridge
npm --prefix plugin run typecheck && npm --prefix plugin test && npm --prefix plugin run build   # plugin
npm --prefix web test && npm --prefix web run build && npm --prefix web run check:routes         # website
npm run build && npm run schema:sql && git diff --exit-code docs/supabase-schema.sql             # only if you changed migrations/
```

CI runs the same checks. Two hard rules: **never commit secrets**, and **never weaken a security check to make a test pass**; fix the cause instead. The website keeps a strict Content Security Policy (no inline scripts or styles, nothing loaded from third parties); see `web/README.md`.

## Where things live

| Path | What |
| --- | --- |
| `src/tools.ts` | The tool catalogue every AI app gets |
| `src/oauth/` | Sign-in, consent and access levels |
| `src/manage/` | The manage API the Paperclip plugin uses |
| `plugin/` | The Papercliped plugin for Paperclip |
| `web/` | The website and docs site |
| `site/docs/` | User docs (Markdown) |
| `.claude-plugin/`, `.mcp.json`, `skills/`, `commands/` | The Claude Code plugin |
| `.codex-plugin/` | The Codex plugin |

## Releases

Every push to `main` is a release: maintainers bump the version (Major.Minor.Patch) with `node scripts/version.mjs`, and CI publishes to npm, tags the commit and writes the GitHub release from the changelog and the commit description. Pull requests are squash-merged so each one becomes one clean release. The full rules are in [the release skill](.agents/skills/release/SKILL.md) and [docs/RELEASING.md](docs/RELEASING.md).

## From first PR to maintainer

| Role | How you get it | What it means |
| --- | --- | --- |
| **Member** | Join Discord or GitHub Discussions | Ask, answer, suggest |
| **Contributor** | One merged pull request | Contributor role on Discord, listed in the release notes, access to `#contributors` |
| **Triager** | Several merged PRs, or steady help with issues and questions, and a maintainer invites you | GitHub triage access: label, close duplicates, reproduce bugs |
| **Maintainer** | Sustained, high-quality contributions and good judgement on reviews; invited by the existing maintainers | Review and merge, cut releases, help steer the roadmap |

To get the Contributor role on Discord, post a link to your merged pull request in `#get-contributor`. Roles are about trust built over time, not volume: small, careful PRs count.

## Code of conduct

Everyone taking part agrees to the [code of conduct](CODE_OF_CONDUCT.md). Report problems to support@papercliped.co.
