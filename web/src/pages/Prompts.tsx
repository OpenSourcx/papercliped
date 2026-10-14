import { useMemo, useState } from "react";
import { cx } from "../components/cx";
import { Icon } from "../components/Icons";
import { ButtonLink, TextLink } from "../components/ui";
import gallery from "../content/prompts.json";
import tools from "../generated/tools.json";
import { usePageTitle } from "./usePageTitle";

export interface Prompt {
  category: string;
  title: string;
  prompt: string;
  tools: string[];
  note?: string;
}
type Level = "Read only" | "Full control";

const CONTROL = new Set(tools.filter((t) => t.scope === "paperclip:control").map((t) => t.name));
/** Full control if any tool the prompt uses changes something (the same rule as site/docs/prompts.md). */
export const levelOf = (p: Prompt): Level => (p.tools.some((t) => CONTROL.has(t)) ? "Full control" : "Read only");
const PROMPTS = gallery.prompts as Prompt[];

function PromptCard({ p }: { p: Prompt }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(p.prompt);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 1800);
  };
  const level = levelOf(p);
  return (
    <li className="flex flex-col rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold">{p.title}</h3>
        <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide", level === "Full control" ? "bg-accent text-accent-ink" : "border border-field text-ink")}>{level}</span>
      </div>
      <p className="mt-3 flex-1 whitespace-pre-line rounded-xl border border-line bg-bg px-4 py-3 text-[15px] leading-relaxed">{p.prompt}</p>
      {p.note && <p className="mt-2 text-sm text-muted">{p.note}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <details className="text-xs text-muted">
          <summary className="cursor-pointer select-none">{p.tools.length} {p.tools.length === 1 ? "tool" : "tools"}</summary>
          <ul className="mt-1 flex flex-wrap gap-1">{p.tools.map((t) => <li key={t} className="rounded-full border border-line px-2 py-0.5 font-mono">{t}</li>)}</ul>
        </details>
        <button type="button" onClick={copy} aria-label={`Copy prompt: ${p.title}`} className="rounded-full border border-field bg-bg px-3 py-1 text-sm font-medium text-ink hover:bg-surface">
          {state === "copied" ? "Copied" : state === "failed" ? "Select & copy" : "Copy"}
        </button>
      </div>
      <span className="sr-only" role="status">{state === "copied" ? "Copied to clipboard" : ""}</span>
    </li>
  );
}

/** The prompt gallery: things to say to your AI app instead of clicking through Paperclip. */
export function Prompts() {
  usePageTitle("Prompt gallery");
  const [cat, setCat] = useState("all");
  const [level, setLevel] = useState<"all" | Level>("all");
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return PROMPTS.filter((p) => (cat === "all" || p.category === cat) && (level === "all" || levelOf(p) === level) && (!needle || `${p.title} ${p.prompt}`.toLowerCase().includes(needle)));
  }, [cat, level, q]);
  const chip = (on: boolean) => cx("shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors", on ? "bg-accent text-accent-ink" : "border border-line text-muted hover:text-ink");

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
      <h1 className="text-4xl font-bold sm:text-5xl">Prompt gallery</h1>
      <p className="mt-3 max-w-3xl text-lg text-muted">
        Run your Paperclip by talking to Claude, ChatGPT or Codex. No clicking through the dashboard to make a task, wake an agent or answer an approval. Copy a prompt, replace the parts in [brackets], and send it.
      </p>
      <p className="mt-2 max-w-3xl text-muted">
        <strong className="text-ink">Read only</strong> prompts only look. <strong className="text-ink">Full control</strong> prompts change something, and your AI app asks before anything that can't be undone. Not connected yet? <TextLink to="/docs/getting-started">Get started</TextLink>.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        <label className="relative block max-w-md">
          <span className="sr-only">Search prompts</span>
          <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search prompts" className="h-10 w-full rounded-full border border-field bg-transparent pl-9 pr-4 text-ink" />
        </label>
        <div role="group" aria-label="Category" className="flex gap-2 overflow-x-auto pb-1">
          <button type="button" aria-pressed={cat === "all"} onClick={() => setCat("all")} className={chip(cat === "all")}>All</button>
          {gallery.categories.map((c) => (
            <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)} className={chip(cat === c.id)}>{c.title}</button>
          ))}
        </div>
        <div role="group" aria-label="Level" className="flex gap-2">
          {(["all", "Read only", "Full control"] as const).map((l) => (
            <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(l)} className={chip(level === l)}>{l === "all" ? "Any level" : l}</button>
          ))}
        </div>
      </div>

      <p className="mt-6 text-sm text-muted" role="status">{shown.length} {shown.length === 1 ? "prompt" : "prompts"}</p>
      {gallery.categories.map((c) => {
        const list = shown.filter((p) => p.category === c.id);
        if (!list.length) return null;
        return (
          <section key={c.id} aria-labelledby={`cat-${c.id}`} className="mt-8">
            <h2 id={`cat-${c.id}`} className="text-2xl font-bold">{c.title}</h2>
            <p className="mt-1 text-muted">{c.intro}</p>
            <ul className="mt-4 grid gap-4 md:grid-cols-2">{list.map((p) => <PromptCard key={p.title} p={p} />)}</ul>
          </section>
        );
      })}
      {!shown.length && <p className="mt-6">Nothing matches. Try another word, or ask your AI app "What can you do with my Paperclip?"</p>}

      <div className="mt-14 rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <h2 className="text-xl font-bold">Have a prompt that works well?</h2>
        <p className="mt-2 text-muted">Share it with the community, or add it to <code className="font-mono text-sm">web/src/content/prompts.json</code> in a pull request.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <ButtonLink to="/community">Community</ButtonLink>
          <ButtonLink to="/docs/prompts" variant="secondary">Gallery in the docs</ButtonLink>
          <ButtonLink to="/docs/tools" variant="secondary">All tools</ButtonLink>
        </div>
      </div>
    </div>
  );
}
