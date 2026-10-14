import { AppLink } from "../components/AppLink";
import { Mascot } from "../components/Mascot";
import { ButtonLink, Card, Table } from "../components/ui";
import { PALETTES } from "../theme/palettes";
import { usePageTitle } from "./usePageTitle";

const ASSETS = [
  { file: "/brand/icons/avatar-light-1024.png", label: "Profile picture (PNG)" },
  { file: "/brand/icons/x-header-light-1500x500.png", label: "X header (PNG)" },
  { file: "/brand/icons/banner-light-960x540.png", label: "Banner 16:9 (PNG)" },
  { file: "/brand/mascot-light.svg", label: "Mascot, light (SVG)" },
  { file: "/brand/mascot-dark.svg", label: "Mascot, dark (SVG)" },
  { file: "/brand/wordmark-light.png", label: "Wordmark, light (PNG)" },
  { file: "/brand/wordmark-dark.png", label: "Wordmark, dark (PNG)" },
];

/** Ready-to-post cards for announcements and the community (built by scripts/community-cards.mjs). */
const CARDS = [
  { name: "papercliped-launch", label: "Launch announcement" },
  { name: "opensourcedd-welcome", label: "r/OpenSourcedd welcome" },
];

/** The OpenSourcedd community kit (also built by scripts/community-cards.mjs). Light and dark of each. */
const OPENSOURCEDD = [
  { file: "opensourcedd/opensourcedd-avatar", size: "-1024", label: "Profile picture (Reddit, Discord, X, GitHub)" },
  { file: "opensourcedd/opensourcedd-icon", size: "-1024", label: "Rounded icon" },
  { file: "opensourcedd/opensourcedd-discord-banner", size: "", label: "Discord banner" },
  { file: "opensourcedd/opensourcedd-x-header", size: "", label: "X header" },
  { file: "community/opensourcedd-reddit-banner", size: "", label: "Reddit banner (desktop)" },
  { file: "community/opensourcedd-reddit-banner-mobile", size: "", label: "Reddit banner (app)" },
];

export function Brand() {
  usePageTitle("Brand assets");
  const c = PALETTES.clip;
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
      <h1 className="text-4xl font-bold sm:text-5xl">Brand assets</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted">Writing about Papercliped, making a video, or building something on top? Use these. They're free to use for talking about the project.</p>

      <section aria-labelledby="dl-h" className="mt-10">
        <h2 id="dl-h" className="text-2xl font-bold">Downloads</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Card className="flex items-center gap-5">
            <Mascot size={88} hopOnClick />
            <div>
              <h3 className="font-sans text-lg font-bold">The mascot</h3>
              <p className="text-sm text-muted">A smiling paperclip. Keep its proportions and colours.</p>
            </div>
          </Card>
          <Card className="flex items-center gap-4">
            <span className="font-display text-5xl font-bold lowercase">papercliped</span>
          </Card>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a href="/brand/papercliped-icons.zip" download className="inline-flex h-11 items-center rounded-full bg-accent px-6 font-semibold text-accent-ink shadow-sm transition-transform duration-150 hover:-translate-y-0.5">Download the icon pack (ZIP)</a>
          <span className="text-sm text-muted">App icons from 16 to 1024 px, favicon, profile pictures, X header, banners and link previews, in light and dark.</span>
        </div>
        <ul className="mt-4 flex flex-wrap gap-3">
          {ASSETS.map((a) => <li key={a.file}><a href={a.file} download className="inline-flex h-10 items-center rounded-lg border border-field px-4 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5">{a.label}</a></li>)}
        </ul>
      </section>

      <section aria-labelledby="cards-h" className="mt-12">
        <h2 id="cards-h" className="text-2xl font-bold">Community cards</h2>
        <p className="mt-2 max-w-2xl text-muted">Ready-to-post images for Reddit, X and Discord, 1600×900. Use the dark one on dark feeds.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {CARDS.map((c) => (
            <Card key={c.name}>
              <img src={`/brand/community/${c.name}-dark.png`} alt={`${c.label} card`} width={1600} height={900} loading="lazy" className="h-auto w-full rounded-lg border border-line" />
              <h3 className="mt-3 font-sans text-lg font-bold">{c.label}</h3>
              <div className="mt-2 flex flex-wrap gap-3">
                {(["dark", "light"] as const).map((m) => <a key={m} href={`/brand/community/${c.name}-${m}.png`} download className="inline-flex h-10 items-center rounded-lg border border-field px-4 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5">{m === "dark" ? "Dark (PNG)" : "Light (PNG)"}</a>)}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="os-h" className="mt-12">
        <h2 id="os-h" className="text-2xl font-bold">OpenSourcedd</h2>
        <p className="mt-2 max-w-2xl text-muted">The community around Papercliped has its own mark: an open ring with the same face. Use these for OpenSourcedd on Reddit, Discord, X and GitHub.</p>
        <div className="mt-4 flex items-center gap-4">
          <img src="/brand/opensourcedd/opensourcedd-icon-light.svg" alt="OpenSourcedd mark" width={88} height={88} className="rounded-2xl border border-line" />
          <img src="/brand/opensourcedd/opensourcedd-icon-dark.svg" alt="" width={88} height={88} className="rounded-2xl border border-line" />
        </div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {OPENSOURCEDD.map((a) => (
            <li key={a.file} className="flex flex-wrap items-center gap-3">
              <span className="min-w-48 text-sm font-semibold">{a.label}</span>
              {(["light", "dark"] as const).map((m) => <a key={m} href={`/brand/${a.file}-${m}${a.size}.png`} download className="inline-flex h-9 items-center rounded-lg border border-field px-3 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5">{m === "light" ? "Light" : "Dark"}</a>)}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="use-h" className="mt-12 grid gap-4 md:grid-cols-2">
        <h2 id="use-h" className="sr-only">Usage</h2>
        <Card>
          <h3 className="font-sans text-lg font-bold">Please do</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            <li>Write the name as <strong className="text-ink">Papercliped</strong>: one word, capital P (the wordmark itself is lowercase).</li>
            <li>Leave clear space around the mascot of at least a quarter of its width.</li>
            <li>Use the light version on light backgrounds and the dark version on dark ones.</li>
            <li>Link to papercliped.co or the GitHub repository when you can.</li>
          </ul>
        </Card>
        <Card>
          <h3 className="font-sans text-lg font-bold">Please don't</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            <li>Stretch, recolour or redraw the mascot, or add effects to it.</li>
            <li>Suggest that Papercliped is made or endorsed by Paperclip. It's an independent project.</li>
            <li>Combine our marks with Paperclip's logo or other companies' logos.</li>
            <li>Use the name or mascot for a different product.</li>
          </ul>
        </Card>
      </section>

      <section aria-labelledby="col-h" className="mt-12">
        <h2 id="col-h" className="text-2xl font-bold">Colours and type</h2>
        <p className="mt-2 text-muted">The default "clip" theme. The site also rotates seasonal palettes; see the <AppLink className="text-link underline" to="/kit">design kit</AppLink>.</p>
        <div className="mt-4">
          <Table caption="Brand colours" head={["Role", "Light", "Dark"]} rows={[
            ["Background", c.light.bg, c.dark.bg], ["Ink (text)", c.light.ink, c.dark.ink], ["Brand olive / cream", c.light.accent, c.dark.accent], ["Muted text", c.light.muted, c.dark.muted],
          ].map(([role, l, d]) => [role, <span className="inline-flex items-center gap-2 font-mono"><span className={`inline-block h-4 w-4 rounded border border-line swatch-clip-light-${role === "Background" ? "bg" : role === "Ink (text)" ? "ink" : role === "Muted text" ? "muted" : "accent"}`} />{l}</span>, <span className="inline-flex items-center gap-2 font-mono"><span className={`inline-block h-4 w-4 rounded border border-line swatch-clip-dark-${role === "Background" ? "bg" : role === "Ink (text)" ? "ink" : role === "Muted text" ? "muted" : "accent"}`} />{d}</span>])} />
        </div>
        <p className="mt-4 text-muted">Type: <span className="font-display font-bold text-ink">Bricolage Grotesque</span> for headlines and the wordmark, <span className="font-semibold text-ink">Inter</span> for text, <span className="font-mono text-ink">JetBrains Mono</span> for code. All three are free under the SIL Open Font License.</p>
      </section>

      <div className="mt-12"><ButtonLink to="/community" variant="secondary">Back to the community</ButtonLink></div>
    </div>
  );
}
