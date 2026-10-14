import type { IconName } from "./icons.js";
import type { Mode } from "./types.js";

/** The three positions of the access switch, in the order they sit on it. These words are also the docs' (site/docs/access-modes.md). */
export const MODES: { id: Mode; title: string; short: string; body: string; icon: IconName }[] = [
  {
    id: "api",
    title: "API only",
    short: "Direct control",
    body: "AI apps can look at everything and control Paperclip directly: pause and resume agents, set budgets, decide approvals, manage goals. They can't hand work to agents.",
    icon: "plug",
  },
  {
    id: "full",
    title: "Full",
    short: "Everything",
    body: "AI apps can look at everything, control Paperclip directly, and work through agents. This is the default for every agent.",
    icon: "zap",
  },
  {
    id: "agent",
    title: "Agent only",
    short: "Through agents",
    body: "AI apps can look at everything and work through agents: create, assign and comment on issues, wake an agent. They can't control Paperclip directly.",
    icon: "bot",
  },
];

export const modeTitle = (m: Mode | "off" | "default") => (m === "off" ? "Off" : m === "default" ? "Default" : MODES.find((x) => x.id === m)!.title);

/** What a tool does, by surface, in the words the control room uses. */
export const SURFACE = {
  read: { title: "Look", blurb: "Reads data. Allowed in every mode." },
  agent: { title: "Work through agents", blurb: "Hands work to agents: issues and wake-ups." },
  api: { title: "Direct control", blurb: "Changes Paperclip itself: pause, budgets, approvals, goals, the raw API." },
} as const;
export type SurfaceId = keyof typeof SURFACE;

/** The same rule the bridge applies (src/access/policy.ts): a mode allows reads, plus its own surface (Full allows all three). */
export const surfaceAllowed = (mode: Mode, surface: string): boolean => surface === "read" || mode === "full" || (mode === "api" && surface === "api") || (mode === "agent" && surface === "agent");
