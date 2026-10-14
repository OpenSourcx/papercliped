import { AppLink } from "../components/AppLink";
import { Accordion } from "../components/Accordion";
import { CodeBlock } from "../components/CodeBlock";
import { CountUp } from "../components/CountUp";
import { GitHubIcon } from "../components/Layout";
import { Icon } from "../components/Icons";
import { HeroDemo } from "../components/HeroDemo";
import { Playground } from "../components/Playground";
import { Stepper } from "../components/Stepper";
import { ButtonLink, Card, TextLink } from "../components/ui";
import { community } from "../config/community";
import tools from "../generated/tools.json";
import { useLiveStats } from "../lib/useLiveStats";
import { usePageTitle } from "./usePageTitle";

const MCP_URL = "https://mcp.papercliped.co/mcp";

function Section({ id, eyebrow, title, lede, children }: { id: string; eyebrow: string; title: string; lede?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">{eyebrow}</p>
        <h2 id={`${id}-h`} className="mt-3 text-4xl font-bold leading-[1.05] tracking-tighter sm:text-5xl">{title}</h2>
        {lede && <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">{lede}</p>}
      </div>
      <div className="mt-12">{children}</div>
    </section>
  );
}

const APPS = ["Claude", "Claude Code", "ChatGPT", "Any MCP app", "npm", "Paperclip plugin"];

const SECURITY = [
  { t: "You approve it in your Paperclip", d: "Sign-in happens on your own Paperclip. No passwords pass through Papercliped." },
  { t: "Scoped, revocable access", d: "Read only by default. Change the level or disconnect any app at any time, effective on its next request." },
  { t: "Keys stay sealed", d: "Paperclip keys are encrypted at rest; tokens and secret keys are stored only as one-way hashes." },
  { t: "Guarded egress", d: "Only public https Paperclip addresses are reachable, so the bridge can't be pointed at private networks." },
  { t: "No trackers", d: "No analytics, no ads, no third-party scripts on this site." },
  { t: "Open source", d: "MIT licensed. Read the code, run it yourself, or send a fix." },
];

const FAQ = [
  { q: "Is Papercliped free?", a: "Yes. It's free and open source (MIT). The hosted bridge at papercliped.co runs the same code you can run yourself." },
  { q: "What is Paperclip?", a: "Paperclip is an open-source orchestrator for companies of AI agents. Papercliped is an independent project that connects AI apps to your Paperclip; it isn't made by the Paperclip team." },
  { q: "What can the AI do with my Paperclip?", a: <>Only what the level you pick allows: Read only by default, Full control if you choose it. Try the playground above, and see <TextLink to="/docs/permissions">Permissions</TextLink>.</> },
  { q: "Does my Paperclip need to be public?", a: <>For the hosted bridge, yes: a public https address. Step-by-step guides for running it at home, on a VPS, Railway, Render, Fly.io or Coolify: <TextLink to="/docs/hosting">Host your Paperclip</TextLink>. Or run Papercliped locally with <code className="font-mono">npx papercliped@latest</code>.</> },
  { q: "Can I stop it any time?", a: <>Yes. Disconnect an app or change its level in the <TextLink to="/docs/paperclip-plugin">Paperclip plugin</TextLink>, remove the connector in your AI app, or revoke the key in Paperclip.</> },
  { q: "Which AI apps work?", a: <>Claude (web, desktop, mobile, Claude Code), ChatGPT, and any app that supports MCP. See <TextLink to="/docs/other-ai-apps">Any AI app</TextLink>.</> },
];

export function Home() {
  usePageTitle("");
  const stats = useLiveStats();
  return (
    <>
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="hero-glow" />
        <div className="relative mx-auto max-w-5xl px-4 pt-14 text-center sm:pt-20">
          <AppLink to="/changelog" className="group inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 py-1 pl-1.5 pr-3 text-sm font-medium transition-colors hover:border-field">
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-ink">v2</span>
            Free and open source
            <Icon name="chevron" size={14} className="text-muted transition-transform group-hover:translate-x-0.5" />
          </AppLink>
          <h1 className="mx-auto mt-7 max-w-4xl text-5xl font-bold leading-[0.95] tracking-tighter sm:text-7xl lg:text-[5.5rem]">Your Paperclip, in every AI&nbsp;app.</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted sm:text-xl">Connect Claude, ChatGPT or any MCP app to your Paperclip. Check on agents, steer the work and get reports, at the access level you choose.</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <ButtonLink to="/docs/getting-started" size="lg">Get started</ButtonLink>
            <ButtonLink to={community.github} variant="secondary" size="lg"><GitHubIcon /> Star on GitHub</ButtonLink>
          </div>
        </div>
        <div className="mx-auto mt-12 max-w-5xl px-4 sm:mt-16"><HeroDemo /></div>
        <div className="relative mt-16 border-y border-line bg-bg">
          <dl className="mx-auto grid max-w-4xl grid-cols-3 divide-x divide-line text-center">
            <div className="px-2 py-6"><dt className="text-xs text-muted sm:text-sm">People connected</dt><dd className="font-display text-3xl font-bold tracking-tight sm:text-4xl"><CountUp value={stats?.users ?? null} /></dd></div>
            <div className="px-2 py-6"><dt className="text-xs text-muted sm:text-sm">Live connections</dt><dd className="font-display text-3xl font-bold tracking-tight sm:text-4xl"><CountUp value={stats?.connections ?? null} /></dd></div>
            <div className="px-2 py-6"><dt className="text-xs text-muted sm:text-sm">Tools</dt><dd className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{tools.length}</dd></div>
          </dl>
        </div>
        <ul aria-label="Works with" className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-3 px-4 py-8 text-sm font-medium">
          <li className="mr-2 text-xs font-bold uppercase tracking-[0.2em] text-muted">Works with</li>
          {APPS.map((a) => <li key={a} className="rounded-full border border-line px-3.5 py-1.5 transition-transform duration-150 hover:-translate-y-0.5 hover:rotate-[-2deg]">{a}</li>)}
        </ul>
      </section>

      <Section id="how" eyebrow="How it works" title="Three steps, about a minute" lede="You keep control the whole way: you approve the connection in your own Paperclip and choose what the AI may do.">
        <div className="mx-auto max-w-3xl">
          <Stepper steps={[
            { title: "Add the connector", body: <><p>In Claude open <strong>Settings → Connectors → Add custom connector</strong> and paste the address. ChatGPT and other MCP apps work the same way.</p><CodeBlock code={MCP_URL} /></> },
            { title: "Connect your Paperclip", body: <p>Enter your Paperclip's public address and approve the request inside your Paperclip. Pick a username and save the secret key you're shown once.</p> },
            { title: "Choose the level, then ask", body: <p>Leave it on <strong>Read only</strong> or pick <strong>Full control</strong>. Then ask: “What are my agents working on?” or “Pause the agent that's over budget.”</p> },
          ]} />
        </div>
      </Section>

      <Section id="playground" eyebrow="Permission playground" title="See exactly what the AI can do" lede="Every tool, and the level it needs. Switch levels to see what changes.">
        <Playground />
      </Section>

      <Section id="plugins" eyebrow="Two plugins, one service" title="From your AI app, or from inside Paperclip">
        <div className="grid gap-4 md:grid-cols-2">
          <Card interactive className="p-7">
            <h3 className="text-2xl font-bold tracking-tight">Papercliped for AI apps</h3>
            <p className="mt-2 text-muted">The main one. Claude, ChatGPT or any MCP client gets {tools.length} tools to control and report on your Paperclip. Hosted at papercliped.co, or run it yourself.</p>
            <div className="mt-5 flex flex-wrap gap-3"><ButtonLink to="/docs/getting-started" size="sm">Get started</ButtonLink><ButtonLink to="/docs/other-ai-apps" size="sm" variant="secondary">Any AI app</ButtonLink></div>
          </Card>
          <Card interactive className="p-7">
            <h3 className="text-2xl font-bold tracking-tight">Papercliped plugin for Paperclip <span className="align-middle text-xs font-bold uppercase text-muted">beta</span></h3>
            <p className="mt-2 text-muted">Manage everything from inside Paperclip: connected apps and their level, privacy, and your account.</p>
            <div className="mt-5"><ButtonLink to="/docs/paperclip-plugin" size="sm" variant="secondary">Paperclip plugin</ButtonLink></div>
          </Card>
        </div>
      </Section>

      <Section id="security" eyebrow="Security" title="Built to be trusted with your agents">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SECURITY.map((s) => <Card as="li" interactive key={s.t}><h3 className="font-sans text-lg font-bold">{s.t}</h3><p className="mt-1 text-muted">{s.d}</p></Card>)}
        </ul>
        <p className="mt-8 text-center"><TextLink to="/docs/security">Read the security model</TextLink></p>
      </Section>

      <section aria-labelledby="cta-h" className="mx-auto max-w-6xl px-4 py-12">
        <div className="relative overflow-hidden rounded-[2rem] border border-line bg-surface px-6 py-14 text-center sm:px-12 sm:py-20">
          <h2 id="cta-h" className="relative text-4xl font-bold tracking-tighter sm:text-5xl">Build it with us</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-lg text-muted">Papercliped is a community project. Suggest a feature, report a bug, or send a pull request.</p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink to="/community" size="lg">Join the community</ButtonLink>
            <ButtonLink to="/docs" size="lg" variant="secondary">Read the docs</ButtonLink>
          </div>
        </div>
      </section>

      <Section id="faq" eyebrow="FAQ" title="Questions people ask">
        <div className="mx-auto max-w-3xl"><Accordion items={FAQ} /></div>
      </Section>
    </>
  );
}
