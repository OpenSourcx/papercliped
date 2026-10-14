import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { AppLink } from "./AppLink";
import { community, REPO_URL } from "../config/community";
import { cx } from "./cx";
import { Mascot } from "./Mascot";
import { Icon } from "./Icons";
import { useDismiss } from "./useDismiss";
import { SearchButton, SearchHost, SearchIconButton } from "./Search";
import { onDocsHost } from "../lib/hosts";
import { compact, useRepoStars } from "../lib/useRepo";
import { Badge } from "./ui";

export function Wordmark({ className }: { className?: string }) {
  return (
    <AppLink to="/" className={cx("flex items-center gap-2 rounded-lg", className)} aria-label="papercliped home">
      <Mascot size={30} interactive={false} title="" />
      <span className="font-display text-xl font-bold lowercase tracking-tighter">papercliped</span>
    </AppLink>
  );
}

type MenuItem = { to: string; title: string; desc: string; badge?: string };
export const MENUS: { label: string; items: MenuItem[] }[] = [
  {
    label: "Product",
    items: [
      { to: "/", title: "Overview", desc: "What Papercliped does, in a minute." },
      { to: "/docs/getting-started", title: "Get started", desc: "Connect Claude or ChatGPT to your Paperclip." },
      { to: "/docs/paperclip-plugin", title: "Paperclip plugin", desc: "Manage connections from inside Paperclip.", badge: "New" },
      { to: "/status", title: "Status", desc: "Live, public numbers for the hosted service.", badge: "New" },
    ],
  },
  {
    label: "Resources",
    items: [
      { to: "/prompts", title: "Prompt gallery", desc: "Things to ask your AI app, ready to copy.", badge: "New" },
      { to: "/changelog", title: "Changelog", desc: "Everything that shipped, newest first." },
      { to: "/docs/hosting", title: "Host your Paperclip", desc: "Step-by-step: at home, a VPS, Railway, Render, Fly.io or Coolify." },
      { to: "/brand", title: "Brand assets", desc: "The wordmark, the mascot and how to use them." },
      { to: REPO_URL, title: "Source code", desc: "MIT licensed, on GitHub." },
    ],
  },
];

function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  useDismiss(open, () => setOpen(false), box);
  const id = `menu-${label.toLowerCase()}`;
  return (
    <div ref={box} className="relative">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className={cx("flex items-center gap-1 rounded-full px-3.5 py-2 text-sm font-medium transition-colors hover:text-ink", open ? "text-ink" : "text-muted")}>
        {label} <Icon name="down" size={14} className={cx("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div id={id} className="animate-toast-in absolute left-1/2 top-full z-40 mt-3 w-80 -translate-x-1/2 rounded-2xl border border-line bg-bg p-2 shadow-2xl">
          <ul>
            {items.map((it) => (
              <li key={it.title}>
                <NavItem item={it} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function NavItem({ item }: { item: MenuItem }) {
  return (
    <AppLink to={item.to} className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-surface">
      <span className="flex items-center gap-2 font-semibold">{item.title}{item.badge && <Badge>{item.badge}</Badge>}</span>
      <span className="block text-sm text-muted">{item.desc}</span>
    </AppLink>
  );
}

/** GitHub link with the live star count (served by the bridge; no request to GitHub from the browser). */
export function GitHubButton({ className }: { className?: string }) {
  const stars = useRepoStars();
  const shown = stars != null && stars > 0;
  return (
    <a href={REPO_URL} rel="noopener noreferrer" aria-label={shown ? `Star Papercliped on GitHub, ${stars} stars` : "Star Papercliped on GitHub"}
      className={cx("inline-flex h-9 items-center gap-2 rounded-full border border-line px-3.5 text-sm font-medium transition-[transform,border-color] duration-150 hover:-translate-y-0.5 hover:border-field", className)}>
      <GitHubIcon /><span>Star</span>
      {shown && <span className="flex items-center gap-1 border-l border-line pl-2 tabular-nums text-muted" aria-hidden="true"><Icon name="star" size={13} />{compact(stars)}</span>}
    </a>
  );
}

export function GitHubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width={size} height={size} fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

const SKIP = "sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink";
const PILL_CTA = "inline-flex h-9 items-center rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink transition-transform duration-150 hover:-translate-y-0.5 active:scale-[0.97]";

/** The marketing header: logo left, a short centred nav, search, stars and one call to action on the right. */
function SiteHeader() {
  const [mobile, setMobile] = useState(false);
  const loc = useLocation();
  useEffect(() => setMobile(false), [loc.pathname]);
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/80 backdrop-blur-md">
      <a href="#main" className={SKIP}>Skip to content</a>
      <div className="mx-auto grid h-16 max-w-7xl grid-cols-[1fr_auto] items-center gap-4 px-4 md:grid-cols-[1fr_auto_1fr]">
        <Wordmark className="justify-self-start" />
        <nav aria-label="Main" className="hidden items-center md:flex">
          <Menu {...MENUS[0]} />
          <AppLink to="/docs" className="rounded-full px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:text-ink">Docs</AppLink>
          <Menu {...MENUS[1]} />
          <AppLink to="/community" className="rounded-full px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:text-ink">Community</AppLink>
        </nav>
        <div className="flex items-center justify-self-end gap-2">
          <SearchIconButton />
          <GitHubButton className="hidden lg:inline-flex" />
          <AppLink to="/docs/getting-started" className={cx(PILL_CTA, "hidden sm:inline-flex")}>Get started</AppLink>
          <button type="button" aria-label={mobile ? "Close menu" : "Open menu"} aria-expanded={mobile} aria-controls="mobile-nav" onClick={() => setMobile((m) => !m)}
            className="grid h-9 w-9 place-items-center rounded-full border border-line md:hidden">
            <Icon name={mobile ? "close" : "menu"} size={17} />
          </button>
        </div>
      </div>
      {mobile && (
        <nav id="mobile-nav" aria-label="Main" className="border-t border-line px-4 pb-5 md:hidden">
          <ul className="pt-3">
            <li><AppLink to="/docs" className="block rounded-xl px-3 py-2.5 font-semibold hover:bg-surface">Docs</AppLink></li>
            <li><AppLink to="/community" className="block rounded-xl px-3 py-2.5 font-semibold hover:bg-surface">Community</AppLink></li>
          </ul>
          {MENUS.map((m) => (
            <div key={m.label} className="pt-3">
              <p className="px-3 text-xs font-bold uppercase tracking-widest text-muted">{m.label}</p>
              <ul>{m.items.map((it) => <li key={it.title}><NavItem item={it} /></li>)}</ul>
            </div>
          ))}
          <div className="mt-4 flex flex-wrap gap-2 px-3">
            <AppLink to="/docs/getting-started" className={PILL_CTA}>Get started</AppLink>
            <GitHubButton />
          </div>
        </nav>
      )}
    </header>
  );
}

const DOCS_LINKS = [
  { to: "/", label: "Home" },
  { to: "/docs", label: "Docs" },
  { to: "/changelog", label: "Changelog" },
  { to: REPO_URL, label: "GitHub" },
];

/** The docs header: links left, "papercliped Docs" centred, search and stars right. */
function DocsHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
      <a href="#main" className={SKIP}>Skip to content</a>
      <div className="mx-auto grid h-14 max-w-[90rem] grid-cols-[1fr_auto] items-center gap-4 px-4 md:grid-cols-[1fr_auto_1fr]">
        <nav aria-label="Site" className="hidden items-center gap-1 text-sm md:flex">
          {DOCS_LINKS.map((l) => <AppLink key={l.label} to={l.to} className="rounded-full px-3 py-1.5 text-muted transition-colors hover:bg-surface hover:text-ink">{l.label}</AppLink>)}
        </nav>
        <AppLink to="/docs" className="flex items-center gap-2 justify-self-start rounded-lg md:justify-self-center" aria-label="papercliped docs home">
          <Mascot size={26} interactive={false} title="" />
          <span className="font-display text-lg font-bold lowercase tracking-tight">papercliped</span>
          <span className="text-lg font-medium text-muted">Docs</span>
        </AppLink>
        <div className="flex items-center justify-self-end gap-2">
          <SearchButton label="Search" className="hidden w-56 sm:flex" />
          <SearchIconButton className="sm:hidden" />
          <GitHubButton className="hidden md:inline-flex" />
        </div>
      </div>
    </header>
  );
}

export const isDocsPath = (p: string) => /^\/(docs|changelog)(\/|$)/.test(p);

export function Header() {
  const loc = useLocation();
  return onDocsHost() || isDocsPath(loc.pathname) ? <DocsHeader /> : <SiteHeader />;
}

const FOOTER: { title: string; links: { to: string; label: string }[] }[] = [
  { title: "Product", links: [{ to: "/", label: "Overview" }, { to: "/docs/getting-started", label: "Get started" }, { to: "/docs/paperclip-plugin", label: "Paperclip plugin" }, { to: "/prompts", label: "Prompt gallery" }, { to: "/changelog", label: "Changelog" }] },
  { title: "Docs", links: [{ to: "/docs", label: "All topics" }, { to: "/docs/hosting", label: "Host your Paperclip" }, { to: "/docs/other-ai-apps", label: "Any AI app (MCP)" }, { to: "/docs/troubleshooting", label: "Troubleshooting" }] },
  { title: "Community", links: [{ to: "/community", label: "Join the community" }, { to: community.newIssue, label: "Report a bug" }, { to: "/community#suggest", label: "Suggest a feature" }, { to: "/brand", label: "Brand assets" }] },
  { title: "Company", links: [{ to: REPO_URL, label: "Open source (MIT)" }, { to: `mailto:${community.email}`, label: "Contact" }, { to: "/status", label: "Status" }] },
  { title: "Legal", links: [{ to: "/privacy", label: "Privacy" }, { to: "/terms", label: "Terms" }, { to: "/docs/security", label: "Security" }] },
];

/** Brand marks for the footer (filled, 24px grid). */
const BRAND: Record<"x" | "github" | "discord", string> = {
  x: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  github: "M12 .3a12 12 0 0 0-3.8 23.38c.6.12.83-.26.83-.57L9 21.07c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.08-.74.09-.73.09-.73 1.2.09 1.83 1.24 1.83 1.24 1.07 1.83 2.81 1.3 3.5 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.64 1.66.24 2.88.12 3.18a4.65 4.65 0 0 1 1.23 3.22c0 4.61-2.8 5.63-5.48 5.92.42.36.81 1.1.81 2.22l-.01 3.29c0 .31.2.69.82.57A12 12 0 0 0 12 .3",
  discord: "M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.11 13.11 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z",
};
/** X, GitHub and Discord. A network without a real address yet points to the community page (no invented handles). */
function SocialIcons() {
  const items = [
    { key: "x" as const, label: "Papercliped on X", href: community.x },
    { key: "github" as const, label: "Papercliped on GitHub", href: community.github },
    { key: "discord" as const, label: "OpenSourcedd on Discord", href: community.discord },
  ];
  return (
    <ul aria-label="Social" className="mt-5 flex gap-2">
      {items.map((s) => (
        <li key={s.key}>
          <AppLink to={s.href || "/community"} aria-label={s.href ? s.label : `${s.label} (coming soon)`} title={s.href ? undefined : "Coming soon"}
            className="grid h-9 w-9 place-items-center rounded-full border border-line text-muted transition-[color,border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-field hover:text-ink">
            <svg aria-hidden="true" viewBox="0 0 24 24" width={16} height={16} fill="currentColor"><path d={BRAND[s.key]} /></svg>
          </AppLink>
        </li>
      ))}
    </ul>
  );
}

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-1">
          <Wordmark />
          <p className="mt-3 text-sm text-muted">Papercliped, not Paperclipped. Free and open source.</p>
          <SocialIcons />
        </div>
        {FOOTER.map((col) => (
          <div key={col.title}>
            <h2 className="font-sans text-sm font-bold">{col.title}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {col.links.map((l) => (
                <li key={l.label}>
                  <AppLink to={l.to} className="text-muted hover:text-ink">{l.label}</AppLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted">
          <span>© {new Date().getUTCFullYear()} Papercliped contributors · MIT licence · Not affiliated with Paperclip</span>
          <span>No trackers. No third-party scripts.</span>
        </div>
      </div>
    </footer>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main id="main" className="flex-1">{children}</main>
      <Footer />
      <SearchHost />
    </div>
  );
}
