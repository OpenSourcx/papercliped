import { AppLink } from "../components/AppLink";
import { PinStage } from "../components/PinStage";
import { ButtonLink, TextLink } from "../components/ui";
import { usePageTitle } from "./usePageTitle";

const FAMILY = [
  {
    number: "01", name: "ePaperclip", eyebrow: "THE SYSTEM", path: "/epaperclip",
    title: "Your homelab. One beautiful home.",
    desc: "A Proxmox-native control center for machines, storage, backups, AI workers and the projects they run. Built for the hardware you already own.",
    action: "Explore ePaperclip",
  },
  {
    number: "02", name: "Pin", eyebrow: "THE COMPANION", path: "/pin",
    title: "Ask once. Keep building.",
    desc: "Your personal system companion for understanding what is happening, planning what comes next, and getting help without hunting through dashboards.",
    action: "Meet Pin",
  },
  {
    number: "03", name: "Papercliped", eyebrow: "THE CONNECTION", path: "/papercliped",
    title: "Every AI app, on your terms.",
    desc: "Bring Claude, ChatGPT, Codex and other MCP clients to your Paperclip. Grant only the access you want and see what each connection does.",
    action: "Explore Papercliped",
  },
  {
    number: "04", name: "Connect", eyebrow: "THE WAY HOME", path: "/connect",
    title: "Your machine. Wherever you are.",
    desc: "The managed remote-access experience: one Papercliped account, device pairing, and a secure path back to your own hardware.",
    action: "Discover Connect",
  },
] as const;

export function Home() {
  usePageTitle("");
  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div aria-hidden="true" className="v2-hero-light" />
        <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-12 sm:pb-24 sm:pt-20">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-line bg-bg/75 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-muted">
            <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
            One system. Your machines. Your rules.
          </div>
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div>
              <p className="mb-4 text-sm font-bold uppercase tracking-[0.20em] text-muted">Meet ePaperclip and Pin</p>
              <h1 className="max-w-3xl text-[clamp(3.7rem,7vw,7.5rem)] font-bold leading-[.91] tracking-[-.065em]">
                The power<br />of the <span className="v2-pin-text">Pin.</span>
              </h1>
              <p className="mt-7 max-w-xl text-[clamp(1.35rem,2.5vw,1.9rem)] font-semibold leading-tight tracking-tight">
                Use your homelab to the fullest.
              </p>
              <p className="mt-4 max-w-lg text-lg leading-relaxed text-muted">
                Your servers have potential. Give them a thoughtful home, a team of AI workers, and a companion who makes it all feel simple.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <ButtonLink to="/epaperclip" size="lg">Use ePaperclip <span aria-hidden="true">↗</span></ButtonLink>
                <ButtonLink to="/pin" size="lg" variant="secondary">Meet Pin</ButtonLink>
              </div>
              <p className="mt-4 max-w-lg text-xs text-muted">
                ePaperclip is available as release-candidate software for Proxmox. Real-host validation and selected integrations are still underway.
              </p>
            </div>
            <div className="min-w-0">
              <PinStage />
            </div>
          </div>
          <div className="mt-16 grid gap-3 border-t border-line pt-7 text-sm text-muted sm:grid-cols-3">
            <p><strong className="text-ink">Self-hosted</strong> at the center.</p>
            <p><strong className="text-ink">AI-assisted</strong> by design.</p>
            <p><strong className="text-ink">Yours to control</strong>, always.</p>
          </div>
        </div>
      </section>

      <section id="platform" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-20 sm:py-28">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-muted">The Papercliped family</p>
            <h2 className="mt-3 text-4xl font-bold leading-tight tracking-tighter sm:text-6xl">Four parts. One connected idea.</h2>
            <p className="mt-4 max-w-2xl text-lg text-muted">Not another layer of tabs. A system that brings the machine, the work, the intelligence, and the connection together.</p>
          </div>
          <TextLink to="/epaperclip">Start with ePaperclip</TextLink>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {FAMILY.map((p) => (
            <article key={p.name} className="v2-family-card group relative flex min-h-[20rem] flex-col overflow-hidden rounded-[1.75rem] border border-line bg-surface p-7 sm:p-9">
              <div className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-[.16em] text-muted">
                <span>{p.eyebrow}</span><span>{p.number} / 04</span>
              </div>
              <h3 className="mt-10 text-3xl font-bold tracking-tighter sm:text-4xl">{p.name}</h3>
              <p className="mt-2 text-xl font-semibold leading-tight tracking-tight">{p.title}</p>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">{p.desc}</p>
              <AppLink to={p.path} className="mt-auto inline-flex w-fit items-center gap-2 pt-8 text-sm font-bold text-ink underline decoration-line underline-offset-4 transition-transform group-hover:translate-x-1">
                {p.action} <span aria-hidden="true">↗</span>
              </AppLink>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 md:grid-cols-2 sm:py-28">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.2em] text-muted">You own the foundation</p>
            <h2 className="mt-4 text-4xl font-bold leading-tight tracking-tighter sm:text-5xl">Make room for the things you want to build.</h2>
            <p className="mt-5 max-w-lg text-lg text-muted">Host a project. Start a dev environment. Follow a backup. Give an agent its own container. ePaperclip brings the pieces into focus without asking you to surrender your hardware.</p>
            <div className="mt-7"><ButtonLink to="/epaperclip" variant="secondary">See the system <span aria-hidden="true">↗</span></ButtonLink></div>
          </div>
          <div className="overflow-hidden rounded-[1.75rem] border border-line bg-bg p-4 shadow-xl sm:p-6">
            <div className="flex items-center justify-between border-b border-line pb-4 text-sm">
              <span className="font-display font-bold">Your place, from one place.</span><span className="font-mono text-xs text-muted">PREVIEW</span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                { t: "Machines", d: "VMs and containers" },
                { t: "Storage", d: "Drives, images and backups" },
                { t: "Companies", d: "Goals, agents and projects" },
                { t: "Access", d: "People, grants and sessions" },
              ].map((it) => (
                <div key={it.t} className="min-h-28 rounded-2xl border border-line bg-surface p-4">
                  <div className="mb-6 h-1.5 w-8 rounded-full bg-accent" aria-hidden="true" />
                  <p className="font-display text-lg font-bold">{it.t}</p><p className="mt-1 text-sm text-muted">{it.d}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted">Illustrative interface overview, not a connected host.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:py-28">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-muted">From homelab to home base</p>
          <h2 className="mt-3 text-4xl font-bold leading-tight tracking-tighter sm:text-5xl">Start local. Go further when you're ready.</h2>
        </div>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {[
            { n: "01", t: "Bring your Proxmox host", d: "Install ePaperclip on a supported host and keep the original Proxmox interface as your fallback." },
            { n: "02", t: "Make it your own", d: "Set up your machines, access, connectors, and the organizations you want to operate." },
            { n: "03", t: "Give Pin a purpose", d: "Explore ideas, review plans, and grow toward policy-bound automation and agent workflows." },
          ].map((it) => (
            <div key={it.n} className="border-t border-line pt-5">
              <span className="font-mono text-sm text-muted">{it.n}</span>
              <h3 className="mt-6 text-2xl font-bold tracking-tight">{it.t}</h3>
              <p className="mt-3 text-muted">{it.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-24">
        <div className="v2-final-panel rounded-[2rem] border border-line p-8 text-center sm:px-10 sm:py-20">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-muted">Your hardware. Your possibilities.</p>
          <h2 className="mx-auto mt-4 max-w-3xl text-4xl font-bold leading-[1.05] tracking-tighter sm:text-6xl">You've already built the homelab. Now make it yours.</h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted">Start with ePaperclip. Bring your own models, projects and ideas. Pin will be right there with you.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink to="/epaperclip" size="lg">Use ePaperclip</ButtonLink>
            <ButtonLink to="/papercliped" size="lg" variant="secondary">Connect an AI app</ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}