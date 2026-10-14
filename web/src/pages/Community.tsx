import { useState } from "react";
import { Mascot } from "../components/Mascot";
import { Button, ButtonLink, Card, Field, TextLink } from "../components/ui";
import { community, REPO_URL } from "../config/community";
import { usePageTitle } from "./usePageTitle";

const CHANNELS: { key: "github" | "discussions" | "discord" | "reddit" | "x" | "forum"; title: string; desc: string }[] = [
  { key: "github", title: "GitHub", desc: "The code, issues and pull requests. Star it to follow along." },
  { key: "discussions", title: "GitHub Discussions", desc: "Questions, ideas and show-and-tell." },
  { key: "discord", title: "Discord", desc: "The OpenSourcedd server: chat with other Paperclip operators and the people building Papercliped." },
  { key: "reddit", title: "Reddit", desc: "r/OpenSourcedd: share what you're building, suggest ideas and review each other's work." },
  { key: "x", title: "X", desc: "Release news and tips." },
  { key: "forum", title: "Forum", desc: "Long-form discussion and guides." },
];

/** Builds a pre-filled GitHub issue for a feature idea. Nothing is sent until the visitor submits it on GitHub. */
function Suggest() {
  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
  const href = `${REPO_URL}/issues/new?${new URLSearchParams({ labels: "enhancement", title: title ? `Idea: ${title}` : "", body: `## What would you like?\n${title}\n\n## Why would it help?\n${why}\n\n_Suggested from papercliped.co/community_` })}`;
  return (
    <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); window.location.assign(href); }}>
      <Field label="Your idea, in one line" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required placeholder="Show agent costs per project in reports" />
      <div className="flex flex-col gap-1">
        <label htmlFor="why" className="text-sm font-medium">Why would it help? (optional)</label>
        <textarea id="why" value={why} onChange={(e) => setWhy(e.target.value)} rows={4} maxLength={2000} className="rounded-lg border border-field bg-transparent p-3 text-ink" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!title.trim()}>Continue on GitHub</Button>
        <span className="text-sm text-muted">Opens a pre-filled issue on GitHub; you review it before posting. Needs a GitHub account.</span>
      </div>
    </form>
  );
}

export function Community() {
  usePageTitle("Community");
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        <Mascot size={96} hopOnClick />
        <div>
          <h1 className="text-4xl font-bold sm:text-5xl">Community</h1>
          <p className="mt-2 max-w-2xl text-lg text-muted">Papercliped is built in the open. Join in, ask questions, suggest what we should build next.</p>
        </div>
      </div>

      <section aria-labelledby="ch-h" className="mt-12">
        <h2 id="ch-h" className="text-2xl font-bold">Where to find us</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CHANNELS.map((c) => {
            const href = community[c.key];
            return (
              <Card as="li" interactive={!!href} key={c.key} className="flex flex-col">
                <h3 className="font-sans text-lg font-bold">{c.title}</h3>
                <p className="mt-1 flex-1 text-muted">{c.desc}</p>
                <div className="mt-4">
                  {href ? <ButtonLink to={href} size="sm" variant="secondary">Open {c.title}</ButtonLink> : <span className="inline-flex h-8 items-center rounded-lg border border-dashed border-field px-3 text-sm text-muted">Coming soon</span>}
                </div>
              </Card>
            );
          })}
        </ul>
      </section>

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <section id="suggest" aria-labelledby="sg-h" className="scroll-mt-24 rounded-3xl border border-line bg-surface p-6">
          <h2 id="sg-h" className="text-2xl font-bold">Suggest a feature</h2>
          <p className="mt-1 text-muted">Tell us what would make Papercliped more useful for you.</p>
          <Suggest />
        </section>
        <section aria-labelledby="bug-h" className="rounded-3xl border border-line bg-surface p-6">
          <h2 id="bug-h" className="text-2xl font-bold">Report a bug</h2>
          <p className="mt-1 text-muted">Something broken or confusing? Open an issue with what you did, what you expected and what happened.</p>
          <p className="mt-2 text-sm text-muted">Never include your secret key, Paperclip keys or tokens. Security problems go privately to <TextLink to={`mailto:${community.email}`}>{community.email}</TextLink>.</p>
          <div className="mt-4"><ButtonLink to={community.newIssue}>Open an issue</ButtonLink></div>
          <h2 className="mt-8 text-2xl font-bold">Contribute</h2>
          <p className="mt-1 text-muted">Code, docs, translations and design are all welcome. Start with the contributing guide and our code of conduct.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <ButtonLink to={`${REPO_URL}/blob/main/CONTRIBUTING.md`} variant="secondary" size="sm">Contributing guide</ButtonLink>
            <ButtonLink to={`${REPO_URL}/blob/main/CODE_OF_CONDUCT.md`} variant="secondary" size="sm">Code of conduct</ButtonLink>
            <ButtonLink to="/brand" variant="secondary" size="sm">Brand assets</ButtonLink>
          </div>
        </section>
      </div>
    </div>
  );
}
