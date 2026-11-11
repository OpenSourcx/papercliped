import { useEffect } from "react";
import tools from "../generated/tools.json";
import { CodeBlock } from "../components/CodeBlock";
import { Accordion } from "../components/Accordion";
import { Mascot } from "../components/Mascot";
import { Tabs } from "../components/Tabs";
import { ThemePicker } from "../components/ThemePicker";
import { useToast } from "../components/Toast";
import { Badge, Button, ButtonLink, Callout, Card, Field, Stat, Table, Tag, TextLink } from "../components/ui";
import { contrast } from "../theme/contrast";
import { PALETTES, THEME_IDS, type Tokens } from "../theme/palettes";
import { seasonOf } from "../theme/rotation";
import { usePageTitle } from "./usePageTitle";

const SWATCHES: (keyof Tokens)[] = ["bg", "surface", "ink", "muted", "line", "field", "accent", "accentInk", "link", "ring"];

/** The component kit and every theme, on one page: the reference for anyone building the site. */
export function Kit() {
  usePageTitle("Design kit");
  useEffect(() => {
    const m = document.createElement("meta");
    m.name = "robots";
    m.content = "noindex, nofollow";
    document.head.appendChild(m);
    return () => m.remove();
  }, []);
  const toast = useToast();
  const season = seasonOf(new Date()).season;
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-center gap-4">
        <Mascot size={72} />
        <div>
          <h1 className="text-4xl font-bold">Design kit</h1>
          <p className="text-muted">Components, type and every theme. It's {season} now, so the site rotates through the {season} palettes.</p>
        </div>
      </div>

      <section className="mt-10" aria-labelledby="k-theme">
        <h2 id="k-theme" className="text-2xl font-bold">Theme</h2>
        <div className="mt-3"><ThemePicker /></div>
      </section>

      <section className="mt-10" aria-labelledby="k-type">
        <h2 id="k-type" className="text-2xl font-bold">Type</h2>
        <p className="mt-2 font-display text-5xl font-bold lowercase">papercliped</p>
        <p className="font-display text-3xl font-semibold">Bricolage Grotesque for headlines</p>
        <p className="text-lg">Inter for body text and the interface. The quick brown fox jumps over the lazy dog.</p>
        <p className="font-mono">JetBrains Mono for code and keys: pcs_ABCD-EFGH-1234</p>
      </section>

      <section className="mt-10" aria-labelledby="k-buttons">
        <h2 id="k-buttons" className="text-2xl font-bold">Buttons, links, tags</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button size="sm">Small</Button>
          <Button disabled>Disabled</Button>
          <ButtonLink to="/docs" variant="secondary">Button link</ButtonLink>
          <TextLink to="/docs">A text link</TextLink>
          <Tag>tag</Tag>
          <Badge>New</Badge>
          <Badge tone="outline">Beta</Badge>
          <Button variant="secondary" onClick={() => toast("Saved. This is a toast.")}>Show a toast</Button>
        </div>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-3" aria-labelledby="k-cards">
        <h2 id="k-cards" className="sr-only">Cards and stats</h2>
        <Card><h3 className="text-lg font-bold">Card</h3><p className="text-muted">Surfaces sit on the page background with a hairline border.</p></Card>
        <Stat label="Users (example)" value="42" hint="Example value, not live data" />
        <Stat label="Tools" value={String(tools.length)} hint="One catalogue for every surface" />
      </section>

      <section className="mt-10 max-w-md" aria-labelledby="k-form">
        <h2 id="k-form" className="text-2xl font-bold">Fields</h2>
        <div className="mt-3 space-y-4">
          <Field label="Your Paperclip's address" placeholder="https://workforce.example.com" hint="Public https:// address only." />
          <Field label="Username" defaultValue="og" error="Usernames need at least 6 characters." />
        </div>
      </section>

      <section className="mt-10" aria-labelledby="k-callouts">
        <h2 id="k-callouts" className="text-2xl font-bold">Callouts</h2>
        <Callout kind="note">Read only is the default level.</Callout>
        <Callout kind="tip">Use a dedicated Paperclip user for the connection.</Callout>
        <Callout kind="warning">Your secret key is shown once.</Callout>
      </section>

      <section className="mt-10" aria-labelledby="k-code">
        <h2 id="k-code" className="text-2xl font-bold">Code</h2>
        <CodeBlock label="Claude Code" code="claude mcp add --transport http papercliped https://mcp.papercliped.co/mcp" />
        <Tabs label="Install" tabs={[
          { id: "claude", label: "Claude", content: <p>Settings → Connectors → Add custom connector → <code className="font-mono">https://mcp.papercliped.co/mcp</code></p> },
          { id: "code", label: "Claude Code", content: <CodeBlock code="/plugin marketplace add OpenSourcx/papercliped" /> },
          { id: "npm", label: "npm", content: <CodeBlock code="npx papercliped@latest" /> },
        ]} />
      </section>

      <section className="mt-10" aria-labelledby="k-faq">
        <h2 id="k-faq" className="text-2xl font-bold">Accordion</h2>
        <div className="mt-3"><Accordion items={[{ q: "Is it free?", a: "Yes. Papercliped is free and open source (MIT)." }, { q: "Does it read my Paperclip?", a: "Only what your connected AI app asks for, at the level you chose." }]} /></div>
      </section>

      <section className="mt-10" aria-labelledby="k-palettes">
        <h2 id="k-palettes" className="text-2xl font-bold">Palettes</h2>
        <p className="text-muted">Every pair used for text is at least 4.5:1, and every control or focus colour at least 3:1 (checked in CI).</p>
        <div className="mt-4">
          <Table caption="Themes and their ink contrast" head={["Theme", "Season", "Light swatches", "Dark swatches", "Ink on page"]} rows={THEME_IDS.map((id) => {
            const p = PALETTES[id];
            const sw = (t: Tokens, mode: "light" | "dark") => <span className="flex flex-wrap gap-1">{SWATCHES.map((k) => <span key={k} title={`${k} ${t[k]}`} className={`inline-block h-5 w-5 rounded border border-line swatch-${id}-${mode}-${k}`} />)}</span>;
            return [p.name, p.season, sw(p.light, "light"), sw(p.dark, "dark"), `${contrast(p.light.ink, p.light.bg).toFixed(1)} / ${contrast(p.dark.ink, p.dark.bg).toFixed(1)}`];
          })} />
        </div>
      </section>
    </div>
  );
}
