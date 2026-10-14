// Builds the community cards in public/brand/community/ (Reddit, X and Discord posts), light and dark, 1600x900, and the
// r/OpenSourcedd banners (desktop and app), and the OpenSourcedd icon set, Discord banner and X header (public/brand/opensourcedd/),
// with the same mascot, palette and fonts as the site:  node scripts/community-cards.mjs
// Browser: CHROME_PATH, or Playwright's own Chromium.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const root = new URL("..", import.meta.url).pathname;
const out = join(root, "public/brand/community");
mkdirSync(out, { recursive: true });

const font = (f) => `data:font/woff2;base64,${readFileSync(join(root, "public/fonts", f)).toString("base64")}`;
// The "clip" palette from src/theme/palettes.ts.
const PALETTE = {
  dark: { bg: "#16150f", surface: "#201f17", ink: "#f4f1d6", muted: "#bdb99f", line: "#35332a", accent: "#e9e4b0", accentInk: "#16150f" },
  light: { bg: "#fffddc", surface: "#fffff0", ink: "#0b0a07", muted: "#57564a", line: "#e7e3bb", accent: "#47463c", accentInk: "#fffddc" },
};
// The mascot from public/brand/mascot-*.svg, coloured from the palette.
const MASCOT = `<svg viewBox="0 0 64 64"><path d="M22 38V19a10 10 0 0 1 20 0v24a14 14 0 0 1-28 0V24" fill="none" stroke="var(--accent)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="26.5" cy="44.5" r="4" fill="var(--surface)"/><circle cx="37.5" cy="44.5" r="4" fill="var(--surface)"/><circle cx="27.3" cy="45.2" r="2" fill="var(--ink)"/><circle cx="38.3" cy="45.2" r="2" fill="var(--ink)"/><path d="M28.5 52q3.5 3 7 0" fill="none" stroke="var(--surface)" stroke-width="2" stroke-linecap="round"/><circle cx="21.5" cy="50" r="2.2" fill="#e98a7a" opacity=".85"/><circle cx="42.5" cy="50" r="2.2" fill="#e98a7a" opacity=".85"/></svg>`;

const CARDS = {
  "opensourcedd-welcome": {
    badge: "👋",
    kicker: "r/OpenSourcedd",
    title: "Welcome to<br><span>OpenSourcedd</span>",
    text: "Open-source tools for AI agents, built together.<br><b>Starting with Papercliped.</b>",
    chips: ["💡 Suggest ideas", "🛠️ Share projects", "👀 Review work", "🤝 Help others"],
    foot: ["papercliped.co", "github.com/OpenSourcx"],
  },
  "papercliped-launch": {
    badge: "🚀",
    kicker: "Papercliped is live · free and open source",
    title: "Run your Paperclip<br>from <span>any AI app</span>",
    text: "Check on agents, assign work, decide approvals and get reports in plain language.",
    chips: ["Claude", "ChatGPT", "Codex", "Any MCP app"],
    code: "Connector: https://mcp.papercliped.co/mcp",
    foot: ["papercliped.co", "r/OpenSourcedd"],
  },
};

const page = (c, mode) => {
  const p = PALETTE[mode];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Brico;src:url(${font("bricolage-grotesque-latin-wght-normal.woff2")});font-weight:200 800}
@font-face{font-family:Inter;src:url(${font("inter-latin-wght-normal.woff2")});font-weight:100 900}
@font-face{font-family:Mono;src:url(${font("jetbrains-mono-latin-400-normal.woff2")})}
:root{${Object.entries(p).map(([k, v]) => `--${k}:${v}`).join(";")}}
html,body{margin:0}
#frame{width:1600px;height:900px;background:var(--bg);color:var(--ink);font-family:Inter;position:relative;overflow:hidden;display:flex;align-items:center;box-sizing:border-box;padding:0 110px;gap:80px}
.dots{position:absolute;inset:0;background-image:radial-gradient(var(--line) 1.6px,transparent 1.6px);background-size:36px 36px;opacity:.7;mask-image:radial-gradient(ellipse at 85% 15%,#000 0,transparent 55%)}
.mascot{width:340px;height:340px;flex:none;border-radius:84px;background:var(--surface);border:3px solid var(--line);display:grid;place-items:center;position:relative;transform:rotate(-4deg)}
.mascot svg{width:300px;height:300px}
.badge{position:absolute;top:-30px;right:-34px;font-size:84px;transform:rotate(14deg)}
.text{position:relative;flex:1}
.kicker{font-family:Mono;font-size:28px;color:var(--muted);margin-bottom:22px}
h1{font-family:Brico;font-weight:800;font-size:100px;line-height:.98;letter-spacing:-.025em;margin:0 0 30px}
h1 span{display:inline-block;background:var(--accent);color:var(--accentInk);padding:0 22px 8px;border-radius:24px;margin-top:10px}
p{font-size:34px;line-height:1.35;color:var(--muted);margin:0 0 36px;max-width:920px}
p b{color:var(--ink);font-weight:600}
.chips{display:flex;gap:12px;align-items:center}
.chip{white-space:nowrap;font-size:23px;font-weight:600;padding:11px 18px;border-radius:999px;border:2px solid var(--line);background:var(--surface)}
.code{display:inline-block;font-family:Mono;font-size:26px;padding:12px 20px;border-radius:14px;background:var(--accent);color:var(--accentInk);margin-top:18px}
.foot{position:absolute;bottom:44px;left:120px;right:120px;display:flex;justify-content:space-between;font-family:Mono;font-size:22px;color:var(--muted)}
</style></head><body><div id="frame"><div class="dots"></div>
<div class="mascot"><div class="badge">${c.badge}</div>${MASCOT}</div>
<div class="text"><div class="kicker">${c.kicker}</div><h1>${c.title}</h1><p>${c.text}</p>
<div class="chips">${c.chips.map((x) => `<div class="chip">${x}</div>`).join("")}</div>${c.code ? `<div class="code">${c.code}</div>` : ""}</div>
<div class="foot"><span>${c.foot[0]}</span><span>${c.foot[1]}</span></div></div></body></html>`;
};

// Reddit community banners at twice Reddit's sizes: desktop 1072x128 -> 2144x256, app 1080x128 -> 2160x256. The app zooms
// into the middle ~40% of its banner and puts its back/search/share buttons on top, so the app version has no text: only the
// pattern and a small mark in the middle, the clear spot between the back button and the search icon.
const BANNERS = [
  { name: "opensourcedd-reddit-banner", w: 2144, h: 256, app: false },
  { name: "opensourcedd-reddit-banner-mobile", w: 2160, h: 256, app: true },
];
const banner = (mode, b) => {
  const p = PALETTE[mode];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Brico;src:url(${font("bricolage-grotesque-latin-wght-normal.woff2")});font-weight:200 800}
@font-face{font-family:Inter;src:url(${font("inter-latin-wght-normal.woff2")});font-weight:100 900}
:root{${Object.entries(p).map(([k, v]) => `--${k}:${v}`).join(";")}}
html,body{margin:0}
#frame{width:${b.w}px;height:${b.h}px;background:var(--bg);color:var(--ink);font-family:Inter;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;gap:36px}
.dots{position:absolute;inset:0;background-image:radial-gradient(var(--line) 2px,transparent 2px);background-size:28px 28px;${b.app ? "" : "mask-image:linear-gradient(90deg,#000 0,transparent 32%,transparent 68%,#000 100%)"}}
.mascot{position:relative;width:${b.app ? 150 : 164}px;height:${b.app ? 150 : 164}px;flex:none;border-radius:${b.app ? 40 : 44}px;background:var(--surface);border:3px solid var(--line);display:grid;place-items:center;transform:rotate(-4deg)}
.mascot svg{width:${b.app ? 132 : 142}px;height:${b.app ? 132 : 142}px}
.text{position:relative}
h1{font-family:Brico;font-weight:800;font-size:96px;line-height:1;letter-spacing:-.025em;margin:0;white-space:nowrap}
h1 span{background:var(--accent);color:var(--accentInk);padding:0 16px 6px;border-radius:20px;margin-left:4px}
p{font-size:30px;color:var(--muted);margin:22px 0 0;white-space:nowrap}
p b{color:var(--ink);font-weight:600}
</style></head><body><div id="frame"><div class="dots"></div>
${b.app ? `<div class="mascot"><svg viewBox="0 0 64 64">${osMark(OS_COLOURS[mode])}</svg></div>` : `<div class="mascot">${MASCOT}</div>
<div class="text"><h1>Open<span>Sourcedd</span></h1><p>Open-source tools for AI agents, built together. <b>Home of Papercliped.</b></p></div>`}</div></body></html>`;
};

// The OpenSourcedd mark: an open ring (open source) with the Papercliped face, and a dot leaving the gap (sharing).
const OS_COLOURS = { dark: { bg: "#16150f", ink: "#e9e4b0" }, light: { bg: "#fffddc", ink: "#47463c" } };
const osMark = (c) => `<path d="M47.97 26.19A17 17 0 1 1 34.95 15.26" fill="none" stroke="${c.ink}" stroke-width="7" stroke-linecap="round"/><circle cx="50" cy="13" r="3.6" fill="${c.ink}"/><circle cx="27" cy="33" r="2.4" fill="${c.ink}"/><circle cx="37" cy="33" r="2.4" fill="${c.ink}"/><path d="M28.5 38.6q3.5 3 7 0" fill="none" stroke="${c.ink}" stroke-width="2" stroke-linecap="round"/><circle cx="22.8" cy="37.6" r="2.1" fill="#e98a7a" opacity=".85"/><circle cx="41.2" cy="37.6" r="2.1" fill="#e98a7a" opacity=".85"/>`;
/** Rounded tile (app icon) or full-bleed square scaled into the circle-crop safe zone (profile pictures). */
const osIcon = (mode, avatar) => {
  const c = OS_COLOURS[mode];
  const body = avatar ? `<rect width="64" height="64" fill="${c.bg}"/><g transform="translate(32 32) scale(.9) translate(-32.5 -31)">${osMark(c)}</g>` : `<rect width="64" height="64" rx="16" fill="${c.bg}"/>${osMark(c)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`;
};
const osOut = join(root, "public/brand/opensourcedd");
/** Discord server banner and invite background, 1920x1080 (twice Discord's 960x540). Discord shows the banner small above the
 *  channel list, so it carries only the mark and the name, big. */
const discordBanner = (mode) => {
  const p = PALETTE[mode];
  const c = OS_COLOURS[mode];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Brico;src:url(${font("bricolage-grotesque-latin-wght-normal.woff2")});font-weight:200 800}
@font-face{font-family:Mono;src:url(${font("jetbrains-mono-latin-400-normal.woff2")})}
:root{${Object.entries(p).map(([k, v]) => `--${k}:${v}`).join(";")}}
html,body{margin:0}
#frame{width:1920px;height:1080px;background:var(--bg);color:var(--ink);position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:56px}
.dots{position:absolute;inset:0;background-image:radial-gradient(var(--line) 3px,transparent 3px);background-size:48px 48px;mask-image:radial-gradient(ellipse at center,transparent 35%,#000 80%)}
.mark{position:relative;width:340px;height:340px;border-radius:84px;background:var(--surface);border:5px solid var(--line);display:grid;place-items:center;transform:rotate(-4deg)}
.mark svg{width:306px;height:306px}
h1{position:relative;font-family:Brico;font-weight:800;font-size:176px;line-height:1;letter-spacing:-.025em;margin:0}
h1 span{background:var(--accent);color:var(--accentInk);padding:0 28px 10px;border-radius:36px;margin-left:6px}
.sub{position:relative;font-family:Mono;font-size:44px;color:var(--muted)}
</style></head><body><div id="frame"><div class="dots"></div>
<div class="mark"><svg viewBox="0 0 64 64">${osMark(c)}</svg></div>
<h1>Open<span>Sourcedd</span></h1><div class="sub">open-source tools for AI agents, built together</div></div></body></html>`;
};
mkdirSync(osOut, { recursive: true });

/** X header, 1500x500. X covers the bottom-left with the profile picture and crops the top and bottom a little on some
 *  screens, so the mark and name sit right of centre and away from the edges. */
const xHeader = (mode) => {
  const p = PALETTE[mode];
  const c = OS_COLOURS[mode];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Brico;src:url(${font("bricolage-grotesque-latin-wght-normal.woff2")});font-weight:200 800}
@font-face{font-family:Mono;src:url(${font("jetbrains-mono-latin-400-normal.woff2")})}
:root{${Object.entries(p).map(([k, v]) => `--${k}:${v}`).join(";")}}
html,body{margin:0}
#frame{width:1500px;height:500px;background:var(--bg);color:var(--ink);position:relative;overflow:hidden}
.dots{position:absolute;inset:0;background-image:radial-gradient(var(--line) 2.5px,transparent 2.5px);background-size:36px 36px;mask-image:linear-gradient(90deg,#000 0,transparent 45%)}
.row{position:absolute;right:120px;top:50%;transform:translateY(-55%);display:flex;align-items:center;gap:40px}
.mark{width:200px;height:200px;flex:none;border-radius:50px;background:var(--surface);border:3px solid var(--line);display:grid;place-items:center;transform:rotate(-4deg)}
.mark svg{width:180px;height:180px}
h1{font-family:Brico;font-weight:800;font-size:112px;line-height:1;letter-spacing:-.025em;margin:0;white-space:nowrap}
h1 span{background:var(--accent);color:var(--accentInk);padding:0 18px 8px;border-radius:24px;margin-left:4px}
.sub{font-family:Mono;font-size:26px;color:var(--muted);margin-top:22px}
</style></head><body><div id="frame"><div class="dots"></div><div class="row">
<div class="mark"><svg viewBox="0 0 64 64">${osMark(c)}</svg></div>
<div><h1>Open<span>Sourcedd</span></h1><div class="sub">open-source tools for AI agents, built together</div></div></div></div></body></html>`;
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
for (const [name, card] of Object.entries(CARDS)) {
  for (const mode of ["dark", "light"]) {
    const p = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await p.setContent(page(card, mode));
    await p.evaluate(() => document.fonts.ready);
    await p.locator("#frame").screenshot({ path: join(out, `${name}-${mode}.png`) });
    await p.close();
  }
}
for (const b of BANNERS) {
  for (const mode of ["dark", "light"]) {
    const p = await browser.newPage({ viewport: { width: b.w, height: b.h } });
    await p.setContent(banner(mode, b));
    await p.evaluate(() => document.fonts.ready);
    await p.locator("#frame").screenshot({ path: join(out, `${b.name}-${mode}.png`) });
    await p.close();
  }
}
for (const mode of ["dark", "light"]) {
  for (const avatar of [false, true]) {
    const svg = osIcon(mode, avatar);
    const kind = avatar ? "avatar" : "icon";
    writeFileSync(join(osOut, `opensourcedd-${kind}-${mode}.svg`), svg);
    for (const size of avatar ? [256, 512, 1024] : [512, 1024]) {
      const p = await browser.newPage({ viewport: { width: size, height: size } });
      await p.setContent(`<html><body style="margin:0;background:transparent"><img style="display:block;width:${size}px;height:${size}px" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}"></body></html>`);
      await p.screenshot({ path: join(osOut, `opensourcedd-${kind}-${mode}-${size}.png`), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
      await p.close();
    }
  }
}
for (const mode of ["dark", "light"]) {
  const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.setContent(discordBanner(mode));
  await p.evaluate(() => document.fonts.ready);
  await p.locator("#frame").screenshot({ path: join(osOut, `opensourcedd-discord-banner-${mode}.png`) });
  await p.close();
}
for (const mode of ["dark", "light"]) {
  const p = await browser.newPage({ viewport: { width: 1500, height: 500 } });
  await p.setContent(xHeader(mode));
  await p.evaluate(() => document.fonts.ready);
  await p.locator("#frame").screenshot({ path: join(osOut, `opensourcedd-x-header-${mode}.png`) });
  await p.close();
}
await browser.close();
console.log(`wrote ${Object.keys(CARDS).length * 2} cards and ${BANNERS.length * 2} banners to public/brand/community, and the OpenSourcedd icons to public/brand/opensourcedd`);
