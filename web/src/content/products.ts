/**
 * The Papercliped family: one source for the products menu, the home section, the /products overview and each product page.
 * Status words are evidence-based; change a status only with evidence (a deployed URL, a release tag), never to market.
 *   live          deployed and usable today
 *   early         deployed, but not open to everyone or not carrying real use yet
 *   soon          not released: no download, install command or availability is claimed anywhere on the site
 */
export type Status = "live" | "early" | "soon";
export type ProductId = "console" | "connect" | "epaperclip" | "pin";

export const STATUS: Record<Status, { label: string; mark: string; note: string }> = {
  live: { label: "Live", mark: "●", note: "Deployed and usable today." },
  early: { label: "Early access", mark: "◐", note: "Deployed, but not open to everyone yet." },
  soon: { label: "Coming soon", mark: "○", note: "Not released. No download or install yet." },
};

export const AUTH_URL = "https://auth.papercliped.co";
export const ACCOUNT_URL = "https://auth.papercliped.co/account";
export const CONSOLE_URL = "https://console.papercliped.co";
export const CONNECT_URL = "https://connect.papercliped.co";
export const ENGINE_REPO = "https://github.com/OpenSourcx/papercliped-engine";

export interface Shot {
  light?: string;
  dark?: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
}
export interface Product {
  id: ProductId;
  to: string;
  name: string;
  tagline: string;
  /** One line for the products menu. */
  menu: string;
  status: Status;
  /** Why this status, in plain words, shown on the page. */
  statusDetail: string;
  intro: string;
  who: string[];
  how: { title: string; body: string }[];
  where: { local: string[]; hosted: string[] };
  trust: { t: string; d: string }[];
  shots: Shot[];
  cta: { label: string; to: string }[];
  /** Page description (meta + lede for search results). */
  description: string;
}

export const PRODUCTS: Product[] = [
  {
    id: "console",
    to: "/console",
    name: "Console",
    tagline: "Your Papercliped account, devices and subscription in one place.",
    menu: "Your account, devices and security, signed in once.",
    status: "early",
    statusDetail: "The Console is deployed at console.papercliped.co, but sign-in is still being verified end to end, so it may not work for you yet. Billing is not open either.",
    intro:
      "The Console is the hosted home of your Papercliped account. See your devices, approve a new one, review where you are signed in and, once Connect billing opens, manage your subscription. It is separate from the console that runs on your own server (that one is ePaperclip).",
    who: [
      "Anyone with a Papercliped account who wants to see and manage their devices.",
      "People pairing an ePaperclip device with their account, for example to use Papercliped Connect.",
    ],
    how: [
      { title: "Sign in once", body: "Go to auth.papercliped.co and sign in with an email code. The same sign-in works for the Console, Connect and the rest of the family." },
      { title: "Open the Console", body: "Overview shows your account, subscription and devices. Devices, Billing and Security are one click away." },
      { title: "Approve a device when asked", body: "A device you are pairing shows a pairing ID. You confirm it in the Console, after signing in yourself, so a device cannot claim your account on its own." },
    ],
    where: {
      local: ["Your devices keep running without the Console.", "Nothing in the Console can log in to a device or run commands on it."],
      hosted: ["Your account, the list of devices and their state, and your sign-in sessions.", "A fingerprint (hash) of each device's public key, never its private key."],
    },
    trust: [
      { t: "Signing in never grants device admin", d: "A Papercliped account is not a Proxmox account. Each device still checks its own sign-in and permissions." },
      { t: "Sensitive steps ask again", d: "Removing a device's address, ending other sessions or replacing your account secret key needs a fresh sign-in first." },
      { t: "No trackers", d: "No analytics and no third-party scripts, here or in the Console." },
    ],
    shots: [
      {
        light: "/products/console-overview-light.png", dark: "/products/console-overview-dark.png", width: 1280, height: 800,
        alt: "The Console overview with three cards: Account, Subscription and Devices.",
        caption: "Console overview. Sample data from our design review, not a real account.",
      },
    ],
    cta: [{ label: "Sign in to the Console", to: AUTH_URL + "/?next=" + encodeURIComponent(CONSOLE_URL + "/") }, { label: "Open your account", to: ACCOUNT_URL }],
    description: "The Papercliped Console: your account, devices, sessions and subscription in one hosted place, with one sign-in shared across the family.",
  },
  {
    id: "connect",
    to: "/connect",
    name: "Connect",
    tagline: "A secure address for each device, managed for you.",
    menu: "Optional managed remote access, one address per device.",
    status: "early",
    statusDetail:
      "The Connect portal and its service are deployed at connect.papercliped.co. Billing is not open and a managed address has not yet been proven on a real server, so do not rely on it for real traffic yet.",
    intro:
      "Papercliped Connect gives a server running ePaperclip an https address on the internet, so Claude, ChatGPT or any MCP app can reach it, without you owning a domain, opening a router port or handing anyone a Cloudflare key. It is optional: everything works locally without it.",
    who: [
      "People who want to reach their own server from outside their network without setting up a domain and a tunnel.",
      "Not needed if you only use ePaperclip on your own network, or already run your own Cloudflare tunnel.",
    ],
    how: [
      { title: "Pick a mode", body: "Local only (nothing to set up), your own Cloudflare account, or Connect. Only one is active at a time, and local use keeps working in all of them." },
      { title: "Pair the device", body: "In ePaperclip, choose Remote access, then Papercliped Connect. Open the approval page, sign in, approve the device and confirm the account shown." },
      { title: "Connect brings the tunnel up", body: "Your server opens an outbound connection to Cloudflare. The address is shown as connected only after Cloudflare confirms the tunnel is up." },
    ],
    where: {
      local: [
        "ePaperclip, Proxmox and every credential stay on your server.",
        "The tunnel is outbound only. Nothing connects in to your network.",
        "Requests still go through ePaperclip sign-in, the AI app's approval and your Proxmox permissions.",
      ],
      hosted: [
        "The address (a name ending in connect.papercliped.co) and a reference to the tunnel behind it.",
        "Your device list, subscription references and job status codes.",
        "Not stored: your server's private key, the tunnel's run token, AI prompts, results, files or any traffic.",
      ],
    },
    trust: [
      { t: "Connect cannot log in to your server", d: "It manages an address and a tunnel. It cannot run commands, and it does not sit in the middle of your traffic." },
      { t: "Your server's key stays on your server", d: "The device proves itself with a private key that never leaves it." },
      { t: "No paid seat, no managed address", d: "If a subscription stops, the managed address is paused. Your local server is untouched." },
      { t: "Paid, not priced here yet", d: "Connect is planned as a paid per-device subscription. Billing is not open and no price is announced on this site." },
    ],
    shots: [
      {
        light: "/products/connect-landing-light.png", dark: "/products/connect-landing-dark.png", width: 1280, height: 916,
        alt: "The Connect landing page: A secure address for each device, with a setup guide and a how-it-works card.",
        caption: "The Connect portal at connect.papercliped.co.",
      },
      {
        light: "/products/epaperclip-remote-access-light.png", width: 1440, height: 900,
        alt: "ePaperclip settings, Remote access: Local only, Self-managed Cloudflare and Papercliped Connect.",
        caption: "Remote access in ePaperclip, from a development host. Account id shown is sample data.",
      },
    ],
    cta: [{ label: "Open Connect", to: CONNECT_URL + "/" }, { label: "See how the products fit", to: "/products#fit" }],
    description: "Papercliped Connect: an optional, managed https address and tunnel for each ePaperclip device. Outbound only; your credentials and traffic stay on your server.",
  },
  {
    id: "epaperclip",
    to: "/epaperclip",
    name: "ePaperclip",
    tagline: "Paperclip, rebuilt to run natively on your Proxmox server.",
    menu: "Companies and AI agents on your own Proxmox server.",
    status: "soon",
    statusDetail:
      "ePaperclip is in development and has not been released. There is no download or installer to point you to yet. Parts of it are open source and public on GitHub.",
    intro:
      "ePaperclip is one clean interface for your Proxmox server, your companies and your AI agents. Paperclip's companies, agents, tasks, budgets and approvals run on your own hardware, and each company gets its own resource group on the machine. Papercliped is built in, so Claude, ChatGPT and other MCP apps can connect straight to the device.",
    who: [
      "People who run Proxmox at home or in a small team and want AI agents managed next to their machines.",
      "People who want agents to run on hardware they own, in containers, with Proxmox permissions deciding what anyone may do.",
    ],
    how: [
      { title: "Install it on a Proxmox host", body: "Not available yet. When it is released, this page will link to the real install guide." },
      { title: "Sign in with your Proxmox account", body: "What each person can see and do is exactly what their Proxmox permissions allow. The stock Proxmox interface stays available as an emergency console." },
      { title: "Set up agent containers", body: "Agents run in unprivileged containers, never on the host. Until an administrator sets this up, the engine refuses to run agents." },
    ],
    where: {
      local: [
        "All of it runs on your Proxmox host: the interface, the engine and the agents' containers.",
        "Only one small host broker holds the Proxmox token. Agents and the interface never do.",
        "Connect and a Papercliped account are optional.",
      ],
      hosted: ["Nothing is required from Papercliped to run it.", "Optional: sign in to a Papercliped account and use Connect for a managed address."],
    },
    trust: [
      { t: "Cloud login never grants Proxmox admin", d: "A Papercliped account can identify an owner and pair a device. It does not create Proxmox users or roles." },
      { t: "Credentials and execution authority stay on the device", d: "Secrets are sealed on your server, and agents run only in containers you set up." },
      { t: "Read only or Full control, never more than the person who approved", d: "MCP apps connect with the level someone approved, capped by that person's own permissions." },
    ],
    shots: [
      {
        dark: "/products/epaperclip-home-dark.png", width: 1280, height: 900,
        alt: "The ePaperclip device home: an Ask Pin bar above CPU, memory and disk gauges, with machines in a sidebar.",
        caption: "ePaperclip device home, from a development host with sample data.",
      },
    ],
    cta: [{ label: "Follow it on GitHub", to: ENGINE_REPO }, { label: "How the products fit", to: "/products#fit" }],
    description: "ePaperclip: Paperclip rebuilt for Proxmox. Companies and AI agents on your own server, with Pin built in. In development; not yet released.",
  },
  {
    id: "pin",
    to: "/pin",
    name: "Pin",
    tagline: "A copilot that lives on your server and looks after it.",
    menu: "The assistant built into ePaperclip, on your host.",
    status: "soon",
    statusDetail: "Pin ships inside ePaperclip, which has not been released. Parts are built and tested in the open; nothing is available to install yet.",
    intro:
      "Pin is the copilot built into ePaperclip. Ask it about your server, have it turn a sentence like \"if a container uses more than 50% of its memory, shut it down\" into an automation, and let it tell you when updates are available. Pin lives on the host and never uses an organization's machines or worker allocation.",
    who: [
      "People who would rather say what they want than click through a Proxmox menu.",
      "Anyone who wants a careful assistant: it proposes first, and acts on its own only if you choose that.",
    ],
    how: [
      { title: "Ask in plain words", body: "Use the Ask Pin bar or the floating Pin island, which offers quick actions for the page you are on." },
      { title: "Choose a mode", body: "Assistant mode proposes a plan and waits for your approval. Agent mode carries out what you allowed." },
      { title: "Read it back before it runs", body: "Every automation is shown in plain words before it is saved. Automation actions are limited to notify, shut down, stop, start or snapshot, and never delete anything." },
    ],
    where: {
      local: [
        "Pin runs on your host, inside ePaperclip.",
        "Its notes (SOUL.md and MEMORY.md) and automations are stored on your server.",
        "Machines tagged protected only ever produce a notification.",
      ],
      hosted: ["Nothing about Pin requires a Papercliped service.", "Which model provider you connect is your choice, in ePaperclip's settings."],
    },
    trust: [
      { t: "Pin does not use an organization's resources", d: "It stays on the host and uses none of an organization's machines or worker allocation." },
      { t: "Pin cannot approve anything", d: "Approvals stay with people. Pin's access to each organization's apps starts Off and you set it per app." },
      { t: "Pin acts as its owner, never more", d: "An automation runs with its own Proxmox token limited to one action and one scope, and never beyond what its owner may do." },
    ],
    shots: [
      {
        dark: "/products/epaperclip-home-dark.png", width: 1280, height: 900,
        alt: "The Ask Pin bar on the ePaperclip home, in Assistant mode, with suggested questions.",
        caption: "Ask Pin on the ePaperclip home, from a development host with sample data.",
      },
    ],
    cta: [{ label: "Follow it on GitHub", to: ENGINE_REPO }, { label: "How the products fit", to: "/products#fit" }],
    description: "Pin: the copilot built into ePaperclip. It lives on your host, proposes before it acts, and turns plain language into safe automations. Not yet released.",
  },
];

export const byId = (id: ProductId) => PRODUCTS.find((p) => p.id === id)!;

/** The four steps of the picture on /products and the home page, in order. */
export const FIT = [
  { zone: "Papercliped (hosted)", title: "Your Papercliped account", body: "Sign in once at papercliped.co or auth.papercliped.co. One account for everything below.", to: "/console" },
  { zone: "Papercliped (hosted)", title: "Console and Connect", body: "Console manages your account and devices. Connect, if you choose it, gives a device a secure address. Neither holds your credentials.", to: "/connect" },
  { zone: "Your hardware", title: "ePaperclip and Pin on your Proxmox server", body: "ePaperclip runs your companies and agents. Pin looks after the server. Papercliped, built in, lets Claude, ChatGPT and other MCP apps connect.", to: "/epaperclip" },
  { zone: "Your hardware", title: "Workers", body: "Agents run in containers on your server. Compatible computers can also be adopted as workers (Worker Fabric, in development).", to: "/epaperclip" },
] as const;
