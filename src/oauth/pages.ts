import { USERNAME_MAX, USERNAME_MIN } from "../accounts/username.js";
import { FAVICON_LINK } from "../site/favicon.js";
import { grantableScopes, type Scope } from "./scopes.js";

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Papercliped sign-in pages. The look follows Paperclip's own sign-in screen (warm cream page, left-aligned form, olive
 * accents, no card chrome) so connecting feels native; colours were sampled from it and the enabled button is darkened so text
 * meets WCAG AA (contrast is asserted in the tests). One self-contained document per page: no external fonts, scripts or images.
 */
/**
 * The website's type and colours, for the server-rendered pages. Fonts load from /fonts/ when the website is deployed with the
 * bridge (web/dist); otherwise the system fallbacks are used.
 */
export const FONTS_CSS = `@font-face{font-family:"Inter Variable";font-style:normal;font-display:swap;font-weight:100 900;src:url(/fonts/inter-latin-wght-normal.woff2) format("woff2-variations")}
@font-face{font-family:"Bricolage Grotesque Variable";font-style:normal;font-display:swap;font-weight:200 800;src:url(/fonts/bricolage-grotesque-latin-wght-normal.woff2) format("woff2-variations")}
@font-face{font-family:"JetBrains Mono";font-style:normal;font-display:swap;font-weight:400;src:url(/fonts/jetbrains-mono-latin-400-normal.woff2) format("woff2")}`;
export const SANS = `"Inter Variable",Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif`;
export const DISPLAY = `"Bricolage Grotesque Variable","Inter Variable",ui-sans-serif,system-ui,sans-serif`;
export const MONO = `"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace`;
/** The default "clip" theme in dark mode (same values as web/src/theme/palettes.ts). */
export const THEME_DARK = { bg: "#16150f", ink: "#f4f1d6", ink2: "#e9e4b0", muted: "#bdb99f", line: "#5c5a49", btn: "#e9e4b0", btnText: "#16150f", disabled: "#7d7a64" };

export const THEME = { bg: "#fffddc", ink: "#0b0a07", ink2: "#47463c", muted: "#6b6959", line: "#b0a993", btn: "#47463c", btnText: "#fffddc", disabled: "#8c8a77", errBg: "#fde8e3", errInk: "#8a1f11", warnBg: "#fff1c2" };

const CSS = `${FONTS_CSS}
:root{--bg:${THEME.bg};--ink:${THEME.ink};--ink2:${THEME.ink2};--muted:${THEME.muted};--line:${THEME.line};--btn:${THEME.btn};--btntext:${THEME.btnText};--off:${THEME.disabled};color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:${THEME_DARK.bg};--ink:${THEME_DARK.ink};--ink2:${THEME_DARK.ink2};--muted:${THEME_DARK.muted};--line:${THEME_DARK.line};--btn:${THEME_DARK.btn};--btntext:${THEME_DARK.btnText};--off:${THEME_DARK.disabled};color-scheme:dark}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;background:var(--bg);color:var(--ink);font:15px/1.55 ${SANS};position:relative;overflow-x:hidden}
body::before{content:"";position:fixed;right:5vw;top:5vh;width:min(26vw,300px);height:min(48vh,420px);pointer-events:none;opacity:.55;
background-image:radial-gradient(var(--line) 1.1px,transparent 1.3px);background-size:13px 13px;-webkit-mask-image:linear-gradient(135deg,#000 0%,transparent 75%);mask-image:linear-gradient(135deg,#000 0%,transparent 75%)}
@media (max-width:900px){body::before{display:none}}
main{position:relative;width:min(400px,100% - 40px);margin:9vh 0 6vh max(20px,min(14vw,240px))}
@media (max-width:900px){main{margin:6vh auto}}
.brand{display:flex;align-items:center;gap:8px;font-family:${DISPLAY};font-weight:700;font-size:19px;text-transform:lowercase;margin-bottom:34px}.brand svg{width:20px;height:20px}
h1{font-family:${DISPLAY};font-size:24px;line-height:1.2;font-weight:700;letter-spacing:-.01em;margin:0 0 6px}
p.lede{margin:0 0 20px;color:var(--muted)}
label.f{display:block;font-size:12px;color:var(--muted);margin:14px 0 5px}
input[type=text],input[type=password]{width:100%;height:42px;padding:0 12px;border:1px solid var(--line);border-radius:8px;background:transparent;color:var(--ink);font:inherit}
input:focus-visible,button:focus-visible,a:focus-visible,summary:focus-visible{outline:2px solid var(--ink2);outline-offset:2px}
.btn{display:block;width:100%;height:42px;margin-top:18px;border:1px solid var(--btn);border-radius:8px;background:var(--btn);color:var(--btntext);font:inherit;font-weight:600;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease}.btn:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(0,0,0,.12)}.btn:active{transform:translateY(0) scale(.98)}@media (prefers-reduced-motion:reduce){.btn{transition:none}.btn:hover{transform:none}}
.btn:hover{filter:brightness(1.15)}.btn:disabled{background:var(--off);border-color:var(--off);cursor:not-allowed;filter:none}
.btn.ghost{background:transparent;color:var(--ink);border-color:var(--line)}.btn.ghost:hover{background:rgba(71,70,60,.07);filter:none}
.row{display:flex;gap:10px}.row .btn{margin-top:18px}
.or{display:flex;align-items:center;gap:12px;color:var(--muted);font-size:12px;margin:22px 0 4px}.or::before,.or::after{content:"";flex:1;height:1px;background:var(--line)}
.note{background:var(--warnBg,#fff1c2);border:1px solid #e5cf7a;border-radius:8px;padding:10px 12px;margin:14px 0;font-size:14px}
.err{background:#fde8e3;border:1px solid #e9a99c;color:#8a1f11;border-radius:8px;padding:10px 12px;margin:14px 0;font-size:14px}
.opt{display:block;border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:8px 0;cursor:pointer}.opt:has(input:checked){border-color:var(--ink2);box-shadow:0 0 0 1px var(--ink2)}
.opt strong{font-weight:600}.opt small{display:block;color:var(--muted);margin-top:2px;font-size:13px}
small.hint{display:block;color:var(--muted);font-size:12.5px;margin-top:6px}
code,.mono{font-family:${MONO}}
.secret{display:block;margin:14px 0 8px;padding:14px 12px;border:1px dashed var(--ink2);border-radius:8px;font-size:13px;letter-spacing:0;overflow-wrap:normal;background:rgba(255,255,255,.35);user-select:all}
a{color:var(--ink)}
.fine{color:var(--muted);font-size:12.5px;margin-top:22px}
.chk{display:flex;gap:10px;align-items:flex-start;margin:14px 0 0;font-size:14px}.chk input{margin-top:4px}
ul.rules{margin:8px 0 0;padding-left:18px;color:var(--muted);font-size:13px}
`;

const CLIP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;

function shell(title: string, body: string, nonce?: string, script?: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${esc(title)} · Papercliped</title>${FAVICON_LINK}<style>${CSS}</style></head><body><main><div class="brand">${CLIP}<span>Papercliped</span></div>${body}</main>${script ? `<script nonce="${nonce}">${script}</script>` : ""}</body></html>`;
}

const hidden = (rid: string, csrf: string) => `<input type="hidden" name="rid" value="${esc(rid)}"><input type="hidden" name="csrf" value="${esc(csrf)}">`;
const errBox = (e?: string) => (e ? `<div class="err" role="alert">${esc(e)}</div>` : "");
const cancel = `<button class="btn ghost" name="action" value="deny" formnovalidate>Cancel</button>`;

export interface Ctx {
  rid: string;
  csrf: string;
  clientName: string;
  redirectHost: string;
  error?: string;
}

// ───────────── account flow ─────────────

export function choosePage(v: Ctx & { username?: string }): string {
  return shell(
    "Sign in",
    `<h1>Sign in to Papercliped</h1>
     <p class="lede"><strong>${esc(v.clientName)}</strong> wants to use your Paperclip. Log in with your username and secret key, or connect your Paperclip.</p>
     ${errBox(v.error)}
     <form method="post" action="/authorize/login">${hidden(v.rid, v.csrf)}
       <label class="f" for="u">Username</label><input id="u" name="username" type="text" autocomplete="username" autocapitalize="off" spellcheck="false" required value="${esc(v.username ?? "")}">
       <label class="f" for="k">Secret key</label><input id="k" name="secret" type="password" autocomplete="current-password" spellcheck="false" placeholder="pcs_XXXX-XXXX-…" required>
       <button class="btn" type="submit">Log in</button>
     </form>
     <div class="or">or</div>
     <form method="post" action="/authorize/connect">${hidden(v.rid, v.csrf)}
       <button class="btn ghost" name="action" value="continue">Connect your Paperclip</button>
       <small class="hint">New here, or lost your secret key? Connect your Paperclip. We'll sign you in, or create your username.</small>
       <button class="btn ghost" name="action" value="deny" formnovalidate style="margin-top:14px">Cancel</button>
     </form>
     <p class="fine">You'll return to <code>${esc(v.redirectHost)}</code> afterwards.</p>`,
  );
}

export function instancePage(v: Ctx & { value?: string; notice?: string; installPlugin?: boolean }): string {
  return shell(
    "Connect your Paperclip",
    `<h1>Connect your Paperclip</h1>
     <p class="lede">Enter the address of your Paperclip. It must be reachable on the public internet over <code>https://</code>; instances on <code>localhost</code> or a private network can't be used (use the local plugin instead).</p>
     ${v.notice ? `<div class="note">${esc(v.notice)}</div>` : ""}${errBox(v.error)}
     <form method="post" action="/authorize/instance">${hidden(v.rid, v.csrf)}
       <label class="f" for="inst">Paperclip address</label>
       <input id="inst" name="instance" type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://paperclip.example.com" value="${esc(v.value ?? "")}" required>
       <small class="hint">The bridge contacts this address to sign you in and to run what you allow. Only enter an address you own.</small>
       <label class="f" style="display:flex;gap:10px;align-items:flex-start;margin-top:16px;font-weight:400">
         <input id="plug" name="install_plugin" type="checkbox" value="on" style="width:auto;margin-top:3px"${v.installPlugin === false ? "" : " checked"}>
         <span>Also install the Papercliped plugin in my Paperclip<br><small class="hint">Adds a Papercliped page to Paperclip for managing connected apps. It is installed through Paperclip's own installer, only if you are its instance admin, and you can remove it any time from Settings &rarr; Plugins.</small></span>
       </label>
       <div class="row"><button class="btn" name="action" value="continue">Continue</button>${cancel}</div>
     </form>
     <p class="fine">You'll return to <code>${esc(v.redirectHost)}</code> afterwards.</p>`,
  );
}

export function approvePage(v: Ctx & { approvalUrl: string; instanceHost: string; approved: boolean; nonce: string }): string {
  const poll = v.approved
    ? undefined
    : `const s=document.getElementById('st');let n=0;const t=setInterval(async()=>{if(++n>200)return clearInterval(t);try{const r=await fetch('/authorize/status?rid=${encodeURIComponent(v.rid)}');const j=await r.json();if(j.approved){s.textContent='Approved in Paperclip. Press Continue.';clearInterval(t)}}catch(e){}},2000)`;
  return shell(
    "Approve in Paperclip",
    `<h1>Approve in your Paperclip</h1>
     <p class="lede">Open <strong>${esc(v.instanceHost)}</strong>, sign in if asked, and approve the request. Then come back and press Continue.</p>
     ${errBox(v.error)}
     <a class="btn" style="text-align:center;line-height:40px;text-decoration:none" href="${esc(v.approvalUrl)}" target="_blank" rel="noopener noreferrer">Open Paperclip to approve</a>
     <p id="st" class="hint" style="margin-top:12px;color:var(--muted)">${v.approved ? "Approved in Paperclip. Press Continue." : "Waiting for your approval…"}</p>
     <form method="post" action="/authorize/approved">${hidden(v.rid, v.csrf)}
       <div class="row"><button class="btn" name="action" value="continue">Continue</button>${cancel}</div>
     </form>`,
    v.nonce,
    poll,
  );
}

const ANON_TEXT = "Appear anonymously in the operator's logs and dashboard (as a name like Ann02), and hide my Paperclip's address there.";
export function usernamePage(v: Ctx & { value?: string; anonymous?: boolean }): string {
  return shell(
    "Choose a username",
    `<h1>Choose your username</h1>
     <p class="lede">Your Paperclip is connected. Pick a username so you can log in later without approving again.</p>
     ${errBox(v.error)}
     <form method="post" action="/authorize/username">${hidden(v.rid, v.csrf)}
       <label class="f" for="un">Username</label>
       <input id="un" name="username" type="text" autocomplete="username" autocapitalize="off" spellcheck="false" minlength="${USERNAME_MIN}" maxlength="${USERNAME_MAX}" required value="${esc(v.value ?? "")}">
       <ul class="rules"><li>At least ${USERNAME_MIN} characters (up to ${USERNAME_MAX})</li><li>Include a number or one of these symbols: <code>. # _</code></li><li>Letters, numbers and <code>. # _</code> only; start with a letter or number</li></ul>
       <label class="chk"><input type="checkbox" name="anonymous"${v.anonymous ? " checked" : ""}><span>${esc(ANON_TEXT)}</span></label>
       <small class="hint">Your username is only ever used to log you in. You can change this choice later.</small>
       <div class="row"><button class="btn" name="action" value="continue">Create username</button>${cancel}</div>
     </form>`,
  );
}

export function secretPage(v: Ctx & { username: string; secret: string; rotated: boolean; nonce: string }): string {
  const script = `const c=document.getElementById('copy'),k=document.getElementById('sec'),a=document.getElementById('ack'),g=document.getElementById('go');g.disabled=true;a.addEventListener('change',()=>{g.disabled=!a.checked});c.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(k.textContent.trim());c.textContent='Copied'}catch(e){const r=document.createRange();r.selectNodeContents(k);const s=getSelection();s.removeAllRanges();s.addRange(r);c.textContent='Press Ctrl/Cmd+C'}})`;
  return shell(
    "Your secret key",
    `<h1>${v.rotated ? "Your new secret key" : `Welcome, ${esc(v.username)}`}</h1>
     <p class="lede">${v.rotated ? "Your old secret key no longer works." : "Your username is created."} Save this secret key now. It's the only time we'll show it.</p>
     <code class="secret mono" id="sec">${esc(v.secret).replace(/-/g, "-<wbr>")}</code>
     <button class="btn ghost" type="button" id="copy" style="margin-top:0">Copy secret key</button>
     <small class="hint">Anyone with your username and this key can use your Paperclip through Papercliped. Store it in a password manager. If you lose it, connect your Paperclip again to get a new one.</small>
     <form method="post" action="/authorize/continue">${hidden(v.rid, v.csrf)}
       <label class="chk"><input type="checkbox" id="ack"><span>I've saved my secret key somewhere safe</span></label>
       <button class="btn" id="go" name="action" value="continue">Continue</button>
     </form>`,
    v.nonce,
    script,
  );
}

export function welcomePage(v: Ctx & { username: string }): string {
  return shell(
    "Welcome back",
    `<h1>Welcome back, ${esc(v.username)}</h1>
     <p class="lede">Your Paperclip is reconnected and your username is unchanged.</p>
     ${errBox(v.error)}
     <form method="post" action="/authorize/welcome">${hidden(v.rid, v.csrf)}
       <button class="btn" name="action" value="continue">Continue</button>
       <button class="btn ghost" name="action" value="rotate">Lost your secret key? Make a new one</button>
       ${cancel}
     </form>`,
  );
}

const LEVELS: { scope: Scope; label: string; blurb: string }[] = [
  { scope: "paperclip:read", label: "Read only", blurb: "View agents, tasks, goals, costs and reports. Cannot change anything." },
  { scope: "paperclip:control", label: "Full control", blurb: "Everything: pause, resume, wake or terminate agents, assign and update issues and goals, comment, decide approvals, set budgets and send any API request." },
];

/** Final step of the account flow: pick how much the app may do. */
export function scopePage(v: Ctx & { requestedMax: Scope; loopbackOnly: boolean; instanceHost: string; username: string; anonymous?: boolean; alias?: string | null }): string {
  const allowed = new Set(grantableScopes(v.requestedMax));
  const def: Scope = v.requestedMax;
  const opts = LEVELS.filter((l) => allowed.has(l.scope))
    .map((l) => `<label class="opt"><input type="radio" name="level" value="${l.scope}"${l.scope === def ? " checked" : ""}> <strong>${l.label}</strong><small>${esc(l.blurb)}</small></label>`)
    .join("");
  const where = v.loopbackOnly
    ? `<div class="note">${esc(v.clientName)} will receive the result on <code>${esc(v.redirectHost)}</code>, which is <strong>your own machine</strong>. Only continue if you just started it yourself.</div>`
    : `<p class="fine" style="margin-top:14px">After you allow, you'll return to <code>${esc(v.redirectHost)}</code>.</p>`;
  return shell(
    "Allow access",
    `<h1>Allow ${esc(v.clientName)}?</h1>
     <p class="lede">Signed in as <strong>${esc(v.username)}</strong>, using <strong>${esc(v.instanceHost)}</strong>. Choose how much to allow:</p>
     ${errBox(v.error)}
     <form method="post" action="/authorize/decision">${hidden(v.rid, v.csrf)}
       ${opts}${where}
       <input type="hidden" name="privacy_present" value="1">
       <label class="chk"><input type="checkbox" name="anonymous"${v.anonymous ? " checked" : ""}><span>${esc(ANON_TEXT)}${v.alias ? ` <small class="hint">${v.anonymous ? "You appear as" : "You would appear as"} <strong>${esc(v.alias)}</strong>.</small>` : ""}</span></label>
       <div class="row"><button class="btn" name="action" value="allow">Allow</button>${cancel}</div>
     </form>
     <p class="fine">Disconnect any time from the app, or manage every connection inside Paperclip with the Papercliped plugin. Access levels are enforced by Papercliped; your Paperclip key stays encrypted on our side and is never shown to the app.</p>`,
  );
}

// ───────────── single-instance flow (unchanged behaviour, new look) ─────────────

export interface ConsentView {
  rid: string;
  csrf: string;
  clientName: string;
  redirectHost: string;
  loopbackOnly: boolean;
  requestedMax: Scope;
  login: "paperclip" | "static";
  approvalUrl?: string;
  approved: boolean;
  nonce: string;
  error?: string;
  instanceHost?: string;
}

export function consentPage(v: ConsentView): string {
  const allowed = new Set(grantableScopes());
  const def: Scope = v.requestedMax;
  const opts = LEVELS.filter((l) => allowed.has(l.scope))
    .map((l) => `<label class="opt"><input type="radio" name="level" value="${l.scope}"${l.scope === def ? " checked" : ""}> <strong>${l.label}</strong><small>${esc(l.blurb)}</small></label>`)
    .join("");
  const login =
    v.login === "paperclip"
      ? `<p style="margin:14px 0 4px"><a href="${esc(v.approvalUrl ?? "#")}" target="_blank" rel="noopener noreferrer">Open Paperclip to sign in and approve</a> (new tab)</p><p id="st" class="hint">${v.approved ? "Approved in Paperclip." : "Waiting for approval in Paperclip…"}</p>`
      : `<label class="f" for="pw">Bridge admin token</label><input id="pw" name="password" type="password" autocomplete="off" required>`;
  const script =
    v.login === "paperclip" && !v.approved
      ? `const s=document.getElementById('st');let n=0;const t=setInterval(async()=>{if(++n>200)return clearInterval(t);try{const r=await fetch('/authorize/status?rid=${encodeURIComponent(v.rid)}');const j=await r.json();if(j.approved){s.textContent='Approved in Paperclip.';clearInterval(t)}}catch(e){}},2000)`
      : undefined;
  const warn = v.loopbackOnly
    ? `<div class="note">This app receives the result on <code>${esc(v.redirectHost)}</code> (your own machine). Only continue if you just started it yourself.</div>`
    : `<p class="fine" style="margin-top:14px">After you approve you'll return to <code>${esc(v.redirectHost)}</code>.</p>`;
  return shell(
    "Authorize access",
    `<h1>Authorize ${esc(v.clientName)}</h1>
     <p class="lede">This app wants to use ${v.instanceHost ? `the Paperclip at <strong>${esc(v.instanceHost)}</strong>` : "your Paperclip"}. Choose how much to allow:</p>
     ${errBox(v.error)}
     <form method="post" action="/authorize/decision">${hidden(v.rid, v.csrf)}${opts}${warn}${login}
       <div class="row"><button class="btn" name="action" value="allow">Allow</button>${cancel}</div>
     </form>`,
    v.nonce,
    script,
  );
}

export function errorPage(title: string, message: string): string {
  return shell(title, `<h1>${esc(title)}</h1><p class="lede">${esc(message)}</p>`);
}
