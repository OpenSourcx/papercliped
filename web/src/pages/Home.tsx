import { AppLink } from "../components/AppLink";
import { CodeBlock } from "../components/CodeBlock";
import { Screenshot } from "../components/Screenshot";
import { ButtonLink, TextLink } from "../components/ui";
import { FAMILY } from "../content/products";
import release from "virtual:release";
import { usePageTitle } from "./usePageTitle";

const APT = `curl -fsSL https://apt.papercliped.co/epaperclip-archive-keyring.gpg \\
  -o /usr/share/keyrings/epaperclip-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/epaperclip-archive-keyring.gpg] https://apt.papercliped.co stable main" \\
  > /etc/apt/sources.list.d/epaperclip.list
apt update && apt install epaperclip`;

const FACTS: { title: string; text: React.ReactNode }[] = [
  { title: "Open source, MIT", text: <>Free to use and change. <a className="text-link underline" href="https://github.com/OpenSourcx/papercliped-engine" rel="noopener noreferrer">Read the source</a>.</> },
  { title: "Installs beside Proxmox", text: "The installer checks everything first and never reimages or repartitions anything. The services it runs are not root." },
  { title: "Proxmox's own interface stays", text: "Proxmox keeps working on port 8006. ePaperclip serves its console on port 443." },
];

const SECTIONS: { id: string; title: string; text: string; shot: string; alt: string; link?: { to: string; label: string } }[] = [
  {
    id: "machines", title: "Machines", shot: "machines",
    text: "See every VM and container on the node, start and stop them, open consoles and manage them as the Proxmox user who is signed in. Proxmox decides what each person may do; ePaperclip adds no authority of its own.",
    alt: "The ePaperclip machines page listing virtual machines and containers with their status, CPU and memory.",
  },
  {
    id: "storage", title: "Storage and backups", shot: "backups",
    text: "Storage, disks and backups have their own pages, with the same Proxmox permissions, so the people who look after the host do not have to switch tools to check on them.",
    alt: "The ePaperclip backups page showing backup jobs and recent backups.",
  },
  {
    id: "orgs", title: "Organizations and agents", shot: "organization",
    text: "An organization gets its own resource group on the machine, and its AI agents run in unprivileged containers (or on worker machines you enrol), never on the host itself. Agents are optional.",
    alt: "An organization dashboard in ePaperclip with its resource group, members, agents, tasks and container sessions.",
    link: { to: "/docs/install-epaperclip", label: "Set up agent containers" },
  },
  {
    id: "pin", title: "Pin", shot: "pin",
    text: "Pin is an optional assistant inside the console. In Assistant mode it explains and proposes and you decide; in Agent mode it works within the policy you set. It needs an AI model that you connect, and it is still a preview.",
    alt: "Pin, the assistant in ePaperclip, with a chat panel next to the machine overview.",
    link: { to: "/pin", label: "More about Pin" },
  },
];

export function Home() {
  usePageTitle("ePaperclip: a web console for your Proxmox host");
  const v = release.epaperclip;
  return (
    <div>
      <section className="mx-auto max-w-5xl px-4 pb-12 pt-12 sm:pt-16">
        <h1 className="text-4xl font-semibold sm:text-5xl">ePaperclip</h1>
        <p className="mt-2 text-sm text-muted">{v ? <>Version {v} · </> : null}MIT licence · Free and open source</p>
        <p className="mt-5 max-w-3xl text-lg">
          ePaperclip is a free, open-source web console you install on your Proxmox host: one place for your VMs, containers, storage and backups, with optional AI agents that run in their own containers.
        </p>
        <div className="mt-8">
          <Screenshot name="overview" priority alt="The ePaperclip overview page for a Proxmox host: CPU, memory and disk gauges, machines running, and the list of machines in the sidebar." />
        </div>
        <div id="install" className="mt-10 scroll-mt-20">
          <h2 className="text-2xl font-semibold">Install</h2>
          <p className="mt-2 text-muted">As root on a Proxmox VE 8 or newer host (the Proxmox web shell works):</p>
          <CodeBlock code={APT} />
          <p className="mt-3 text-sm text-muted">
            Check the key's fingerprint, other install methods and what to do next in the <AppLink to="/docs/install-epaperclip" className="text-link underline">install guide</AppLink>. Try it on a test node or a nested Proxmox VM first if you can.
          </p>
        </div>
        <ul className="mt-10 grid gap-4 sm:grid-cols-3">
          {FACTS.map((f) => (
            <li key={f.title} className="rounded-lg border border-line p-4">
              <h2 className="text-base font-semibold">{f.title}</h2>
              <p className="mt-1 text-sm text-muted">{f.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-line bg-surface" aria-labelledby="do-h">
        <div className="mx-auto max-w-5xl px-4 py-14">
          <h2 id="do-h" className="text-3xl font-semibold">What you can do with it</h2>
          <div className="mt-10 space-y-16">
            {SECTIONS.map((s) => (
              <div key={s.id} id={s.id} className="grid items-start gap-6 lg:grid-cols-[1fr_1.4fr]">
                <div>
                  <h3 className="text-xl font-semibold">{s.title}</h3>
                  <p className="mt-2 text-muted">{s.text}</p>
                  {s.link ? <p className="mt-3"><TextLink to={s.link.to}>{s.link.label}</TextLink></p> : null}
                </div>
                <Screenshot name={s.shot} alt={s.alt} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-14" aria-labelledby="family-h">
        <h2 id="family-h" className="text-3xl font-semibold">The family</h2>
        <p className="mt-2 max-w-2xl text-muted">ePaperclip is the main product. The rest connect to it or are on the way. Statuses are what exists today.</p>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <caption className="sr-only">Papercliped products and their status</caption>
            <thead><tr className="border-b border-line text-muted"><th scope="col" className="py-2 pr-4 font-medium">Product</th><th scope="col" className="py-2 pr-4 font-medium">What it is</th><th scope="col" className="py-2 font-medium">Status</th></tr></thead>
            <tbody>
              {FAMILY.map((p) => (
                <tr key={p.name} className="border-b border-line align-top">
                  <th scope="row" className="py-3 pr-4 font-semibold"><AppLink to={p.to} className="text-link underline">{p.name}</AppLink></th>
                  <td className="py-3 pr-4 text-muted">{p.what}</td>
                  <td className="py-3 font-medium">{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm"><TextLink to="/roadmap">See everything we are building</TextLink></p>
      </section>

      <section className="border-t border-line bg-surface" aria-labelledby="trust-h">
        <div className="mx-auto max-w-5xl px-4 py-14">
          <h2 id="trust-h" className="text-3xl font-semibold">What it runs as and what it can touch</h2>
          <p className="mt-3 max-w-3xl text-muted">The installer needs root, once. After that the console and the engine run as their own unprivileged users under systemd's sandboxing, act on Proxmox as the person signed in, and keep agents in unprivileged containers with no host folders. Releases are signed, and you can check the package key's fingerprint before you install.</p>
          <p className="mt-4"><ButtonLink to="/epaperclip#trust" variant="secondary">Read the details</ButtonLink></p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-14" aria-labelledby="community-h">
        <h2 id="community-h" className="text-3xl font-semibold">Questions and ideas</h2>
        <p className="mt-2 max-w-2xl text-muted">Ask, suggest or report a problem on the <TextLink to="/community">community page</TextLink>. Guides are in the <TextLink to="/docs">docs</TextLink>.</p>
      </section>
    </div>
  );
}
