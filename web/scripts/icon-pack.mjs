// Builds the icon pack in public/brand/icons/ and public/brand/papercliped-icons.zip from the mascot SVGs and the live
// components, so every size matches the site. Run after `npm run build`:  node scripts/icon-pack.mjs
// Browser: CHROME_PATH, or Playwright's own Chromium. Needs `zip` on the PATH for the archive.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { chromium } from "playwright-core";

const root = new URL("..", import.meta.url).pathname;
const out = join(root, "public/brand/icons");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const src = { light: readFileSync(join(root, "public/brand/mascot-light.svg"), "utf8"), dark: readFileSync(join(root, "public/brand/mascot-dark.svg"), "utf8") };
const bg = (svg) => /<rect[^>]*fill="([^"]+)"/.exec(svg)[1];
const inner = (svg) => svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<rect[^>]*\/>/, "");
/** Full-bleed square (for avatars that platforms crop to a circle) with the clip scaled into the middle. The clip's own
 *  centre in the 64×64 drawing is about (29.5, 33), so it's moved to (32, 32). */
const square = (svg, scale) => {
  const dx = 32 - 29.5 * scale, dy = 32 - 33 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${bg(svg)}"/><g transform="translate(${dx} ${dy}) scale(${scale})">${inner(svg)}</g></svg>`;
};

const port = await new Promise((ok) => { const s = createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });
const server = spawn(process.execPath, [join(root, "node_modules/vite/bin/vite.js"), "preview", "--port", String(port), "--strictPort"], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
const base = `http://localhost:${port}`;
for (let i = 0; i < 60; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

const files = [];
const svgToPng = async (svg, size, name) => {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0;background:transparent"><img style="display:block;width:${size}px;height:${size}px" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}"></body></html>`);
  const buf = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  writeFileSync(join(out, name), buf);
  files.push(name);
  return buf;
};
const frame = async (kind, mode, name) => {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, colorScheme: mode });
  await ctx.addInitScript((m) => { localStorage.setItem("pcl.theme", "clip"); localStorage.setItem("pcl.mode", m); }, mode);
  const p = await ctx.newPage();
  await p.goto(`${base}/__render?kind=${kind}`, { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  await p.locator("#frame").screenshot({ path: join(out, name) });
  await ctx.close();
  files.push(name);
};

/** A .ico holding PNG images (supported by every current browser and Windows Vista+). */
const ico = (pngs) => {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, buf }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e); head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(buf.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += buf.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.buf)]);
};

try {
  for (const mode of ["light", "dark"]) {
    // App icon: the rounded tile with transparent corners, at every common size.
    for (const size of [16, 32, 48, 64, 128, 180, 192, 256, 512, 1024]) await svgToPng(src[mode], size, `icon-${mode}-${size}.png`);
    writeFileSync(join(out, `icon-${mode}.svg`), src[mode]); files.push(`icon-${mode}.svg`);
    // Avatars (Discord, X, GitHub, npm, directories): full-bleed square, clip centred so a circle crop keeps it whole.
    writeFileSync(join(out, `avatar-${mode}.svg`), square(src[mode], 0.98)); files.push(`avatar-${mode}.svg`);
    await svgToPng(square(src[mode], 0.98), 512, `avatar-${mode}-512.png`);
    await svgToPng(square(src[mode], 0.98), 1024, `avatar-${mode}-1024.png`);
    // Maskable (Android and installed web apps): the clip inside the 80% safe zone.
    await svgToPng(square(src[mode], 0.82), 512, `maskable-${mode}-512.png`);
    await frame("x-header", mode, `x-header-${mode}-1500x500.png`);
    await frame("banner", mode, `banner-${mode}-960x540.png`);
    await frame("og", mode, `social-${mode}-1200x630.png`);
  }
  const pngs = [];
  for (const size of [16, 32, 48]) pngs.push({ size, buf: readFileSync(join(out, `icon-light-${size}.png`)) });
  writeFileSync(join(out, "favicon.ico"), ico(pngs)); files.push("favicon.ico");
  writeFileSync(join(out, "README.txt"), [
    "Papercliped icon pack",
    "",
    "icon-*      App icon (rounded tile, transparent corners): favicons, app launchers, directory listings. SVG + PNG 16 to 1024.",
    "avatar-*    Square, full bleed: profile pictures on Discord, X, GitHub, npm and MCP directories (safe for circle crops).",
    "maskable-*  Android / installed web app icon with the safe-zone padding.",
    "favicon.ico 16, 32 and 48 px in one file.",
    "x-header-*  X (Twitter) header, 1500x500.",
    "banner-*    16:9 banner, 960x540: Discord server banner, YouTube, directory screenshots.",
    "social-*    Link preview / Open Graph image, 1200x630 (also GitHub's social preview).",
    "",
    "Light is the default. Use dark on dark backgrounds. Don't recolour, stretch or redraw the mascot.",
    "Brand guidelines: https://papercliped.co/brand",
    "",
  ].join("\n")); files.push("README.txt");
  rmSync(join(root, "public/brand/papercliped-icons.zip"), { force: true });
  execFileSync("zip", ["-q", "-X", join(root, "public/brand/papercliped-icons.zip"), ...files.sort()], { cwd: out });
  console.log(`wrote ${files.length} files to public/brand/icons and public/brand/papercliped-icons.zip`);
} finally {
  await browser.close();
  server.kill();
}
process.exit(0);
