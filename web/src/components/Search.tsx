import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { search } from "../lib/docs";
import { isExternal, resolveHref } from "../lib/hosts";
import { cx } from "./cx";
import { Icon } from "./Icons";

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** Ctrl/Cmd-K docs search: a modal combobox over the build-time index. */
export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const nav = useNavigate();
  const id = useId();
  const hits = useMemo(() => search(q), [q]);
  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
    }
  }, [open]);
  useEffect(() => setActive(0), [q]);
  if (!open) return null;
  const go = (i: number) => {
    const h = hits[i];
    if (!h) return;
    onClose();
    const to = resolveHref(`/docs/${h.doc.slug}${h.heading ? `#${h.heading.id}` : ""}`);
    if (isExternal(to)) window.location.assign(to);
    else nav(to);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Search the docs" className="animate-pop w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-bg shadow-2xl">
        <div className="flex items-center gap-2 border-b border-line px-4">
          <span aria-hidden="true">⌕</span>
          <input ref={input} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the docs" aria-label="Search the docs" role="combobox" aria-expanded={hits.length > 0} aria-controls={`${id}-list`} aria-activedescendant={hits[active] ? `${id}-${active}` : undefined}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              else if (e.key === "Enter") go(active);
            }}
            className="h-14 flex-1 bg-transparent text-lg outline-none placeholder:text-muted" />
          <kbd className="rounded border border-field px-1.5 text-xs text-muted">Esc</kbd>
        </div>
        <ul id={`${id}-list`} role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-2">
          {q.trim().length > 1 && !hits.length && <li className="p-4 text-sm text-muted">No results for “{q}”.</li>}
          {hits.map((h, i) => (
            <li key={`${h.doc.slug}-${i}`} id={`${id}-${i}`} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); go(i); }}
              className={cx("cursor-pointer rounded-xl px-3 py-2", i === active && "bg-surface")}>
              <div className="font-semibold">{h.doc.title}{h.heading && <span className="font-normal text-muted"> › {h.heading.text}</span>}</div>
              <div className="line-clamp-2 text-sm text-muted">{h.snippet}</div>
            </li>
          ))}
          {!q && <li className="p-4 text-sm text-muted">Try “permissions”, “tunnel”, “rate limit” or “secret key”.</li>}
        </ul>
      </div>
    </div>
  );
}

const OPEN_EVENT = "pcl:open-search";

/** The one search dialog on the page (mounted once in the layout) and the Ctrl/Cmd-K shortcut. */
export function SearchHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);
  return <SearchDialog open={open} onClose={() => setOpen(false)} />;
}

/** A button that opens the search dialog. Any number of these can be on a page. */
export function SearchButton({ className, label = "Search docs" }: { className?: string; label?: string }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))} className={cx("flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-sm text-muted transition-colors hover:border-field hover:text-ink", className)}>
      <Icon name="search" size={15} /><span>{label}</span>
      <kbd className="ml-auto rounded-md border border-line bg-bg px-1.5 font-sans text-xs">{isMac() ? "⌘" : "Ctrl"} K</kbd>
    </button>
  );
}

/** Just the magnifier, for tight headers. */
export function SearchIconButton({ className }: { className?: string }) {
  return (
    <button type="button" aria-label="Search docs" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))} className={cx("grid h-11 w-11 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink", className)}>
      <Icon name="search" size={17} />
    </button>
  );
}
