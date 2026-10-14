import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useHostLocation, useHostNavigation, usePluginToast } from "@paperclipai/plugin-sdk/ui";
import { useLoad, type Loaded } from "./calls.js";
import { errText } from "./format.js";
import type { IconName } from "./icons.js";
import type { Agent, Call, Me, Policy, Session, ToolInfo } from "./types.js";

export type SectionId = "overview" | "sessions" | "agents" | "tools" | "activity" | "settings";
export const SECTIONS: { id: SectionId; title: string; icon: IconName; group: "Access" | "Audit" | "Account"; blurb: string }[] = [
  { id: "overview", title: "Overview", icon: "gauge", group: "Access", blurb: "The access switch and what's happening." },
  { id: "sessions", title: "Sessions", icon: "plug", group: "Access", blurb: "Every connected AI app, and what each may use." },
  { id: "agents", title: "Agents", icon: "bot", group: "Access", blurb: "What Papercliped may do with each agent." },
  { id: "tools", title: "Tools", icon: "wrench", group: "Access", blurb: "Everything an AI app can do, in one list." },
  { id: "activity", title: "Activity", icon: "activity", group: "Audit", blurb: "Recent calls, including the ones that were blocked." },
  { id: "settings", title: "Settings", icon: "sliders-horizontal", group: "Account", blurb: "Privacy, linked Paperclips and your account." },
];
const IDS = new Set<string>(SECTIONS.map((s) => s.id));

/** Where in the control room the person is, read from the address (`?s=sessions&id=…`) so links, back and reload all work. */
export function useSection(): { section: SectionId; id: string | null } {
  const { search } = useHostLocation();
  return useMemo(() => {
    const q = new URLSearchParams(search);
    const s = q.get("s") ?? "overview";
    const id = q.get("id");
    return { section: (IDS.has(s) ? s : "overview") as SectionId, id: id && /^[A-Za-z0-9_-]{1,80}$/.test(id) ? id : null };
  }, [search]);
}

/** Link props to a section (and one thing inside it) of the control room. */
export function useRoomLinks() {
  const nav = useHostNavigation();
  return useCallback((section: SectionId, id?: string | null) => nav.linkProps(`/papercliped${section === "overview" ? "" : `?s=${section}${id ? `&id=${encodeURIComponent(id)}` : ""}`}`), [nav]);
}

export interface Room {
  call: Call;
  me: Me;
  companyId: string | null;
  policy: Loaded<Policy>;
  sessions: Loaded<Session[]>;
  tools: Loaded<ToolInfo[]>;
  agents: Loaded<Agent[]>;
  /** Save the access switch and overrides: shown at once, put back with the reason if it fails. */
  savePolicy: (next: Policy) => Promise<void>;
  onUnlinked: () => void;
  onMe: (m: Me) => void;
}

const RoomContext = createContext<Room | null>(null);
export const useRoom = (): Room => {
  const r = useContext(RoomContext);
  if (!r) throw new Error("useRoom outside a room");
  return r;
};

/** Everything the control room's pages share, loaded once and kept in step when something is saved. */
export function RoomProvider({ call, me, companyId, onUnlinked, onMe, children }: { call: Call; me: Me; companyId: string | null; onUnlinked: () => void; onMe: (m: Me) => void; children: ReactNode }) {
  const toast = usePluginToast();
  const policy = useLoad(async () => (await call.policy()) as Policy, [call]);
  const sessions = useLoad(async () => ((await call.sessions()) as { sessions: Session[] }).sessions, [call], 60_000);
  const tools = useLoad(async () => ((await call.tools()) as { tools: ToolInfo[] }).tools, [call]);
  const agents = useLoad(async () => ((await call.agents()) as { agents: Agent[] }).agents, [call, companyId]);
  const savePolicy = useCallback(
    async (next: Policy) => {
      const before = policy.data;
      policy.set(next);
      try {
        policy.set((await call.setPolicy({ mode: next.mode, agents: next.agents })) as Policy);
      } catch (e) {
        if (before) policy.set(before);
        toast({ title: "That didn't save", body: errText(e), tone: "error" });
        throw e;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [call, policy.data, toast],
  );
  const value = useMemo<Room>(() => ({ call, me, companyId, policy, sessions, tools, agents, savePolicy, onUnlinked, onMe }), [call, me, companyId, policy, sessions, tools, agents, savePolicy, onUnlinked, onMe]);
  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}
