# Site refresh: working brief (temporary file)

**This file is the brief for the pull request it lives in. Do the work on this branch, in this pull request. Your last commit before asking for review deletes this file.** Anything worth keeping goes into `docs/SITE-V2-PRODUCT-CONTRACT.md` ("Visual grammar") or the pull request description, not here.

## Why

ePaperclip 1.0 was posted to r/Proxmox. The feedback, from people who looked at papercliped.co:

- "That AI generated website is terrible. I can't even tell what this thing does."
- "Do you have any screenshots?"
- "I'm not installing anything on my hypervisor, especially something that wants me to install it as root."
- "What is this accomplishing that the Proxmox UI isn't?"

They are right about the site. It leads with slogans ("The power of the Pin", "Four parts. One connected idea."), shows a scripted demo and conceptual panels where real screenshots should be, and never says in one plain sentence what the software is. The goal of this work: **a visitor understands what ePaperclip is, sees it, and can install it, within one screen, the way a good GitHub README works.**

## Read first

- `CLAUDE.md` (rules: CSP, no third-party loads, releases, no AI model names)
- `docs/SITE-V2-PRODUCT-CONTRACT.md` (product language and honesty rules; you will update its "Visual grammar" and homepage sections)
- `web/src/pages/Home.tsx`, `Product.tsx`, `Docs.tsx`, `Community.tsx`, `web/src/styles/index.css`, `web/src/theme/`, `web/src/components/ui.tsx`, `CodeBlock.tsx`
- `site/docs/*.md` and `web/src/content/docs-nav.ts`
- `src/web/routes.ts` (page titles and link-preview text)
- In `OpenSourcx/papercliped-engine`: `docs/USER-GUIDE.md`, `docs/INSTALL.md`, `docs/SECURITY.md`, `docs/PIN.md`, `deploy/epaperclip.service` (the facts the site must state correctly)

Then write a short plan as a comment on this pull request and wait for the owner's go-ahead before building.

## 1. Typography and visual style

Today: Bricolage Grotesque for headings, Inter for text, JetBrains Mono for code, with very large, very tight headlines, gradient text, uppercase letter-spaced eyebrows, "01 / 04" numbering, pill badges and 28px-radius cards. Together these read as a generated template.

What established developer companies use (checked November 2026):

| Company | Typeface | Licence |
| --- | --- | --- |
| Vercel | Geist Sans, Geist Mono | SIL OFL, free to self-host |
| GitHub | Mona Sans (display), system fonts for text | SIL OFL |
| Linear | Inter and Inter Display | SIL OFL |
| Stripe | Söhne | Commercial (paid) |

**Decision to implement:** one family for everything, **Geist Sans** for headings and text and **Geist Mono** for code, both self-hosted as variable `woff2` files in `web/public/fonts/` with their licence files (the CSP forbids loading fonts from anywhere else). Remove Bricolage Grotesque and JetBrains Mono and their licence files. If the owner prefers the GitHub look, Mona Sans is the drop-in alternative; ask before switching.

Style rules (write these into the contract's "Visual grammar"):

- **Headings:** at most 56px on desktop for the page title, weight 600, letter-spacing no tighter than -0.02em. No `clamp()` hero sizes above that. No gradient or highlighted text.
- **Text:** 16px body, 1.6 line height, measure 60 to 75 characters.
- **No decoration that carries no information:** remove uppercase tracked eyebrows, "01 / 04" numbering, glow backgrounds (`v2-hero-light`), pill taglines, and hover translations on cards.
- **Shape:** 8px radius for controls and cards, 12px at most for large panels. 1px borders, no drop shadows except on real screenshots.
- **Colour:** keep the theme tokens and palettes; one accent, used for the primary action and links only.
- **Words:** say what a thing is and does. No slogans as headings. Sentence case. Keep the contract's honesty rules: nothing unreleased described as available.

References to study for layout and tone, not to copy: GitHub Primer (primer.style) for type scale and spacing, Vercel's Geist design system (vercel.com/geist) for restraint, tailscale.com and docs.stripe.com for product pages and docs that explain quickly.

## 2. Home page: one clear screen

Above the fold, in this order:

1. **What it is, in one sentence:** "ePaperclip is a free, open-source web console you install on your Proxmox host: one place for your VMs, containers, storage and backups, with optional AI agents that run in their own containers."
2. **A real screenshot** of the console (see section 6), not `PinStage`.
3. **The install command** in a copyable block, apt first, with a "Read the install guide" link.
4. Three facts in plain words: MIT licensed with a link to the source; installs beside Proxmox and never reimages or repartitions; Proxmox's own interface on port 8006 keeps working.

Below: what you can do with it (four short sections, each with a real screenshot: machines, storage and backups, organizations and agents, Pin), then "The family" as a plain table of the products with a status for each (Available, Preview, Planned), then the trust section (section 4), then community.

`PinStage` and the scripted demo move to `/pin`, labelled as a preview. "The power of the Pin" may remain as a line on `/pin`, not as the site's headline.

## 3. Product page like a good README (`/epaperclip`)

Structure it the way a strong GitHub README reads:

1. Name, one-sentence description, status and licence badges as plain text (version from the real latest release, read at build time; never hand-typed).
2. Screenshot.
3. **Install:** the existing tabs, apt first. Keep the keyring fingerprint check.
4. **What you get:** a short list, each item one line.
5. **How it works:** a simple diagram (inline SVG, both themes): browser → ePaperclip service → Proxmox API as the signed-in person; agents in unprivileged containers; Pin proposing, you approving.
6. **What it runs as and what it can touch** (section 4).
7. **Without AI:** state plainly that the console is useful with no model connected and that agents and Pin are optional. Verify in the engine repository exactly what works with no provider configured before writing the sentence.
8. Requirements, updating, uninstalling, links to docs and source.

## 4. Trust: "What it runs as and what it can touch"

A section on `/epaperclip` and a docs page `site/docs/epaperclip-security.md`. Every statement must be verified against `papercliped-engine` (cite file and line in the pull request description), then written for a sceptical Proxmox administrator:

- which system users the services run as, and the systemd hardening in force
- that it acts on Proxmox through the API as the signed-in person, so Proxmox permissions apply
- what the installer changes on the host and what it never touches (port 8006, disks, partitions, Proxmox packages)
- how releases are signed and how to verify the apt key fingerprint
- where agents run, that they hold no Proxmox credentials, and that containers cannot mount host folders
- how to uninstall, and a recommendation to try it in a nested Proxmox VM first

If something cannot be verified, leave it out and list it in the pull request description.

## 5. Docs with real snippets

- **ePaperclip gets its own docs section**, not two pages: Install, First sign-in, Machines, Storage and backups, Organizations and agents, Pin, Connectors and models, Updating and rollback, Uninstall, Security (section 4), Troubleshooting. Source the content from the engine repository's docs; link to them for depth.
- **Every task page follows one shape:** what you'll do, before you start, numbered steps with the exact command or the exact button names, what you should see (real output or a screenshot), what to do if it fails.
- **Snippets are real:** every command is one you ran; every sample output is pasted from a real run, trimmed. Add copy buttons through the existing `CodeBlock`. No placeholder output.
- **Reference pages** (`tools`, `manage-api`, `public-api`, `cli`) get a request and response example per endpoint or command.
- Keep `docs-nav.ts` and its test passing (every page listed once). Check that search still indexes the new pages.

## 6. Real screenshots

Take them from the real console, not mock-ups: run `papercliped-engine`'s console in demo mode (see its `docs/` and `apps/console/package.json`) and capture with Playwright at 1440×900, in the site's dark and light themes: home, a machine, backups, an organization with agents, Pin. Save as optimised images under `web/public/screens/` with descriptive names, real `alt` text, and explicit width and height. Label them "Demo data". Add a script (`web/scripts/screens.mjs`) so they can be retaken after a release.

## 7. Community and "what we're building"

- **Forum:** use GitHub Discussions on `OpenSourcx/papercliped-engine` as the forum (categories: Announcements, Q&A, Ideas, Show and tell). The Community page links to it as the main place to talk. Check whether Discussions is enabled; if it is not, say so in the pull request and leave the link out (the repository rule: never invent community links).
- **What we're building** (`/roadmap`): one honest page listing each product and feature area as Available, In progress or Planned, generated from a small data file, each row linking to its docs or its tracking issue. No dates that aren't committed.
- Keep the idea form; point it at the right repository per product.

## 8. Housekeeping

- `src/web/routes.ts`: update titles and descriptions. `/epaperclip` still says "Release-candidate software"; 1.0 is released.
- Regenerate `web/public/og.png` and the social images with the new type (`web/scripts/`), showing a real screenshot.
- Update `docs/SITE-V2-PRODUCT-CONTRACT.md`: new homepage order, the type and style rules, the screenshot rule (real, labelled demo data).
- `CHANGELOG.md` entry under `## Unreleased`. The owner runs the release.

## 9. Performance on phones

The owner ran Lighthouse 13.5 on the live home page on 15 November 2026. Scores: Accessibility, Best Practices and SEO 100 on both. Performance **99 on desktop, 82 on mobile** (simulated mid-range phone, 4x CPU slowdown).

| Mobile metric | Measured | Target after this work |
| --- | --- | --- |
| First Contentful Paint | 2.2 s | under 1.8 s |
| Largest Contentful Paint | 2.7 s | under 2.5 s |
| Total Blocking Time | 470 ms | under 200 ms |
| Cumulative Layout Shift | 0.001 | keep under 0.1 |

Both runs had browser extensions active (an ad blocker and an assistant extension), which add main-thread time. **Re-measure first in a clean profile** (`npx lighthouse https://papercliped.co --preset=perf --form-factor=mobile` in headless Chromium, three runs, take the median) and record the baseline in the pull request before changing anything.

What the reports show, in order of effect:

1. **The page is empty until JavaScript runs.** The HTML is 2 KB; the largest element is the headline text, and it waits about 1 s for script ("element render delay" 1,007 ms of a 1,129 ms observed LCP; server response is 120 ms). **Prerender the public pages at build time** (home, `/epaperclip`, `/pin`, `/roadmap`, community, docs pages) so the headline, description and install command are in the HTML, then hydrate. Verify the CSP still passes with no inline script or style.
2. **One 820 KB script (223 KB transferred) for every page, 28% unused on home.** There is no code splitting. Split by route with `React.lazy`, and load the docs renderer, search index and the Pin demo only on the pages that use them.
3. **The home page runs the Pin canvas demo.** It causes forced reflows and long tasks of 93 to 181 ms after load. Section 2 already moves it to `/pin`; on `/pin`, start it only when it scrolls into view and never under `prefers-reduced-motion`.
4. **Fonts:** three files, 112 KB. The code font is found late through the stylesheet (it finishes at 1.3 s on desktop). With Geist (section 1) ship two variable files, preload only the text font, keep `font-display: swap`, and subset to Latin.
5. **`theme-boot.js` blocks rendering (about 150 ms on mobile) and, with `brand/pin-orb.svg`, is cached for one hour.** Keep it external and blocking (it prevents a theme flash and the CSP forbids inlining it), but give it and the other files in `web/public/` a content hash or a long `Cache-Control` in `src/web/routes.ts` (line 127 sets `max-age=3600` for everything not under `/assets/`).
6. **New screenshots must not undo this.** Serve AVIF or WebP with a fallback, `width` and `height` set, `loading="lazy"` for everything below the first screen, and `fetchpriority="high"` on the one above it. Keep each under 150 KB.

Smaller items from the same reports:

- **Accessible name mismatch** on the GitHub star link in the header: it shows "Star 13" but its `aria-label` is "Star Papercliped on GitHub, 13 stars". Make the label begin with the visible text.
- **Security headers** (`HEADERS` in `src/web/routes.ts`): the reports flag no `Cross-Origin-Opener-Policy` and an HSTS header without `includeSubDomains`. Add `Cross-Origin-Opener-Policy: same-origin`. Propose `includeSubDomains` to the owner rather than adding it: it affects every subdomain of papercliped.co. Do not add `preload` without the owner's decision.
- **No `/llms.txt`.** Add a short one (what Papercliped and ePaperclip are, links to the docs pages) so AI tools that read the site describe it correctly.
- The home page is about 12,700 px tall on a phone. The shorter structure in section 2 should bring it under 6,000 px.

Add `npm --prefix web run check:perf` (a script that fails when the home page's built JavaScript exceeds 120 KB gzipped) so the bundle cannot grow back unnoticed, and say in the pull request what the three clean-profile mobile runs score after the change.

## Rules

- **CSP stays as it is:** `script-src 'self'; style-src 'self'`, no inline code, no third-party loads, no analytics. Fonts and images are self-hosted.
- **Never weaken a test or check to pass.** Never invent a number, a quote, a community handle or a feature.
- **No AI model names** in code, commits or docs.
- **Accessible and responsive:** 375px to desktop, one `h1` per page, visible focus, 4.5:1 text contrast in every palette, `prefers-reduced-motion` honoured.
- **Git:** work only on this branch. Don't push to `main`; the owner merges and releases.
- Look up library APIs in Context7 when unsure.

## Checks before review

```sh
npm run typecheck && npm test
npm --prefix web test && npm --prefix web run build && npm --prefix web run check:routes
node scripts/version.mjs check
```

Then, in a real browser at 1440 and 375 wide, in one dark and one light palette: home, `/epaperclip`, one docs task page, `/roadmap`, community. No console errors, no CSP violations.

## Finishing

1. Fill in the pull request description using the repository's template: what changed, how you tested, screenshots before and after, what you verified in the engine (file and line), what you did not finish.
2. **Delete this file (`SITE-REFRESH-PROMPT.md`) in the final commit.**
3. Mark the pull request ready for review.
