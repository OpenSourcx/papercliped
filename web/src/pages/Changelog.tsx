import { useEffect, useMemo, useState } from "react";
import md from "../../../CHANGELOG.md?raw";
import dates from "../content/release-dates.json";
import { cx } from "../components/cx";
import { Icon } from "../components/Icons";
import { Badge, TextLink } from "../components/ui";
import { DocHeader, DocsShell } from "./Docs";
import { parseChangelog, type Kind } from "../lib/changelog";
import { renderMarkdown } from "../lib/markdown";
import { usePageTitle } from "./usePageTitle";

const KIND: Record<Kind, string> = { new: "New", improved: "Improved", fixed: "Fixed" };
const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const inline = (s: string) => renderMarkdown(s).replace(/^<p>|<\/p>$/g, "");

/** Every release from CHANGELOG.md, newest first, with filters and an Atom feed. */
export function Changelog() {
  usePageTitle("Changelog");
  const releases = useMemo(() => parseChangelog(md, dates as Record<string, string>), []);
  const [filter, setFilter] = useState<Kind | "all">("all");
  const latest = releases.find((r) => !r.unreleased);
  // A link to an older release (#v1-2-0) opens its card.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    const card = id ? document.getElementById(id)?.querySelector("details") : null;
    if (card) {
      card.open = true;
      card.scrollIntoView?.();
    }
  }, []);
  return (
    <DocsShell>
      <DocHeader crumbs={[{ label: "Changelog" }, { to: "/docs", label: "Docs" }]} title="Changelog" tag={latest ? `Latest ${latest.version}` : undefined}
        meta={<span>Subscribe with the <a className="text-link underline" href="/changelog.xml">Atom feed</a>, or watch releases on <TextLink to="https://github.com/OpenSourcx/papercliped/releases">GitHub</TextLink>.</span>}>
        <p className="mt-4 max-w-2xl text-lg text-muted">Everything that shipped, newest first.</p>
      </DocHeader>
      <div role="group" aria-label="Filter changes" className="mt-6 flex flex-wrap gap-2">
        {(["all", "new", "improved", "fixed"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
            className={cx("rounded-lg border px-3.5 py-1 text-sm font-medium transition-all duration-150", filter === k ? "border-accent bg-accent text-accent-ink" : "border-line hover:border-field")}>
            {k === "all" ? "Everything" : KIND[k]}
          </button>
        ))}
      </div>
      <ol className="mt-8 space-y-4">
        {releases.map((r, idx) => {
          const entries = r.entries.filter((e) => filter === "all" || e.kind === filter);
          if (filter !== "all" && !entries.length) return null;
          const counts = (["new", "improved", "fixed"] as const).map((k) => [k, r.entries.filter((e) => e.kind === k).length] as const).filter(([, n]) => n);
          return (
            <li key={r.version} id={r.anchor} className="scroll-mt-20">
              <details open={idx < 2} className="group rounded-lg border border-line bg-bg transition-colors open:bg-surface/40 hover:border-field">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 p-5 [&::-webkit-details-marker]:hidden">
                  <Icon name="chevron" size={16} className="shrink-0 text-muted transition-transform group-open:rotate-90" />
                  <h2 className="text-xl font-semibold">{r.unreleased ? "In progress" : r.version}</h2>
                  {r.unreleased ? <Badge tone="outline">Unreleased</Badge> : r.date ? <time dateTime={r.date} className="text-sm text-muted">{fmt(r.date)}</time> : <span className="text-sm text-muted">date not recorded</span>}
                  <span className="ml-auto flex flex-wrap gap-1.5 text-xs text-muted">
                    {counts.map(([k, n]) => <span key={k} className="rounded-lg border border-line px-2 py-0.5">{n} {KIND[k].toLowerCase()}</span>)}
                  </span>
                  {r.title && <p className="w-full pl-7 font-semibold">{r.title}</p>}
                </summary>
                <div className="border-t border-line px-5 pb-5 pl-12">
                  {filter === "all" && r.intro.map((p, i) => <p key={i} className="prose-papercliped mt-4 text-muted" dangerouslySetInnerHTML={{ __html: inline(p) }} />)}
                  <ul className="mt-4 space-y-3">
                    {entries.map((e, i) => (
                      <li key={i} className="flex gap-3">
                        <span className={cx("mt-0.5 h-fit shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-bold ", e.kind === "new" ? "bg-accent text-accent-ink" : "border border-field")}>{KIND[e.kind]}</span>
                        <span className="prose-papercliped min-w-0" dangerouslySetInnerHTML={{ __html: inline(e.text) }} />
                      </li>
                    ))}
                  </ul>
                  <a href={`#${r.anchor}`} className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink"><Icon name="link" size={12} /> Link to this release</a>
                </div>
              </details>
            </li>
          );
        })}
      </ol>
    </DocsShell>
  );
}
