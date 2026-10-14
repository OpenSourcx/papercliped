import { useMemo } from "react";
import { ErrorBoundary, useHostContext, useHostNavigation, usePluginToast } from "@paperclipai/plugin-sdk/ui";
import { Card, CardTitle, Notice, Pill } from "./atoms.js";
import { useCalls, useLoad } from "./calls.js";
import { errText } from "./format.js";
import { Icon } from "./icons.js";
import { button } from "./look.js";
import { modeTitle } from "./modes.js";
import { SECTIONS, useRoomLinks, useSection, type SectionId } from "./room.js";
import { ACTIVE, IDLE, ITEM } from "./Sidebar.js";
import { ModeRow, Segmented } from "./Switch.js";
import type { AgentSetting } from "./AgentsView.js";
import { settingOf, withSetting } from "./AgentsView.js";
import type { CallRow, Policy, Session, Status } from "./types.js";

const GROUPS = ["Access", "Audit", "Account"] as const;

/**
 * The left menu while the control room is open. Paperclip swaps its normal company menu for this one on /papercliped, the same
 * way it does on an agent's page: grouped sections, the current one highlighted, and a way back.
 */
export function PapercliedRouteSidebar() {
  const link = useRoomLinks();
  const { section } = useSection();
  const nav = useHostNavigation();
  return (
    <nav aria-label="Papercliped" className="flex h-full flex-col gap-1 py-2">
      <div className="px-2 pb-1">
        <a {...nav.linkProps("/dashboard")} className={`${ITEM} ${IDLE}`}>
          <span className="relative shrink-0"><Icon name="arrow-left" className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1 truncate">Back to Paperclip</span>
        </a>
      </div>
      <div className="mx-4 mb-1 flex items-center gap-2 border-b pb-2">
        <Icon name="paperclip" className="h-4 w-4" />
        <span className="text-sm font-semibold">Papercliped</span>
      </div>
      {GROUPS.map((g) => (
        <div key={g} className="mt-2">
          <p className="px-4 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g}</p>
          <div className="flex flex-col gap-0.5">
            {SECTIONS.filter((s) => s.group === g).map((s) => {
              const on = s.id === section;
              return (
                <a key={s.id} {...link(s.id as SectionId)} className={`${ITEM} ${on ? ACTIVE : IDLE}`} aria-current={on ? "page" : undefined}>
                  <span data-slot="sidebar-nav-icon" className="relative shrink-0"><Icon name={s.icon} className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1 truncate">{s.title}</span>
                </a>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

/** Whether this person has linked their Papercliped account, and the link to the page where they do it. */
function useLinked() {
  const call = useCalls();
  const status = useLoad(async () => (await call.status()) as Status, [call]);
  return { call, status, linked: status.data?.linked === true };
}

const AGENT_CHOICES = [
  { id: "default", label: "Default", hint: "Follow the switch on the control room's Overview" },
  { id: "api", label: "API only", icon: "plug", hint: "Direct control, no handing work to this agent" },
  { id: "full", label: "Full", icon: "zap", hint: "Direct control and work through this agent" },
  { id: "agent", label: "Agent only", icon: "bot", hint: "Work through this agent, no direct control" },
  { id: "off", label: "Off", icon: "ban", hint: "Papercliped can't see or touch this agent" },
] as const;

/** A tab on every agent's page: what Papercliped may do with this agent, and which sessions can reach it. */
export function PapercliedAgentTab() {
  return (
    <ErrorBoundary fallback={<p role="alert" className="p-4">Something went wrong on this tab. Reload to try again.</p>}>
      <AgentTab />
    </ErrorBoundary>
  );
}

function AgentTab() {
  const ctx = useHostContext();
  const toast = usePluginToast();
  const link = useRoomLinks();
  const { call, status, linked } = useLinked();
  const policy = useLoad(async () => (linked ? ((await call.policy()) as Policy) : null), [call, linked]);
  const sessions = useLoad(async () => (linked ? ((await call.sessions()) as { sessions: Session[] }).sessions : []), [call, linked]);
  const agentId = ctx.entityId ?? "";
  const reach = useMemo(() => (sessions.data ?? []).filter((s) => !s.agents || s.agents.includes(agentId)), [sessions.data, agentId]);

  if (status.loading && !status.data) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  if (!linked) {
    return (
      <div className="p-4">
        <Notice action={<a {...link("overview")} className={button}>Open Papercliped</a>}>Link your Papercliped account to choose what AI apps may do with this agent.</Notice>
      </div>
    );
  }
  const p = policy.data;
  const setting: AgentSetting = p ? settingOf(p, agentId) : "default";
  const effective = setting === "default" ? p?.mode : setting;
  const save = async (s: AgentSetting) => {
    if (!p) return;
    const next = withSetting(p, agentId, s);
    policy.set(next);
    try {
      policy.set((await call.setPolicy({ mode: next.mode, agents: next.agents })) as Policy);
      toast({ title: `This agent: ${modeTitle(s)}`, tone: "success" });
    } catch (e) {
      policy.set(p);
      toast({ title: "That didn't save", body: errText(e), tone: "error" });
    }
  };
  return (
    <div className="max-w-3xl space-y-3 p-4">
      <Card label="Papercliped access">
        <CardTitle hint="What AI apps connected through Papercliped may do with this agent.">Papercliped access</CardTitle>
        {policy.error && <Notice tone="bad">{policy.error}</Notice>}
        <Segmented<AgentSetting> label="Papercliped access for this agent" value={setting} choices={[...AGENT_CHOICES]} onChange={save} disabled={!p} />
        <p className="mt-3 text-sm text-muted-foreground">
          {effective === "off" ? "AI apps can't see this agent or anything assigned to it." : effective ? `Right now: ${modeTitle(effective)}${setting === "default" ? " (the default)" : ""}.` : "Loading…"}
        </p>
      </Card>
      <Card label="Sessions that reach this agent">
        <CardTitle hint="Connected AI apps that apply to this agent.">Sessions</CardTitle>
        {effective === "off" ? (
          <p className="text-sm text-muted-foreground">None: this agent is off.</p>
        ) : reach.length === 0 ? (
          <p className="text-sm text-muted-foreground">{sessions.loading ? "Loading…" : "No connected app applies to this agent."}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {reach.map((s) => <li key={s.id}><a {...link("sessions", s.id)}><Pill>{s.label ?? s.app}</Pill></a></li>)}
          </ul>
        )}
        <p className="mt-3 text-xs"><a {...link("overview")} className="underline underline-offset-2">Open the control room</a></p>
      </Card>
    </div>
  );
}

/** A card for the dashboard: the access switch in small, and how busy it is. */
export function PapercliedWidget() {
  return (
    <ErrorBoundary fallback={<p role="alert" className="p-4 text-sm">Something went wrong. Reload to try again.</p>}>
      <Widget />
    </ErrorBoundary>
  );
}

function Widget() {
  const toast = usePluginToast();
  const link = useRoomLinks();
  const { call, status, linked } = useLinked();
  const policy = useLoad(async () => (linked ? ((await call.policy()) as Policy) : null), [call, linked]);
  const sessions = useLoad(async () => (linked ? ((await call.sessions()) as { sessions: Session[] }).sessions : []), [call, linked]);
  const calls = useLoad(async () => (linked ? ((await call.activity({ limit: 100 })) as { calls: CallRow[] }).calls : []), [call, linked], 60_000);
  const blocked = (calls.data ?? []).filter((c) => c.blocked && Date.now() - c.at < 86_400_000).length;
  const p = policy.data;
  const save = async (mode: Policy["mode"]) => {
    if (!p) return;
    const next = { ...p, mode };
    policy.set(next);
    try {
      policy.set((await call.setPolicy({ mode, agents: next.agents })) as Policy);
    } catch (e) {
      policy.set(p);
      toast({ title: "That didn't save", body: errText(e), tone: "error" });
    }
  };
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold"><Icon name="paperclip" className="h-4 w-4" /> Papercliped</h2>
        <a {...link("overview")} className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground">Control room</a>
      </div>
      {status.loading && !status.data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !linked ? (
        <p className="text-sm text-muted-foreground">Link your Papercliped account to control what AI apps may do. <a {...link("overview")} className="underline underline-offset-2">Link it</a></p>
      ) : (
        <>
          {p ? <ModeRow size="sm" value={p.mode} onChange={save} /> : <p className="text-sm text-muted-foreground">{policy.error ?? "Loading…"}</p>}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{sessions.data ? `${sessions.data.length} ${sessions.data.length === 1 ? "session" : "sessions"}` : "…"}</span>
            <span>{blocked ? `${blocked} blocked today` : "nothing blocked today"}</span>
            {p && Object.keys(p.agents).length > 0 && <span>{Object.keys(p.agents).length} {Object.keys(p.agents).length === 1 ? "agent" : "agents"} set apart</span>}
          </p>
        </>
      )}
    </div>
  );
}
