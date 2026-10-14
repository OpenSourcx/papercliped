import { useMemo, useState } from "react";
import { StatusBadge, usePluginToast } from "@paperclipai/plugin-sdk/ui";
import { Card, CardTitle, Empty, Notice, PageHeader } from "./atoms.js";
import { field } from "./look.js";
import { MODES, modeTitle } from "./modes.js";
import { useRoom } from "./room.js";
import { ModeRow, Segmented, type Choice } from "./Switch.js";
import type { Agent, Mode, Policy } from "./types.js";

export type AgentSetting = Mode | "off" | "default";
const CHOICES: Choice<AgentSetting>[] = [
  { id: "default", label: "Default", hint: "Follow the switch on the Overview page" },
  { id: "api", label: "API only", icon: "plug", hint: MODES[0].body },
  { id: "full", label: "Full", icon: "zap", hint: MODES[1].body },
  { id: "agent", label: "Agent only", icon: "bot", hint: MODES[2].body },
  { id: "off", label: "Off", icon: "ban", hint: "Papercliped can't see or touch this agent at all" },
];

/** `status` words Paperclip uses for agents, mapped onto its own badge. */
export const agentBadge = (status: string): "ok" | "warning" | "error" | "info" | "pending" => {
  const s = status.toLowerCase();
  if (s.includes("error") || s.includes("terminated") || s.includes("fail")) return "error";
  if (s.includes("pause") || s.includes("pending")) return "warning";
  if (s.includes("run") || s.includes("active") || s.includes("idle") || s.includes("ready")) return "ok";
  return "info";
};

/** The setting an agent has now: its own override, or the default. */
export const settingOf = (p: Policy, agentId: string): AgentSetting => p.agents[agentId] ?? "default";

/** Change one agent's setting; "default" removes the override. */
export function withSetting(p: Policy, agentId: string, s: AgentSetting): Policy {
  const agents = { ...p.agents };
  if (s === "default") delete agents[agentId];
  else agents[agentId] = s;
  return { ...p, agents };
}

export function AgentsView() {
  const room = useRoom();
  const toast = usePluginToast();
  const [find, setFind] = useState("");
  const policy = room.policy.data;
  const list = useMemo(() => (room.agents.data ?? []).filter((a) => `${a.name} ${a.role ?? ""} ${a.title ?? ""}`.toLowerCase().includes(find.trim().toLowerCase())), [room.agents.data, find]);
  const known = new Set((room.agents.data ?? []).map((a) => a.id));
  const stale = Object.keys(policy?.agents ?? {}).filter((id) => !known.has(id));

  const set = (a: Agent, s: AgentSetting) => {
    if (!policy) return;
    room.savePolicy(withSetting(policy, a.id, s)).then(() => toast({ title: `${a.name}: ${modeTitle(s)}`, tone: "success" })).catch(() => undefined);
  };

  return (
    <div>
      <PageHeader title="Agents" subtitle="Papercliped follows the access switch for every agent. Set any agent apart here: a different mode, or off, so AI apps can't see it at all." />
      <Card label="Default" className="mb-3">
        <CardTitle hint="What AI apps may do with every agent that has no setting of its own.">Default for every agent</CardTitle>
        {policy ? <ModeRow value={policy.mode} onChange={(m) => room.savePolicy({ ...policy, mode: m }).then(() => toast({ title: `Papercliped is now ${modeTitle(m)}`, tone: "success" })).catch(() => undefined)} label="Default for every agent" /> : <p className="text-sm text-muted-foreground">Loading…</p>}
      </Card>

      {!room.companyId && <Notice tone="warn">Open a company to see its agents.</Notice>}
      {room.agents.error && room.companyId && <Notice tone="bad" action={<button type="button" className="underline underline-offset-2" onClick={room.agents.reload}>Try again</button>}>{room.agents.error}</Notice>}
      {room.agents.loading && !room.agents.data && <p className="text-sm text-muted-foreground">Loading agents…</p>}

      {room.agents.data && room.agents.data.length === 0 && <Empty icon="bot" title="This company has no agents yet">When you add agents they show up here, following the default.</Empty>}
      {room.agents.data && room.agents.data.length > 0 && (
        <>
          <input className={`${field} mb-2 w-full sm:w-64`} value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find an agent" aria-label="Find an agent" name="papercliped-agent-filter" autoComplete="off" />
          <ul className="divide-y divide-border rounded-lg border bg-card">
            {list.map((a) => {
              const s = policy ? settingOf(policy, a.id) : "default";
              const effective = s === "default" ? policy?.mode : s;
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1 basis-64">
                    <div className="flex items-center gap-2"><span className="truncate text-sm font-medium">{a.name}</span><StatusBadge label={a.status} status={agentBadge(a.status)} /></div>
                    <p className="truncate text-xs text-muted-foreground">{a.title ?? a.role ?? "Agent"}{effective && effective !== "off" ? ` · ${modeTitle(effective)}${s === "default" ? " (default)" : ""}` : effective === "off" ? " · hidden from AI apps" : ""}</p>
                  </div>
                  <Segmented<AgentSetting> size="sm" label={`Papercliped access for ${a.name}`} value={s} choices={CHOICES} onChange={(v) => set(a, v)} disabled={!policy} />
                </li>
              );
            })}
            {list.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">No agents match.</li>}
          </ul>
        </>
      )}
      {stale.length > 0 && (
        <Notice action={policy && <button type="button" className="underline underline-offset-2" onClick={() => room.savePolicy({ ...policy, agents: Object.fromEntries(Object.entries(policy.agents).filter(([id]) => known.has(id))) })}>Remove</button>}>
          {stale.length} {stale.length === 1 ? "setting is" : "settings are"} for agents in another company or that no longer exist.
        </Notice>
      )}
    </div>
  );
}
