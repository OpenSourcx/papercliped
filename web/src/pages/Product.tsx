import { AppLink } from "../components/AppLink";
import { PinStage } from "../components/PinStage";
import { Playground } from "../components/Playground";
import { HeroDemo } from "../components/HeroDemo";
import { ButtonLink, TextLink } from "../components/ui";
import { usePageTitle } from "./usePageTitle";

type ProductName = "epaperclip" | "pin" | "papercliped" | "connect";

type Story = {
  eyebrow: string;
  name: string;
  title: string;
  intro: string;
  hero: string;
  primary: { text: string; to: string };
  secondary: { text: string; to: string };
  reality: string;
  ideas: { title: string; description: string }[];
};

const STORIES: Record<ProductName, Story> = {
  epaperclip: {
    eyebrow: "01 / THE SYSTEM",
    name: "ePaperclip",
    title: "Use your homelab to the fullest.",
    intro: "The system built around the machine you already own. One beautiful interface for Proxmox, projects, AI agents, and the work waiting to happen.",
    hero: "Make your server feel like your space.",
    primary: { text: "Try ePaperclip", to: "https://github.com/OpenSourcx/papercliped-engine/blob/main/docs/USER-GUIDE.md" },
    secondary: { text: "Installation and release candidates", to: "https://github.com/OpenSourcx/papercliped-engine/blob/main/docs/INSTALL.md" },
    reality: "Release candidate. The installation path is documented, but complete real-host validation and live company/agent integration are still in progress. Follow the version-specific guide before installation.",
    ideas: [
      { title: "Your machines, in focus", description: "A single place to explore VMs, containers, storage, backups, networking and host activity." },
      { title: "Work has a home", description: "Companies, agents, projects and approvals are designed to live beside the machines that make them possible." },
      { title: "Safety isn't a setting you forget", description: "Keep Proxmox as the underlying engine and recovery console. Use brokered access, protected guests, and scoped agent resources." },
      { title: "Your setup, your style", description: "Themes, a practical command surface and the Pin companion make server management feel personal." },
    ],
  },
  pin: {
    eyebrow: "02 / THE COMPANION",
    name: "Pin",
    title: "The power of the Pin.",
    intro: "A little more personality for a very powerful machine. Pin helps you understand your infrastructure, think through the next move, and keep an eye on the things that matter.",
    hero: "Curious. Capable. On your side.",
    primary: { text: "Explore ePaperclip", to: "/epaperclip" },
    secondary: { text: "Read the Pin vision", to: "https://github.com/OpenSourcx/papercliped-engine/blob/main/docs/PIN.md" },
    reality: "The interactive demo is scripted. Pin's deterministic automations and interface exist; the full model-backed, persistent assistant and agent runtime remain in development.",
    ideas: [
      { title: "Assistant when you need context", description: "Start with questions, explanations, summaries, and suggestions. You decide what happens next." },
      { title: "Agent when there's work to do", description: "The target: scheduled, policy-bound actions with resource limits, approval gates, audit trails and cancellation." },
      { title: "A little memory", description: "SOUL.md and MEMORY.md define the direction for a companion that remembers your preferences and your system, with user control." },
      { title: "Playful, not distracting", description: "A responsive orb, purposeful motion and little moments of delight that never hide essential controls." },
    ],
  },
  papercliped: {
    eyebrow: "03 / THE CONNECTION",
    name: "Papercliped",
    title: "The AI app you love. The agents you run.",
    intro: "Connect Claude, ChatGPT, Codex or another MCP client to the Paperclip you operate. Check in, assign work and manage approvals without leaving the conversation.",
    hero: "One connection. Clear boundaries.",
    primary: { text: "Connect an AI app", to: "/docs/getting-started" },
    secondary: { text: "Explore the MCP tools", to: "/docs/tools" },
    reality: "The existing open-source Papercliped connector and control-room plugin are available today. Central-account sign-in across all products is being integrated separately.",
    ideas: [
      { title: "Any compatible AI client", description: "Use the hosted MCP gateway if your Paperclip has a public https address, or run the connector locally (stdio) or use ePaperclip's own MCP for a homelab. Remote access through Connect is future." },
      { title: "Choose the scope", description: "Read only or Full control, plus agent, tool and session-level access in the Paperclip plugin." },
      { title: "From question to action", description: "Reports, agent updates, issues, approvals and budgets through a conversational interface." },
      { title: "Your connections stay visible", description: "Review active sessions, change permissions, see blocked tool calls and revoke access." },
    ],
  },
  connect: {
    eyebrow: "04 / THE WAY HOME",
    name: "Papercliped Connect",
    title: "Your homelab. Wherever life takes you.",
    intro: "A managed route to your own ePaperclip machine: device registration, a stable address, and one account to find the systems that belong to you.",
    hero: "Remote should never mean giving up control.",
    primary: { text: "See how Connect works", to: "#connect-flow" },
    secondary: { text: "Explore ePaperclip", to: "/epaperclip" },
    reality: "Connect is pre-release. Portal, OIDC and pairing code exist, but managed device access, complete production sign-in and subscriptions are not yet offered as a finished public service.",
    ideas: [
      { title: "One place to sign in", description: "The shared Papercliped account is designed for MCP connections, devices and the hosted customer Console, without auto-merging identities by email." },
      { title: "Pair on both ends", description: "Account-owner confirmation and local Proxmox administrator approval are required before a device is associated." },
      { title: "Keep the keys at home", description: "Connect manages tunnel provisioning and account entitlements, not your local Proxmox administrator password or agent model tokens." },
      { title: "Disconnect cleanly", description: "Revoke remote access or return to a self-managed tunnel without disrupting local machine access." },
    ],
  },
};

const FLOW = [
  { n: "01", title: "Choose your system", desc: "Use ePaperclip locally or enable a managed access option when released." },
  { n: "02", title: "Prove it's yours", desc: "Sign in with your Papercliped identity and approve pairing from the device's own administrator." },
  { n: "03", title: "Come home", desc: "Access your host through a dedicated address and your device's own access controls." },
];

export function Product({ product }: { product: ProductName }) {
  const s = STORIES[product];
  usePageTitle(s.name);
  const isPin = product === "pin";
  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div aria-hidden="true" className="v2-hero-light" />
        <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-12 sm:pt-20">
          <AppLink to="/#platform" className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-ink"><span aria-hidden="true">←</span> The Papercliped family</AppLink>
          <div className="mt-10 grid items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.2em] text-muted">{s.eyebrow}</p>
              <h1 className="mt-4 text-[clamp(3.2rem,6.5vw,6.5rem)] font-bold leading-[.96] tracking-[-.055em]">{s.title}</h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">{s.intro}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink to={s.primary.to} size="lg">{s.primary.text} <span aria-hidden="true">↗</span></ButtonLink>
                <ButtonLink to={s.secondary.to} size="lg" variant="secondary">{s.secondary.text}</ButtonLink>
              </div>
              <p className="mt-5 max-w-xl border-l-2 border-accent pl-4 text-sm text-muted">{s.reality}</p>
            </div>
            <div className="min-w-0">
              {isPin ? <PinStage compact /> : (
                <div className="relative overflow-hidden rounded-[2rem] border border-line bg-surface p-6 shadow-xl sm:p-10">
                  <div className="absolute -right-14 -top-14 h-56 w-56 rounded-full opacity-20 blur-3xl" style={{ background: "var(--accent)" }} aria-hidden="true" />
                  <p className="relative text-xs font-semibold uppercase tracking-widest text-muted">{s.name} / Experience</p>
                  <h2 className="relative mt-8 max-w-md text-3xl font-bold leading-tight tracking-tighter sm:text-4xl">{s.hero}</h2>
                  <div className="relative mt-8 grid gap-3 sm:grid-cols-2">
                    {s.ideas.slice(0, 4).map((f, i) => (
                      <div className="min-h-32 rounded-2xl border border-line bg-bg p-4" key={f.title}>
                        <p className="font-mono text-xs text-muted">0{i + 1}</p>
                        <p className="mt-7 text-sm font-bold">{f.title}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-xs text-muted">Illustration of the product experience.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:py-28">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-muted">Designed around your world</p>
        <h2 className="mt-4 max-w-3xl text-4xl font-bold leading-tight tracking-tighter sm:text-5xl">
          {product === "epaperclip" ? "A capable system. A calmer experience."
            : product === "pin" ? "Useful help should feel natural."
            : product === "connect" ? "Connected without handing over the keys."
            : "Your choice of AI. Your choice of access."}
        </h2>
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {s.ideas.map((f) => (
            <article key={f.title} className="rounded-[1.5rem] border border-line bg-surface p-7">
              <h3 className="text-2xl font-bold tracking-tight">{f.title}</h3>
              <p className="mt-3 max-w-lg text-muted">{f.description}</p>
            </article>
          ))}
        </div>
      </section>

      {product === "papercliped" && (
        <section className="border-y border-line bg-surface">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:py-28">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-muted">It works with the tools you know</p>
            <h2 className="mt-3 text-4xl font-bold tracking-tighter sm:text-5xl">See the connection in action.</h2>
            <p className="mt-4 max-w-2xl text-muted">A guided example of the Papercliped MCP bridge. Sample conversations are illustrative; permissions always apply to actual tool calls.</p>
            <div className="mt-10"><HeroDemo /></div>
            <h3 className="mt-16 text-3xl font-bold tracking-tight">Explore every permission.</h3>
            <p className="mt-3 max-w-2xl text-muted">Switch between Read only and Full control to see which tools your AI app can use.</p>
            <div className="mt-8"><Playground /></div>
          </div>
        </section>
      )}
      {product === "connect" && (
        <section id="connect-flow" className="scroll-mt-20 border-y border-line bg-surface">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:py-28">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-muted">The sign-in and pairing journey</p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">One account. Two approvals. Your machine.</h2>
            <p className="mt-4 max-w-2xl text-muted">The intended V2 experience, shown here as a product flow. Completing hosted login does not grant Proxmox administrator privileges.</p>
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {FLOW.map((f) => (
                <div key={f.n} className="rounded-3xl border border-line bg-bg p-6">
                  <p className="font-mono text-sm text-muted">{f.n}</p>
                  <h3 className="mt-8 text-2xl font-bold">{f.title}</h3>
                  <p className="mt-3 text-muted">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
      <section className="mx-auto max-w-7xl px-4 py-20 text-center">
        <h2 className="mx-auto max-w-2xl text-4xl font-bold tracking-tighter sm:text-5xl">It all starts with a place to build.</h2>
        <p className="mx-auto mt-4 max-w-xl text-muted">A home for the hardware, an interface for the work, and a companion for everything in between.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink to="/epaperclip" size="lg">Use ePaperclip</ButtonLink>
          <ButtonLink to="/#platform" size="lg" variant="secondary">Explore the family</ButtonLink>
        </div>
        {product === "papercliped" && <p className="mt-7 text-sm text-muted">Already use Paperclip? <TextLink to="/docs/getting-started">Get connected now.</TextLink></p>}
      </section>
    </>
  );
}