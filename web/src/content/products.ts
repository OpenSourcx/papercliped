/**
 * What exists, with an honest status for each. One list feeds the home page's family table and /roadmap, so they cannot disagree.
 * Available: released and usable today. Preview: released but new, partial or pre-release. In progress: being built. Planned: not started.
 * No dates are promised here. `to` is the docs page or the repository page that says more.
 */
export type Status = "Available" | "Preview" | "In progress" | "Planned";

const ENGINE_ISSUES = "https://github.com/OpenSourcx/papercliped-engine/issues";
const SITE_ISSUES = "https://github.com/OpenSourcx/papercliped/issues";

export interface Product { name: string; what: string; status: Status; to: string }
export const FAMILY: Product[] = [
  { name: "ePaperclip", what: "The web console you install on your Proxmox host: machines, storage, backups, organizations and agents.", status: "Available", to: "/epaperclip" },
  { name: "Pin", what: "An optional assistant inside ePaperclip that proposes changes for you to approve.", status: "Preview", to: "/pin" },
  { name: "Papercliped MCP", what: "Connect Claude, ChatGPT, Codex or another MCP app to your Paperclip, with Read only or Full control.", status: "Available", to: "/papercliped" },
  { name: "Papercliped Connect", what: "Managed remote access and one account for your devices.", status: "Preview", to: "/connect" },
  { name: "PinOS", what: "A complete distribution with ePaperclip built in.", status: "Planned", to: "/roadmap" },
];

export interface Item { title: string; status: Status; to: string; note?: string }
export interface Area { name: string; items: Item[] }
export const ROADMAP: Area[] = [
  { name: "ePaperclip", items: [
    { title: "Machines, storage, backups and networking console", status: "Available", to: "/docs/install-epaperclip" },
    { title: "Sign in with Proxmox accounts; actions run as the signed-in person", status: "Available", to: "/docs/install-epaperclip" },
    { title: "Organizations and agents in unprivileged containers", status: "Available", to: "/docs/install-epaperclip" },
    { title: "Worker machines for extra compute", status: "Available", to: "/docs/install-epaperclip" },
    { title: "Link a computer to your Papercliped account (epaperclip login)", status: "Available", to: "/docs/link-a-device", note: "Needs a release newer than 1.0.0." },
    { title: "Updates from the console, rollback and uninstall", status: "Available", to: "/docs/install-epaperclip" },
    { title: "Qualification on a wider range of real hardware", status: "In progress", to: ENGINE_ISSUES },
  ] },
  { name: "Pin", items: [
    { title: "Automations Pin can explain and you approve", status: "Preview", to: "/pin" },
    { title: "A model-backed assistant that remembers your setup", status: "In progress", to: "/pin" },
    { title: "Scheduled, policy-bound agent actions with approval gates", status: "Planned", to: ENGINE_ISSUES },
  ] },
  { name: "Papercliped MCP", items: [
    { title: "Hosted gateway and local connector for MCP apps", status: "Available", to: "/docs/getting-started" },
    { title: "Sign in once with your Papercliped account", status: "Available", to: "/docs/your-account" },
    { title: "See and remove connected AI apps", status: "Available", to: "/docs/your-account" },
  ] },
  { name: "Papercliped Connect", items: [
    { title: "Account portals: email code, passkeys, Google and GitHub", status: "Available", to: "/docs/your-account" },
    { title: "Link a device with a short code at link.papercliped.co", status: "Available", to: "/docs/link-a-device" },
    { title: "Managed tunnel and subscription for a device", status: "Preview", to: "/connect", note: "Pre-release." },
  ] },
  { name: "This site", items: [
    { title: "Documentation for each product", status: "In progress", to: "/docs" },
    { title: "A public forum", status: "Planned", to: SITE_ISSUES, note: "Waiting for GitHub Discussions to be switched on." },
  ] },
  { name: "Later", items: [
    { title: "PinOS, an installable distribution", status: "Planned", to: ENGINE_ISSUES },
  ] },
];
