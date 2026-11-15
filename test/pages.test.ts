import { describe, expect, it } from "vitest";
import { PORTAL, THEME, approvePage, choosePage, consentPage, errorPage, instancePage, scopePage, secretPage, usernamePage, welcomePage } from "../src/oauth/pages.js";

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("sign-in page palette (WCAG, both schemes)", () => {
  for (const [name, p] of [["light", PORTAL.light], ["dark", PORTAL.dark]] as const) {
    it(`${name}: text, links, button, errors and notes clear AA`, () => {
      for (const bg of [p.bg, p.surface, p.surface2]) for (const fg of [p.ink, p.ink2, p.muted, p.link]) expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.accentInk, p.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.errInk, p.errBg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.warnInk, p.warnBg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.field, p.bg)).toBeGreaterThanOrEqual(3);
    });
  }
});

describe("theme accessibility (WCAG)", () => {
  it("text on the cream background clears AA/AAA", () => {
    expect(contrast(THEME.ink, THEME.bg)).toBeGreaterThanOrEqual(12);
    expect(contrast(THEME.ink2, THEME.bg)).toBeGreaterThanOrEqual(7);
    expect(contrast(THEME.muted, THEME.bg)).toBeGreaterThanOrEqual(4.5);
  });
  it("the primary button's text clears AAA; the disabled grey is only ever used for a disabled state", () => {
    expect(contrast(THEME.btnText, THEME.btn)).toBeGreaterThanOrEqual(7);
  });
  it("error text on the error background clears AA", () => {
    expect(contrast(THEME.errInk, THEME.errBg)).toBeGreaterThanOrEqual(4.5);
  });
  it("uses the sampled Paperclip cream", () => expect(THEME.bg).toBe("#fffddc"));
});

const EVIL = `<script>alert(1)</script>"><img src=x onerror=alert(2)>`;
const ctx = { rid: "rid1", csrf: "csrf1", clientName: EVIL, redirectHost: EVIL, error: EVIL };

const pages: [string, string][] = [
  ["choose", choosePage({ ...ctx, username: EVIL })],
  ["instance", instancePage({ ...ctx, value: EVIL, notice: EVIL })],
  ["approve", approvePage({ ...ctx, approvalUrl: "https://tenant.example.com/cli-auth/x?token=abc", instanceHost: EVIL, approved: false, nonce: "N0NCE" })],
  ["username", usernamePage({ ...ctx, value: EVIL })],
  ["secret", secretPage({ ...ctx, username: EVIL, secret: "pcs_ABCD-EFGH-JKMN-PQRS-TVWX-YZ23-4567-89AB", rotated: false, nonce: "N0NCE" })],
  ["welcome", welcomePage({ ...ctx, username: EVIL })],
  ["scope", scopePage({ ...ctx, requestedMax: "paperclip:control", loopbackOnly: true, instanceHost: EVIL, username: EVIL })],
  ["consent(single)", consentPage({ ...ctx, loopbackOnly: false, requestedMax: "paperclip:control", login: "paperclip", approvalUrl: "https://p.example.com/x", approved: false, nonce: "N0NCE", instanceHost: EVIL })],
  ["error", errorPage(EVIL, EVIL)],
];

describe.each(pages)("%s page", (_name, html) => {
  it("escapes every piece of untrusted text", () => {
    expect(html).not.toContain("<script>alert(1)");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
  it("has no inline event handlers and no external resources", () => {
    expect(html).not.toMatch(/\son[a-z]+\s*=\s*["']/i);
    expect(html.replace(/<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,[^"]*">/, "")).not.toMatch(/<link\b|@import|url\(\s*["']?https?:|<script[^>]+src=|<iframe|<object|<embed/i);
    expect(html).not.toMatch(/<form[^>]+action=["']https?:/i); // forms only post back to this bridge
  });
  it("any script carries the CSP nonce", () => {
    for (const m of html.matchAll(/<script\b([^>]*)>/g)) expect(m[1]).toContain('nonce="N0NCE"');
  });
  it("is a complete, titled, mobile-ready document in the Papercliped brand", () => {
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('name="viewport"');
    expect(html).toMatch(/<title>[^<]+· Papercliped<\/title>/);
    expect(html).toContain("#151410");
  });
});

describe("form pages carry the CSRF pair and post to this bridge only", () => {
  it.each(pages.filter(([n]) => !["error"].includes(n)))("%s", (_n, html) => {
    const forms = [...html.matchAll(/<form\b[^>]*>/g)];
    expect(forms.length).toBeGreaterThan(0);
    for (const f of forms) expect(f[0]).toMatch(/method="post" action="\/authorize\/[a-z]+"/);
    expect(html).toContain('name="rid" value="rid1"');
    expect(html).toContain('name="csrf" value="csrf1"');
  });
});

describe("page content", () => {
  it("the secret page shows the key once, with a save confirmation gating Continue", () => {
    const html = pages.find(([n]) => n === "secret")![1];
    expect(html.replace(/<wbr>/g, "")).toContain("pcs_ABCD-EFGH-JKMN-PQRS-TVWX-YZ23-4567-89AB");
    expect(html).toContain("-<wbr>"); // phones may wrap only at the dashes
    expect(html).toContain('id="ack"');
    expect(html).toContain("saved my secret key");
  });
  it("the choose page offers both ways in, with a password-manager friendly secret field", () => {
    const html = pages.find(([n]) => n === "choose")![1];
    expect(html).toContain('action="/authorize/login"');
    expect(html).toContain('action="/authorize/connect"');
    expect(html).toContain('autocomplete="username"');
    expect(html).toContain('type="password" autocomplete="current-password"');
  });
  it("the username page states the rules", () => {
    const html = pages.find(([n]) => n === "username")![1];
    expect(html).toContain("At least 6 characters");
    expect(html).toContain(". # _");
  });
  it("the scope page offers exactly Read only and Full control, preselecting what the app asked for", () => {
    const ro = scopePage({ ...ctx, error: undefined, requestedMax: "paperclip:read", loopbackOnly: false, instanceHost: "p.example.com", username: "u.1234" });
    expect(ro).toContain('value="paperclip:read"');
    expect(ro).toContain('value="paperclip:control"'); // "Full control" is the person's choice
    expect(ro).toMatch(/value="paperclip:read" checked/); // but the default stays what the app asked for
    expect(ro).not.toContain('value="paperclip:admin"');
    expect(ro).toContain("Full control");
    const ad = pages.find(([n]) => n === "scope")![1];
    expect(ad).toMatch(/value="paperclip:control" checked/);
    expect(ad).not.toContain("paperclip:admin");
    expect(ad).toContain("your own machine"); // loopback warning
  });
});

import { grantableScopes } from "../src/oauth/scopes.js";
describe("grantableScopes", () => {
  it("is always Read only and Full control", () => {
    expect(grantableScopes("paperclip:read")).toEqual(["paperclip:read", "paperclip:control"]);
    expect(grantableScopes("paperclip:control")).toEqual(["paperclip:read", "paperclip:control"]);
  });
});
