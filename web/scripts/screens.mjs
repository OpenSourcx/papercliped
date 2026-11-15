// Retake the console screenshots used on the site, from the real console running on its built-in demo data.
//
//   1. In OpenSourcx/papercliped-engine:   cd apps/console && npx vite --port 5173      (demo mode: no host service needed)
//   2. Here:                               npm --prefix web run screens [-- --console http://127.0.0.1:5173]
//
// Writes web/public/screens/<name>-<dark|light>.avif and .webp at 1440x900 (explicit width and height go in the markup), skipping nothing:
// every run replaces every file, so a release's UI changes show up in one commit. The console picks its theme from the browser's colour
// scheme, which is how the site's dark and light modes are matched. Nothing here touches a real host: the demo has no credentials.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "screens");
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg("console", "http://127.0.0.1:5173").replace(/\/$/, "");
export const W = 1440, H = 900;

/** One entry per picture on the site. `path` is relative to the console; the demo device is called "pve". */
export const SHOTS = [
  { name: "overview", path: "/pve/home", settle: 1500 },
  { name: "machines", path: "/pve/machines", settle: 1200 },
  { name: "backups", path: "/pve/backups", settle: 1200 },
  { name: "storage", path: "/pve/storage", settle: 1200 },
  { name: "organization", path: "/pve/northwind-labs", settle: 1800 },
  { name: "pin", path: "/pve/pin", settle: 1500 },
];
const SETUP = { ownerName: "Alex", deviceName: "pve", pinMode: "assistant", aiProvider: null, pinAccess: { system: true, orgs: true, connectors: true, docs: true }, completedAt: "2026-11-01T00:00:00Z" };

mkdirSync(OUT, { recursive: true });
const launch = () => chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const browser = await launch();
let failed = 0;
for (const scheme of ["dark", "light"]) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: scheme, reducedMotion: "reduce" });
  await ctx.addInitScript(([s, t]) => { localStorage.setItem("epc.setup", JSON.stringify(s)); localStorage.setItem("epc.theme", JSON.stringify(t)); }, [SETUP, { mode: "system" }]); // "system": Daylight when the browser is light, the dark theme otherwise
  for (const shot of SHOTS) {
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await page.goto(BASE + shot.path, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(shot.settle);
      const png = await page.screenshot({ type: "png" });
      const base = join(OUT, `${shot.name}-${scheme}`);
      await sharp(png).webp({ quality: 78, effort: 5 }).toFile(`${base}.webp`);
      await sharp(png).avif({ quality: 55, effort: 5 }).toFile(`${base}.avif`);
      if (errors.length) console.warn(`${shot.name}-${scheme}: page errors: ${errors.join("; ").slice(0, 200)}`);
      console.log(`${shot.name}-${scheme}`);
    } catch (e) { failed++; console.error(`${shot.name}-${scheme}: ${e.message}`); }
    await page.close();
  }
  await ctx.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
