import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AppLink, isAppPath } from "../components/AppLink";
import { isExternal, resolveHref } from "../lib/hosts";
import { cx } from "../components/cx";
import { CodeBlock } from "../components/CodeBlock";
import { Icon } from "../components/Icons";
import { SearchButton } from "../components/Search";
import { useDismiss } from "../components/useDismiss";
import { DOCS_GROUPS, editUrl, sectionOf, sourceUrl } from "../content/docs-nav";
import { allDocs, getDoc, neighbours, sections, type Doc } from "../lib/docs";
import { NotFound } from "./Placeholder";
import { usePageTitle } from "./usePageTitle";

const MCP_URL = "https://mcp.papercliped.co/mcp";


function Sidebar({ current, onNavigate }: { current?: string; onNavigate?: () => void }) {
  const loc = useLocation();
  const secs = new Map(sections().map((s) => [s.title, s]));
  const onChangelog = loc.pathname.startsWith("/changelog");
  const item = (active: boolean) => cx("flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors", active ? "bg-surface font-semibold text-ink" : "text-muted hover:bg-surface hover:text-ink");
  return (
    <nav aria-label="Docs" className="text-sm">
      <AppLink to="/docs" onClick={onNavigate} className="mb-5 inline-flex items-center gap-2 rounded-lg px-2.5 py-1 text-muted transition-colors hover:text-ink">
        <Icon name="back" size={14} /> All docs
      </AppLink>
      {DOCS_GROUPS.map((g) => (
        <div key={g.label} className="mb-6">
          <p className="mb-2 px-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{g.label}</p>
          {g.sections.map(({ title, icon }) => {
            const s = secs.get(title);
            if (!s) return null;
            const here = s.docs.some((d) => d.slug === current);
            return (
              <details key={title} open={here} className="group mb-0.5">
                <summary className={cx(item(false), "cursor-pointer list-none font-medium text-ink [&::-webkit-details-marker]:hidden")}>
                  <Icon name={icon} size={16} className="shrink-0 text-muted" />
                  <span className="flex-1">{title}</span>
                  <span className="rounded-full bg-surface px-1.5 text-[11px] font-semibold tabular-nums text-muted group-hover:bg-bg">{s.docs.length}</span>
                  <Icon name="chevron" size={14} className="text-muted transition-transform group-open:rotate-90" />
                </summary>
                <ul className="mb-2 ml-[1.15rem] mt-0.5 border-l border-line pl-2.5">
                  {s.docs.map((d) => (
                    <li key={d.slug}>
                      <AppLink to={`/docs/${d.slug}`} onClick={onNavigate} aria-current={current === d.slug ? "page" : undefined}
                        className={cx("relative block rounded-lg px-2.5 py-1 transition-colors", current === d.slug ? "bg-surface font-semibold text-ink before:absolute before:-left-[11px] before:top-1 before:bottom-1 before:w-0.5 before:rounded-full before:bg-accent" : "text-muted hover:text-ink")}>
                        {d.title}
                      </AppLink>
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      ))}
      <div className="mb-6">
        <p className="mb-2 px-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Project</p>
        <AppLink to="/changelog" onClick={onNavigate} aria-current={onChangelog ? "page" : undefined} className={item(onChangelog)}>
          <Icon name="clock" size={16} className="shrink-0 text-muted" /><span className="flex-1">Changelog</span>
        </AppLink>
      </div>
    </nav>
  );
}

/** "On this page", highlighting the section in view. */
function Toc({ doc }: { doc: Doc }) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = doc.headings.map((h) => document.getElementById(h.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActive(vis[0].target.id);
    }, { rootMargin: "-80px 0px -70% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [doc]);
  if (!doc.headings.length) return null;
  return (
    <nav aria-label="On this page" className="text-sm">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">On this page</p>
      <ul className="space-y-1 border-l border-line">
        {doc.headings.map((h) => (
          <li key={h.id}>
            <a href={`#${h.id}`} className={cx("-ml-px block border-l-2 py-0.5 transition-colors", h.level === 3 ? "pl-6" : "pl-3", active === h.id ? "border-accent font-semibold text-ink" : "border-transparent text-muted hover:text-ink")}>{h.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** "Copy link", with a menu for the page source and the edit link. */
function CopyLink({ source, edit }: { source?: string; edit?: string }) {
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), box);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href.split("#")[0]);
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    } catch {
      /* clipboard blocked: nothing to do */
    }
  };
  const seg = "inline-flex h-8 items-center gap-1.5 px-3 text-xs font-semibold transition-colors hover:bg-surface";
  return (
    <div ref={box} className="relative">
      <div className="inline-flex overflow-hidden rounded-full border border-line">
        <button type="button" className={seg} onClick={copy}><Icon name="link" size={13} />{done ? "Link copied" : "Copy link"}</button>
        {(source || edit) && (
          <button type="button" aria-label="More page options" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={cx(seg, "border-l border-line px-2")}>
            <Icon name="down" size={13} className={cx("transition-transform", open && "rotate-180")} />
          </button>
        )}
      </div>
      {open && (
        <div role="menu" className="animate-toast-in absolute right-0 top-full z-20 mt-2 w-60 rounded-2xl border border-line bg-bg p-1.5 text-sm shadow-2xl">
          <button type="button" role="menuitem" onClick={() => { void copy(); setOpen(false); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-surface"><Icon name="link" size={14} /> Copy link to this page</button>
          {source && <a role="menuitem" href={source} rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-surface"><Icon name="file" size={14} /> View the Markdown source</a>}
          {edit && <a role="menuitem" href={edit} rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-surface"><Icon name="pencil" size={14} /> Suggest an edit</a>}
        </div>
      )}
    </div>
  );
}

/** Breadcrumb, big title, tag chip and the copy-link button: the top of every docs-style page. */
export function DocHeader({ crumbs, title, tag, meta, source, edit, children }: { crumbs: { to?: string; label: string }[]; title: string; tag?: string; meta?: React.ReactNode; source?: string; edit?: string; children?: React.ReactNode }) {
  return (
    <div className="border-b border-line pb-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          {crumbs.map((c, i) => (
            <li key={c.label} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden="true">/</span>}
              {c.to ? <AppLink to={c.to} className="hover:text-ink">{c.label}</AppLink> : <span aria-current={i === crumbs.length - 1 ? "page" : undefined}>{c.label}</span>}
            </li>
          ))}
        </ol>
      </nav>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl">{title}</h1>
        <CopyLink source={source} edit={edit} />
      </div>
      {(tag || meta) && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted">
          {tag && <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs font-semibold text-ink">{tag}</span>}
          {meta}
        </div>
      )}
      {children}
    </div>
  );
}

export function DocsShell({ current, children, aside }: { current?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="mx-auto max-w-[90rem] px-4">
      <div className="flex items-center gap-3 border-b border-line py-3 lg:hidden">
        <button type="button" aria-expanded={menu} aria-controls="docs-drawer" onClick={() => setMenu((m) => !m)} className="inline-flex items-center gap-2 rounded-full border border-line px-3.5 py-1.5 text-sm font-semibold">
          <Icon name={menu ? "close" : "menu"} size={15} /> Topics
        </button>
      </div>
      {menu && <div id="docs-drawer" className="border-b border-line py-4 lg:hidden"><Sidebar current={current} onNavigate={() => setMenu(false)} /></div>}
      <div className="grid gap-10 lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_14rem]">
        <aside className="hidden border-r border-line lg:block">
          <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto py-8 pr-4">
            <Sidebar current={current} />
          </div>
        </aside>
        <div className="min-w-0 py-8 lg:py-10">{children}</div>
        {aside && <aside className="hidden xl:block"><div className="sticky top-14 py-10">{aside}</div></aside>}
      </div>
    </div>
  );
}

const START: { slug: string; icon: "rocket" | "plug" | "book" | "code" | "link"; blurb: string }[] = [
  { slug: "getting-started", icon: "rocket", blurb: "Connect Claude to your Paperclip in about a minute." },
  { slug: "hosting", icon: "link", blurb: "Give Paperclip a public address: at home, a VPS, Railway, Render, Fly.io or Coolify." },
  { slug: "other-ai-apps", icon: "plug", blurb: "ChatGPT, Claude Code and any app that speaks MCP." },
  { slug: "prompts", icon: "book", blurb: "Ready-to-copy prompts for running Paperclip in plain words." },
];

/** The docs landing: search, the four places most people start, then every topic. */
export function DocsIndex() {
  usePageTitle("Docs");
  return (
    <DocsShell>
      <section aria-labelledby="docs-h" className="border-b border-line pb-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">Documentation</p>
        <h1 id="docs-h" className="mt-3 text-4xl font-bold tracking-tighter sm:text-5xl">Papercliped docs</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">Connect your AI app to your Paperclip, choose what it may do, and manage everything from inside Paperclip. {allDocs().length} topics, all searchable.</p>
        <SearchButton label="Search the docs" className="mt-6 h-12 w-full max-w-xl px-5 text-base" />
        <CodeBlock label="Connector address for Claude, ChatGPT and MCP apps" code={MCP_URL} className="mt-6 max-w-xl" />
      </section>

      <section aria-labelledby="start-h" className="mt-10">
        <h2 id="start-h" className="text-2xl font-bold">Start here</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {START.map(({ slug, icon, blurb }) => {
            const d = getDoc(slug);
            if (!d) return null;
            return (
              <li key={slug}>
                <AppLink to={`/docs/${slug}`} className="group flex h-full gap-4 rounded-2xl border border-line p-5 transition-[transform,border-color,background-color] duration-150 hover:-translate-y-0.5 hover:border-field hover:bg-surface">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-surface text-ink"><Icon name={icon} size={18} /></span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 font-semibold">{d.title}<Icon name="chevron" size={15} className="text-muted transition-transform group-hover:translate-x-0.5" /></span>
                    <span className="mt-1 block text-sm text-muted">{blurb}</span>
                  </span>
                </AppLink>
              </li>
            );
          })}
        </ul>
      </section>

      {DOCS_GROUPS.flatMap((g) => g.sections).map(({ title, icon }) => {
        const s = sections().find((x) => x.title === title);
        if (!s) return null;
        return (
          <section key={s.title} aria-labelledby={`sec-${s.title}`} className="mt-10">
            <h2 id={`sec-${s.title}`} className="flex items-center gap-2 text-xl font-bold"><Icon name={icon} size={18} className="text-muted" />{s.title} <span className="text-base font-medium text-muted">({s.docs.length})</span></h2>
            <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
              {s.docs.map((d) => (
                <li key={d.slug}>
                  <AppLink to={`/docs/${d.slug}`} className="group flex items-center gap-4 px-4 py-3 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-surface">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{d.title}</span>
                      <span className="line-clamp-1 block text-sm text-muted">{d.description}</span>
                    </span>
                    <Icon name="chevron" size={15} className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                  </AppLink>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <section aria-label="Help" className="mt-12 grid gap-3 sm:grid-cols-3">
        {[{ to: "/docs/troubleshooting", t: "Troubleshooting", d: "Fixes for the common problems." }, { to: "/docs/faq", t: "FAQ", d: "Short answers to common questions." }, { to: "/community", t: "Ask the community", d: "Suggest features, report bugs." }].map((x) => (
          <AppLink key={x.t} to={x.to} className="rounded-2xl bg-surface p-4 transition-transform duration-150 hover:-translate-y-0.5">
            <span className="block font-semibold">{x.t}</span>
            <span className="block text-sm text-muted">{x.d}</span>
          </AppLink>
        ))}
      </section>
    </DocsShell>
  );
}

export function DocPage() {
  const { slug = "" } = useParams();
  const doc = getDoc(slug);
  const nav = useNavigate();
  const loc = useLocation();
  const body = useRef<HTMLDivElement>(null);
  usePageTitle(doc ? doc.title : "Not found");

  // Scroll to the heading in the URL, or to the top on a new page.
  useEffect(() => {
    if (!doc) return;
    const id = decodeURIComponent(loc.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
    else window.scrollTo?.(0, 0);
  }, [doc, loc.hash]);

  // Copy buttons on code blocks.
  useEffect(() => {
    const root = body.current;
    if (!root) return;
    for (const pre of Array.from(root.querySelectorAll("pre"))) {
      if (pre.querySelector("button")) continue;
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = "Copy";
      b.className = "copy-code";
      b.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(pre.querySelector("code")?.textContent ?? pre.textContent ?? "");
          b.textContent = "Copied";
        } catch {
          b.textContent = "Select & copy";
        }
        setTimeout(() => (b.textContent = "Copy"), 1600);
      });
      pre.appendChild(b);
    }
  }, [doc]);

  if (!doc) return <NotFound />;
  const { prev, next } = neighbours(doc.slug);
  // In-app links navigate without a reload; everything else behaves normally.
  const onClick = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    const href = a?.getAttribute("href");
    if (!a || !href || e.metaKey || e.ctrlKey || e.shiftKey || a.target) return;
    if (href.startsWith("#")) return;
    if (!href.startsWith("/")) return;
    const target = resolveHref(href);
    if (isExternal(target)) {
      if (target !== href) {
        e.preventDefault();
        window.location.assign(target); // a page on another host (e.g. docs → marketing)
      }
      return;
    }
    if (isAppPath(target.split("#")[0])) {
      e.preventDefault();
      nav(target);
    }
  };
  return (
    <DocsShell current={doc.slug} aside={<Toc doc={doc} />}>
      <DocHeader crumbs={[{ to: "/docs", label: "Docs" }, { label: sectionOf(doc.slug) }]} title={doc.title} tag={sectionOf(doc.slug)}
        source={sourceUrl(doc.slug)} edit={editUrl(doc.slug)}
        meta={doc.updated && <span>Last updated <time dateTime={doc.updated}>{new Date(`${doc.updated}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}</time></span>} />
      {doc.headings.length > 2 && (
        <details className="mt-6 rounded-2xl border border-line p-3 xl:hidden">
          <summary className="cursor-pointer font-semibold">On this page</summary>
          <div className="mt-2"><Toc doc={doc} /></div>
        </details>
      )}
      <div ref={body} onClick={onClick} className="prose-papercliped docs-body mt-8" dangerouslySetInnerHTML={{ __html: doc.html }} />
      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-sm">
        <a href={editUrl(doc.slug)} rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-link underline"><Icon name="pencil" size={13} />Edit this page on GitHub</a>
        <span className="text-muted">Something wrong? <AppLink to="/community" className="text-link underline">Tell us</AppLink></span>
      </div>
      <nav aria-label="Previous and next" className="mt-6 grid gap-3 sm:grid-cols-2">
        {prev ? <AppLink to={`/docs/${prev.slug}`} className="rounded-2xl border border-line p-4 transition-[transform,background-color] duration-150 hover:-translate-y-0.5 hover:bg-surface"><span className="text-xs text-muted">← Previous</span><span className="block font-semibold">{prev.title}</span></AppLink> : <span />}
        {next && <AppLink to={`/docs/${next.slug}`} className="rounded-2xl border border-line p-4 text-right transition-[transform,background-color] duration-150 hover:-translate-y-0.5 hover:bg-surface"><span className="text-xs text-muted">Next →</span><span className="block font-semibold">{next.title}</span></AppLink>}
      </nav>
    </DocsShell>
  );
}
