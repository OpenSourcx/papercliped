# Fonts

Self-hosted so the site makes no third-party requests. Latin subset only. All are licensed under the SIL Open Font License 1.1 (licence texts in this folder).

| File | Family | Used for | Source |
| --- | --- | --- | --- |
| `mona-sans-latin-wght-normal.woff2` | Mona Sans (variable, weight 200-900) | headings and text on the website | `@fontsource-variable/mona-sans` |
| `geist-mono-latin-wght-normal.woff2` | Geist Mono (variable, weight 100-900) | code and keys | `@fontsource-variable/geist-mono` |
| `inter-latin-wght-normal.woff2` | Inter (variable, weight 100-900) | only the server-rendered sign-in and consent pages (`src/oauth/pages.ts`), which match the account portals | `@fontsource-variable/inter` |

To update: bump the `@fontsource*` dev dependencies in `web/package.json`, `npm install`, and copy the same files (and `LICENSE`) from `node_modules/<package>/files/` into `web/public/fonts/` (stable names, so the bridge's server-rendered pages can use them too).
