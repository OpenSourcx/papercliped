import { AppLink } from "./AppLink";
import { CodeBlock } from "./CodeBlock";
import { Tabs } from "./Tabs";

const APT = `curl -fsSL https://apt.papercliped.co/epaperclip-archive-keyring.gpg \\
  -o /usr/share/keyrings/epaperclip-archive-keyring.gpg
gpg --show-keys /usr/share/keyrings/epaperclip-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/epaperclip-archive-keyring.gpg] https://apt.papercliped.co stable main" \\
  > /etc/apt/sources.list.d/epaperclip.list
apt update
apt install epaperclip`;

const REQUIREMENTS: { label: string; value: string }[] = [
  { label: "Proxmox", value: "VE 8 or newer, with root access (the web shell works)" },
  { label: "Memory", value: "4 GB recommended (2 GB minimum)" },
  { label: "Disk", value: "About 3 GB free" },
  { label: "Network", value: "Internet during the install" },
];

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <li className="flex gap-3">
    <span aria-hidden="true" className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-ink">{n}</span>
    <div className="min-w-0 flex-1">{children}</div>
  </li>
);

/**
 * "Download" for ePaperclip, in the spirit of python.org and nodejs.org: what you need, the one command for your situation,
 * how to check it worked, and what to do next. The full guide lives on the docs site, not on GitHub.
 */
export function InstallEpaperclip() {
  const tabs = [
    {
      id: "apt",
      label: "apt (recommended)",
      content: (
        <ol className="space-y-4">
          <Step n={1}>
            <p className="font-medium">Add ePaperclip's signed package repository and install it.</p>
            <p className="mt-1 text-sm text-muted">Run these as root on the Proxmox host (Proxmox → your node → Shell).</p>
            <CodeBlock code={APT} />
            <p className="text-sm text-muted">The second command prints the key's fingerprint. It must read <code className="font-mono text-ink">2DC0 0D1A 1A87 1018 F797 E7CE F565 5E1B 9FA7 5813</code>. If it doesn't, stop.</p>
          </Step>
          <Step n={2}>
            <p className="font-medium">Check it's running.</p>
            <CodeBlock code="epaperclip status" />
          </Step>
          <Step n={3}>
            <p className="font-medium">Open <code className="font-mono">https://&lt;your-host&gt;/</code> in a browser and sign in with your Proxmox account.</p>
            <p className="mt-1 text-sm text-muted">Updates arrive with the rest of your system: <code className="font-mono">apt update &amp;&amp; apt upgrade</code>.</p>
          </Step>
        </ol>
      ),
    },
    {
      id: "npm",
      label: "npm",
      content: (
        <ol className="space-y-4">
          <Step n={1}>
            <p className="font-medium">On a host with Node.js 18 or newer, run the installer.</p>
            <CodeBlock code="npx epaperclip install" />
            <p className="text-sm text-muted">Or <code className="font-mono">npm install -g epaperclip</code>, then <code className="font-mono">epaperclip install</code>. Your Node.js only starts the installer; ePaperclip runs on its own.</p>
          </Step>
          <Step n={2}>
            <p className="font-medium">Check it's running, then sign in.</p>
            <CodeBlock code="epaperclip status" />
            <p className="text-sm text-muted">Open <code className="font-mono">https://&lt;your-host&gt;/</code> and sign in with your Proxmox account. To upgrade later: <code className="font-mono">npx epaperclip@latest install</code>.</p>
          </Step>
        </ol>
      ),
    },
    {
      id: "script",
      label: "One command",
      content: (
        <ol className="space-y-4">
          <Step n={1}>
            <p className="font-medium">Download, verify and install the latest release.</p>
            <CodeBlock code="curl -fsSL https://github.com/OpenSourcx/papercliped-engine/releases/latest/download/get.sh | bash" />
            <p className="text-sm text-muted">The release's signature and checksum are checked before anything is unpacked or run.</p>
          </Step>
          <Step n={2}>
            <p className="font-medium">Check it's running, then sign in.</p>
            <CodeBlock code="epaperclip status" />
          </Step>
        </ol>
      ),
    },
    {
      id: "worker",
      label: "Add a worker machine",
      content: (
        <ol className="space-y-4">
          <Step n={1}>
            <p className="font-medium">On another Linux machine with Node.js 22 or newer, install the worker.</p>
            <CodeBlock code={"npm install -g epaperclip\nsudo epaperclip --worker"} />
            <p className="text-sm text-muted">A worker connects out to your host, opens no port and holds no Proxmox credentials.</p>
          </Step>
          <Step n={2}>
            <p className="font-medium">In the ePaperclip console choose <strong>Workers → Add worker</strong>, copy the pairing code and pair.</p>
            <CodeBlock code="sudo epaperclip --worker connect <code>" />
          </Step>
        </ol>
      ),
    },
  ];

  return (
    <section id="install" className="scroll-mt-20 border-b border-line bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:py-24">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-muted">Install</p>
        <h2 className="mt-3 text-4xl font-bold tracking-tighter sm:text-5xl">Get ePaperclip running in a few minutes.</h2>
        <p className="mt-4 max-w-2xl text-muted">It installs on your Proxmox host and never reimages or repartitions anything. Try it on a test node first if you can.</p>
        <div className="mt-10 grid gap-8 lg:grid-cols-[18rem_1fr]">
          <aside aria-label="What you need" className="h-fit rounded-3xl border border-line bg-bg p-6">
            <h3 className="text-lg font-bold">What you need</h3>
            <dl className="mt-4 space-y-3 text-sm">
              {REQUIREMENTS.map((r) => (
                <div key={r.label}>
                  <dt className="font-semibold">{r.label}</dt>
                  <dd className="text-muted">{r.value}</dd>
                </div>
              ))}
            </dl>
          </aside>
          <div className="min-w-0 rounded-3xl border border-line bg-bg p-6 sm:p-8">
            <Tabs label="How to install ePaperclip" tabs={tabs} />
            <p className="mt-6 border-t border-line pt-5 text-sm text-muted">
              Updating, rolling back, uninstalling and fixing problems are in the <AppLink to="/docs/install-epaperclip" className="font-medium text-link underline">full install guide</AppLink>. Want to connect Claude, ChatGPT or Codex to your Paperclip? See <AppLink to="/docs/claude" className="font-medium text-link underline">Connect your AI app</AppLink>.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
