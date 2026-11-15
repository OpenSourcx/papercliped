import { AppLink } from "../components/AppLink";
import { Diagram } from "../components/Diagram";
import { InstallEpaperclip } from "../components/InstallEpaperclip";
import { Screenshot } from "../components/Screenshot";
import { TextLink } from "../components/ui";
import release from "virtual:release";
import { usePageTitle } from "./usePageTitle";

const GET: string[] = [
  "Every VM and container on the node: status, consoles, start and stop, with Proxmox's own permissions.",
  "Storage, disks, backups, networking and the firewall on their own pages.",
  "Sign-in with your existing Proxmox accounts, including two-factor.",
  "Organizations with their own resource groups, and AI agents that run in unprivileged containers or on workers you enrol.",
  "Updates and rollback from the console or the shell, and a plain uninstall that keeps your data.",
  "Pin, an optional assistant that proposes changes for you to approve.",
];

const TRUST: { q: string; a: React.ReactNode }[] = [
  {
    q: "Is it installed as root?",
    a: <>The installer runs as root, once. The services it sets up do not: the console runs as the user <code className="font-mono">epaperclip</code>, the engine as <code className="font-mono">epaperclip-engine</code> and the agent resource broker as <code className="font-mono">epaperclip-broker</code>. Their systemd units set <code className="font-mono">NoNewPrivileges</code>, <code className="font-mono">ProtectSystem=strict</code>, <code className="font-mono">ProtectHome</code>, <code className="font-mono">PrivateTmp</code>, restricted address families and memory limits. The console's only capability is binding port 443; the engine has none.</>,
  },
  {
    q: "What does run as root?",
    a: <>Three small socket-activated helpers do the few jobs that need it: running an update or rollback an administrator asked for, running commands inside agent containers, and managing the publishing tunnel. They load no application code from writable state, and the update path treats the console as untrusted.</>,
  },
  {
    q: "What can it do on Proxmox?",
    a: <>It signs people in with Proxmox's own login and calls the Proxmox API as the signed-in person, so a user can do in ePaperclip what Proxmox already lets them do and nothing more. Proxmox administrators are root-equivalent on the host already.</>,
  },
  {
    q: "What does the installer change, and never touch?",
    a: <>It checks Proxmox VE 8 or newer, memory, disk, ports 443 and 3100 and the node certificate first, and changes nothing if something is missing. It brings its own pinned, checksum-verified Node.js under <code className="font-mono">/opt/epaperclip</code>, installs the engine from a lockfile without running package install scripts, test-starts the new version beside the old one, and puts the old one back by itself if the new one is not healthy. Proxmox's own interface on port 8006 is not touched.</>,
  },
  {
    q: "Where do agents run?",
    a: <>Never on the host. They run in unprivileged Proxmox containers (or on workers). The container provider refuses privileged containers, host bind mounts, passed-through devices and raw <code className="font-mono">lxc.*</code> settings, so agent code cannot reach host files or host credentials.</>,
  },
  {
    q: "Are releases signed?",
    a: <>Yes. Every release's manifest is signed with a key that only the release pipeline holds, and the installer and the update helper verify it with a public key pinned in the repository. The apt repository is signed with a separate key; its fingerprint is <code className="font-mono">2DC0 0D1A 1A87 1018 F797 E7CE F565 5E1B 9FA7 5813</code> and the install steps tell you to check it.</>,
  },
  {
    q: "How do I remove it?",
    a: <><code className="font-mono">epaperclip uninstall</code> stops and removes both services and everything under <code className="font-mono">/opt</code>, and keeps your data and settings; <code className="font-mono">epaperclip uninstall --purge</code> removes those too. If you are unsure, try ePaperclip in a nested Proxmox VM first.</>,
  },
];

export function Epaperclip() {
  usePageTitle("ePaperclip");
  const v = release.epaperclip;
  return (
    <div>
      <section className="mx-auto max-w-5xl px-4 pb-10 pt-12 sm:pt-16">
        <h1 className="text-4xl font-semibold sm:text-5xl">ePaperclip</h1>
        <p className="mt-2 text-sm text-muted">{v ? <>Latest release {v} · </> : null}MIT licence · Free and open source</p>
        <p className="mt-5 max-w-3xl text-lg">A web console you install on your Proxmox host: one place for your VMs, containers, storage and backups, with optional AI agents that run in their own containers.</p>
        <p className="mt-4 text-sm"><a href="#install" className="text-link underline">Install</a> · <a href="#trust" className="text-link underline">What it runs as</a> · <AppLink to="/docs/install-epaperclip" className="text-link underline">Docs</AppLink> · <a className="text-link underline" href="https://github.com/OpenSourcx/papercliped-engine" rel="noopener noreferrer">Source</a></p>
        <div className="mt-8"><Screenshot name="overview" priority alt="The ePaperclip overview page: CPU, memory and disk gauges, machines running, and the machines listed in the sidebar." /></div>
      </section>

      <InstallEpaperclip />

      <section className="mx-auto max-w-5xl px-4 py-14" aria-labelledby="get-h">
        <h2 id="get-h" className="text-3xl font-semibold">What you get</h2>
        <ul className="mt-5 max-w-3xl list-disc space-y-2 pl-5">{GET.map((g) => <li key={g}>{g}</li>)}</ul>
      </section>

      <section className="border-t border-line bg-surface" aria-labelledby="how-h">
        <div className="mx-auto max-w-5xl px-4 py-14">
          <h2 id="how-h" className="text-3xl font-semibold">How it works</h2>
          <p className="mt-3 max-w-3xl text-muted">You open ePaperclip in a browser. Its service calls the Proxmox API as you. Agents, if you use them, run in their own containers, and Pin, if you use it, only proposes: you approve.</p>
          <div className="mt-8 max-w-3xl"><Diagram /></div>
        </div>
      </section>

      <section id="trust" className="mx-auto max-w-5xl scroll-mt-20 px-4 py-14" aria-labelledby="trust-h">
        <h2 id="trust-h" className="text-3xl font-semibold">What it runs as and what it can touch</h2>
        <p className="mt-3 max-w-3xl text-muted">Written for a sceptical Proxmox administrator. Each answer is taken from the repository's own units, installer and security notes; see the <AppLink to="/docs/epaperclip-security" className="text-link underline">security page</AppLink> for the sources.</p>
        <dl className="mt-8 max-w-3xl space-y-6">
          {TRUST.map((t) => (
            <div key={t.q}>
              <dt className="font-semibold">{t.q}</dt>
              <dd className="mt-1 text-muted">{t.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="border-t border-line bg-surface" aria-labelledby="noai-h">
        <div className="mx-auto max-w-5xl px-4 py-14">
          <h2 id="noai-h" className="text-3xl font-semibold">Without AI</h2>
          <p className="mt-3 max-w-3xl">Agents and Pin are optional. First-run setup can be finished with no AI provider chosen, and the pages for machines, storage, backups, networking and access talk to Proxmox as you and need no model. Pin and agents work only once you connect an AI model, and agents also need agent containers set up by a Proxmox administrator first.</p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-14" aria-labelledby="more-h">
        <h2 id="more-h" className="text-3xl font-semibold">Requirements, updating and removing</h2>
        <ul className="mt-5 max-w-3xl list-disc space-y-2 pl-5">
          <li>Proxmox VE 8 or newer, root access, about 3 GB of disk and 4 GB of memory (2 GB is the minimum).</li>
          <li>Update with <code className="font-mono">apt update &amp;&amp; apt install --only-upgrade epaperclip</code> (apt installs) or <code className="font-mono">epaperclip update</code> (npm and release-download installs); go back with <code className="font-mono">epaperclip rollback</code>.</li>
          <li>Guides: <TextLink to="/docs/install-epaperclip">install</TextLink>, <TextLink to="/docs/link-a-device">link a computer to your account</TextLink>, <TextLink to="/docs/epaperclip-security">security</TextLink>, <TextLink to="/docs/troubleshooting">troubleshooting</TextLink>.</li>
        </ul>
      </section>
    </div>
  );
}
