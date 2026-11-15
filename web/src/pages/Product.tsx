import { HeroDemo } from "../components/HeroDemo";
import { OnView } from "../components/OnView";
import { PinStage } from "../components/PinStage";
import { Playground } from "../components/Playground";
import { ButtonLink, TextLink } from "../components/ui";
import { usePageTitle } from "./usePageTitle";

/** The three products other than ePaperclip (which has its own README-style page, Epaperclip.tsx). */
type ProductName = "pin" | "papercliped" | "connect";

type Story = {
  name: string;
  summary: string;
  status: string;
  primary: { text: string; to: string };
  secondary: { text: string; to: string };
  ideas: { title: string; description: string }[];
};

const STORIES: Record<ProductName, Story> = {
  pin: {
    name: "Pin",
    summary: "Pin is an optional assistant inside ePaperclip. It helps you understand your host, plan the next step and keep an eye on things, and it works within the permissions you give it.",
    status: "Preview. Pin's automations and interface exist; the full model-backed assistant and agent runtime are still in development. The demo below is scripted sample data.",
    primary: { text: "Install ePaperclip", to: "/epaperclip#install" },
    secondary: { text: "About ePaperclip", to: "/epaperclip" },
    ideas: [
      { title: "Assistant mode", description: "Ask questions, get explanations and summaries, and review suggestions. You decide what happens next." },
      { title: "Agent mode", description: "The target: scheduled, policy-bound actions with resource limits, approval gates, audit trails and cancellation." },
      { title: "A little memory", description: "SOUL.md and MEMORY.md define a companion that remembers your preferences and your system, under your control." },
      { title: "Needs a model", description: "Pin works once you connect an AI model of your choice. Without one, the rest of ePaperclip is unaffected." },
    ],
  },
  papercliped: {
    name: "Papercliped MCP",
    summary: "Connect Claude, ChatGPT, Codex or another MCP client to the Paperclip you operate: check in, assign work and manage approvals from the conversation. It is free and open source.",
    status: "Available. The open-source connector, the hosted gateway and the control-room plugin work today.",
    primary: { text: "Connect an AI app", to: "/docs/getting-started" },
    secondary: { text: "The MCP tools", to: "/docs/tools" },
    ideas: [
      { title: "Any compatible AI client", description: "Use the hosted gateway if your Paperclip has a public https address, run the connector locally, or use ePaperclip's own MCP on a homelab." },
      { title: "Choose the scope", description: "Read only or Full control, plus agent, tool and session-level access in the Paperclip plugin." },
      { title: "From question to action", description: "Reports, agent updates, issues, approvals and budgets, from the conversation." },
      { title: "Your connections stay visible", description: "Review active sessions, change permissions, see blocked tool calls and revoke access." },
    ],
  },
  connect: {
    name: "Papercliped Connect",
    summary: "A managed route to your own ePaperclip machine: one Papercliped account, registered devices and a dedicated address, without opening ports.",
    status: "Preview. The account portals and device linking work; managed device access and subscriptions are not yet offered as a finished public service.",
    primary: { text: "Link a computer", to: "/docs/link-a-device" },
    secondary: { text: "About ePaperclip", to: "/epaperclip" },
    ideas: [
      { title: "One place to sign in", description: "Email code, passkey, Google or GitHub, without merging identities by email." },
      { title: "Two approvals to link", description: "You approve on the website with a short code, and a Proxmox administrator confirms on the computer." },
      { title: "Keep the keys at home", description: "Connect manages the tunnel and your entitlements, not your Proxmox administrator password or your model tokens." },
      { title: "Disconnect cleanly", description: "Revoke remote access or return to a self-managed tunnel without disturbing local access." },
    ],
  },
};

const FLOW = [
  { title: "Choose your system", desc: "Use ePaperclip locally, or turn on managed access when it is released." },
  { title: "Prove it's yours", desc: "Sign in with your Papercliped account and approve the link; the computer's administrator confirms it." },
  { title: "Come home", desc: "Reach your host through a dedicated address, with the computer's own access controls still in force." },
];

export function Product({ product }: { product: ProductName }) {
  const s = STORIES[product];
  usePageTitle(s.name);
  return (
    <div>
      <section className="mx-auto max-w-5xl px-4 pb-10 pt-12 sm:pt-16">
        <h1 className="text-4xl font-semibold sm:text-5xl">{s.name}</h1>
        <p className="mt-5 max-w-3xl text-lg">{s.summary}</p>
        <p className="mt-4 max-w-3xl rounded-lg border border-line p-4 text-sm text-muted">{s.status}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink to={s.primary.to}>{s.primary.text}</ButtonLink>
          <ButtonLink to={s.secondary.to} variant="secondary">{s.secondary.text}</ButtonLink>
        </div>
      </section>

      {product === "pin" && (
        <section className="border-y border-line bg-surface" aria-labelledby="pin-demo-h">
          <div className="mx-auto max-w-5xl px-4 py-14">
            <h2 id="pin-demo-h" className="text-2xl font-semibold">A scripted preview</h2>
            <p className="mt-2 max-w-2xl text-muted">Sample conversations, not a live model. Click the orb to step through them.</p>
            <div className="mt-6">
              <OnView minHeight={420} fallback={<p className="rounded-lg border border-line p-4 text-sm text-muted">The animated preview is off because your device asks for reduced motion.</p>}>
                <PinStage compact />
              </OnView>
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-5xl px-4 py-14" aria-labelledby="ideas-h">
        <h2 id="ideas-h" className="text-2xl font-semibold">What it does</h2>
        <dl className="mt-6 grid gap-6 sm:grid-cols-2">
          {s.ideas.map((i) => (
            <div key={i.title}>
              <dt className="font-semibold">{i.title}</dt>
              <dd className="mt-1 text-muted">{i.description}</dd>
            </div>
          ))}
        </dl>
      </section>

      {product === "papercliped" && (
        <section className="border-y border-line bg-surface" aria-labelledby="mcp-demo-h">
          <div className="mx-auto max-w-5xl px-4 py-14">
            <h2 id="mcp-demo-h" className="text-2xl font-semibold">See the connection</h2>
            <p className="mt-2 max-w-2xl text-muted">A guided example. The conversations are illustrative; permissions always apply to real tool calls.</p>
            <div className="mt-6"><OnView minHeight={360}><HeroDemo /></OnView></div>
            <h3 className="mt-12 text-xl font-semibold">Every permission</h3>
            <p className="mt-2 max-w-2xl text-muted">Switch between Read only and Full control to see which tools your AI app can use.</p>
            <div className="mt-6"><Playground /></div>
          </div>
        </section>
      )}

      {product === "connect" && (
        <section id="connect-flow" className="scroll-mt-20 border-y border-line bg-surface" aria-labelledby="flow-h">
          <div className="mx-auto max-w-5xl px-4 py-14">
            <h2 id="flow-h" className="text-2xl font-semibold">How linking works</h2>
            <p className="mt-2 max-w-2xl text-muted">Signing in to Papercliped never grants Proxmox administrator rights.</p>
            <ol className="mt-6 grid gap-4 md:grid-cols-3">
              {FLOW.map((f, i) => (
                <li key={f.title} className="rounded-lg border border-line bg-bg p-5">
                  <h3 className="font-semibold">{i + 1}. {f.title}</h3>
                  <p className="mt-2 text-muted">{f.desc}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-5xl px-4 py-14">
        <p className="text-muted">Everything we are building, and where each part stands, is on the <TextLink to="/roadmap">roadmap</TextLink>.</p>
      </section>
    </div>
  );
}
