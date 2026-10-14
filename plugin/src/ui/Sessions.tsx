import { useMemo, useState } from "react";
import { useHostNavigation, usePluginToast } from "@paperclipai/plugin-sdk/ui";
import { Card, CardTitle, Check, Empty, Notice, PageHeader, Pill } from "./atoms.js";
import { useLoad } from "./calls.js";
import { ago, errText, LEVEL } from "./format.js";
import { Icon } from "./icons.js";
import { SURFACE, type SurfaceId } from "./modes.js";
import { button, danger, field, primary } from "./look.js";
import { useRoom, useRoomLinks, useSection } from "./room.js";
import { Segmented } from "./Switch.js";
import type { CallRow, Session, ToolInfo } from "./types.js";

interface Draft {
  label: string;
  level: "read" | "control";
  allTools: boolean;
  tools: string[];
  allAgents: boolean;
  agents: string[];
}
const draftOf = (s: Session): Draft => ({ label: s.label ?? "", level: s.level === "paperclip:read" ? "read" : "control", allTools: !s.tools, tools: s.tools ?? [], allAgents: !s.agents, agents: s.agents ?? [] });
const same = (a: Draft, b: Draft) => JSON.stringify({ ...a, tools: [...a.tools].sort(), agents: [...a.agents].sort() }) === JSON.stringify({ ...b, tools: [...b.tools].sort(), agents: [...b.agents].sort() });
const summary = (s: Session) => `${s.tools ? `${s.tools.length} ${s.tools.length === 1 ? "tool" : "tools"}` : "All tools"} · ${s.agents ? `${s.agents.length} ${s.agents.length === 1 ? "agent" : "agents"}` : "Everyone"}`;
const ORDER: SurfaceId[] = ["read", "agent", "api"];

export function Sessions() {
  const { id } = useSection();
  const { sessions } = useRoom();
  if (id) {
    const s = sessions.data?.find((x) => x.id === id);
    return s ? <SessionDetail key={s.id} session={s} /> : sessions.loading ? <p className="text-sm text-muted-foreground">Loading…</p> : <SessionMissing />;
  }
  return <SessionList />;
}

function SessionMissing() {
  const link = useRoomLinks();
  return (
    <div>
      <PageHeader title="Session not found" />
      <Empty icon="plug" title="That session isn't connected any more">It may have been disconnected. <a {...link("sessions")} className="underline underline-offset-2">Back to sessions</a></Empty>
    </div>
  );
}

function SessionList() {
  const { sessions } = useRoom();
  const link = useRoomLinks();
  return (
    <div>
      <PageHeader title="Sessions" subtitle="Each AI app connected through Papercliped is a session. Name it, limit the tools it can use, and choose which agents it applies to." />
      {sessions.error && <Notice tone="bad" action={<button type="button" className="underline underline-offset-2" onClick={sessions.reload}>Try again</button>}>{sessions.error}</Notice>}
      {sessions.loading && !sessions.data && <p className="text-sm text-muted-foreground">Loading…</p>}
      {sessions.data && sessions.data.length === 0 && (
        <Empty icon="plug" title="No AI app is connected">Add Papercliped as a connector in Claude or ChatGPT (see the Connect your AI app guide). Each app you connect shows up here as a session.</Empty>
      )}
      {sessions.data && sessions.data.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border bg-card">
          {sessions.data.map((s) => (
            <li key={s.id}>
              <a {...link("sessions", s.id)} className="flex items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-muted text-sm font-semibold" aria-hidden="true">{(s.label ?? s.app).slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{s.label ?? s.app}{s.label && <span className="font-normal text-muted-foreground"> · {s.app}</span>}</span>
                  <span className="block truncate text-xs text-muted-foreground">{summary(s)} · last used {ago(s.lastUsedAt)}</span>
                </span>
                <Pill tone={s.level === "paperclip:read" ? "neutral" : "good"}>{LEVEL[s.level] ?? s.level}</Pill>
                <Icon name="chevron-right" className="h-4 w-4 shrink-0 text-muted-foreground" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SessionDetail({ session }: { session: Session }) {
  const room = useRoom();
  const toast = usePluginToast();
  const nav = useHostNavigation();
  const link = useRoomLinks();
  const [base, setBase] = useState<Draft>(() => draftOf(session));
  const [draft, setDraft] = useState<Draft>(base);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [find, setFind] = useState("");
  const recent = useLoad(async () => ((await room.call.activity({ session: session.id, limit: 8 })) as { calls: CallRow[] }).calls, [room.call, session.id], 30_000);

  const dirty = !same(draft, base);
  const problem = !draft.allTools && draft.tools.length === 0 ? "Choose at least one tool, or allow all." : !draft.allAgents && draft.agents.length === 0 ? "Choose at least one agent, or apply to everyone." : null;
  const tools = room.tools.data ?? [];
  const grouped = useMemo(() => ORDER.map((surface) => ({ surface, list: tools.filter((t) => t.surface === surface) })).filter((g) => g.list.length), [tools]);
  const agents = (room.agents.data ?? []).filter((a) => a.name.toLowerCase().includes(find.trim().toLowerCase()));

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const flip = (list: string[], id: string, on: boolean) => (on ? [...new Set([...list, id])] : list.filter((x) => x !== id));
  const needsControl = (t: ToolInfo) => draft.level === "read" && t.access !== "read" && t.name !== "paperclip_api_request";

  const save = async () => {
    if (problem) return;
    setBusy(true);
    try {
      await room.call.setSession({ id: session.id, label: draft.label.trim() || null, level: draft.level, tools: draft.allTools ? null : draft.tools, agents: draft.allAgents ? null : draft.agents });
      setBase(draft);
      room.sessions.reload();
      toast({ title: "Session saved", body: "It applies on the app's next request.", tone: "success" });
    } catch (e) {
      toast({ title: "That didn't save", body: errText(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () =>
    room.call
      .disconnect({ id: session.id })
      .then(() => {
        toast({ title: `${session.label ?? session.app} disconnected`, tone: "success" });
        room.sessions.reload();
        nav.navigate("/papercliped?s=sessions");
      })
      .catch((e) => toast({ title: "That didn't work", body: errText(e), tone: "error" }));

  return (
    <div>
      <p className="mb-2 text-sm"><a {...link("sessions")} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><Icon name="arrow-left" className="h-3.5 w-3.5" /> All sessions</a></p>
      <PageHeader title={session.label ?? session.app} subtitle={`${session.app} · connected ${ago(session.createdAt)} · last used ${ago(session.lastUsedAt)}`} actions={<Pill tone={draft.level === "read" ? "neutral" : "good"}>{draft.level === "read" ? "Read only" : "Full control"}</Pill>} />

      <Card label="Name and level">
        <CardTitle hint="Rename a session to tell two apps or devices apart.">Name and level</CardTitle>
        <div className="flex flex-wrap items-end gap-4">
          <label className="min-w-0 flex-1 basis-64 text-xs text-muted-foreground">
            Name
            <input className={`${field} mt-1 block w-full text-foreground`} value={draft.label} onChange={(e) => set({ label: e.target.value })} placeholder={session.app} maxLength={60} name="papercliped-session-name" autoComplete="off" />
          </label>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Level</p>
            <Segmented label="Access level" value={draft.level} onChange={(level) => set({ level })} choices={[{ id: "read", label: "Read only", icon: "eye", hint: "Can look at agents, issues, goals, costs and reports." }, { id: "control", label: "Full control", icon: "zap", hint: "Can use every tool the switch allows." }]} />
          </div>
        </div>
      </Card>

      <Card label="Tools" className="mt-3">
        <CardTitle hint="Tools this session may use. The level and the access switch still apply on top.">Tools</CardTitle>
        <Check checked={draft.allTools} onChange={(allTools) => set({ allTools })} hint="Everything the level and the switch allow">All tools</Check>
        {!draft.allTools && (
          <div className="mt-2 space-y-4">
            {room.tools.loading && !room.tools.data && <p className="text-sm text-muted-foreground">Loading the tool list…</p>}
            {grouped.map(({ surface, list }) => {
              const chosen = list.filter((t) => draft.tools.includes(t.name)).length;
              return (
                <fieldset key={surface}>
                  <legend className="flex w-full items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <span>{SURFACE[surface].title} · {chosen}/{list.length}</span>
                    <span className="flex gap-2 normal-case tracking-normal">
                      <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => set({ tools: [...new Set([...draft.tools, ...list.map((t) => t.name)])] })}>All</button>
                      <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => set({ tools: draft.tools.filter((n) => !list.some((t) => t.name === n)) })}>None</button>
                    </span>
                  </legend>
                  <p className="mb-1 text-xs text-muted-foreground">{SURFACE[surface].blurb}</p>
                  <div className="grid gap-x-3 sm:grid-cols-2">
                    {list.map((t) => (
                      <Check key={t.name} checked={draft.tools.includes(t.name)} disabled={needsControl(t)} onChange={(on) => set({ tools: flip(draft.tools, t.name, on) })} hint={needsControl(t) ? "Needs Full control" : t.name}>{t.title}</Check>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>
        )}
      </Card>

      <Card label="Agents" className="mt-3">
        <CardTitle hint="Which agents this session applies to.">Agents</CardTitle>
        <Check checked={draft.allAgents} onChange={(allAgents) => set({ allAgents })} hint="Every agent, including new ones">Everyone</Check>
        {!draft.allAgents && (
          <div className="mt-2">
            <Notice>A session limited to selected agents works only with those agents: it can use tools that name an agent (look at it, pause it, wake it, give it work) and issues assigned to it. Views across every agent, like reports and the org chart, aren't available to it.</Notice>
            {room.agents.error ? (
              <p className="text-sm text-muted-foreground">{room.agents.error}</p>
            ) : (
              <>
                <input className={`${field} mb-2 w-full`} value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find an agent" aria-label="Find an agent" name="papercliped-agent-find" autoComplete="off" />
                <div className="max-h-64 overflow-y-auto rounded-md border p-1">
                  {agents.map((a) => (
                    <Check key={a.id} checked={draft.agents.includes(a.id)} onChange={(on) => set({ agents: flip(draft.agents, a.id, on) })} hint={a.title ?? a.role ?? undefined}>{a.name}</Check>
                  ))}
                  {agents.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">{room.agents.loading ? "Loading agents…" : "No agents match."}</p>}
                </div>
                {draft.agents.filter((id) => !(room.agents.data ?? []).some((a) => a.id === id)).length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">{draft.agents.filter((id) => !(room.agents.data ?? []).some((a) => a.id === id)).length} selected {"agent(s)"} are in another company or no longer exist; they stay selected.</p>
                )}
              </>
            )}
          </div>
        )}
      </Card>

      <div className="sticky bottom-0 -mx-1 mt-3 flex flex-wrap items-center gap-2 border-t bg-background/95 px-1 py-3">
        <button type="button" className={primary} disabled={!dirty || !!problem || busy} onClick={save}>{busy ? "Saving…" : "Save changes"}</button>
        <button type="button" className={button} disabled={!dirty || busy} onClick={() => setDraft(base)}>Discard</button>
        {problem && dirty ? <span role="alert" className="text-sm text-destructive">{problem}</span> : dirty ? <span className="text-sm text-muted-foreground">Unsaved changes</span> : null}
      </div>

      <Card label="Recent calls" className="mt-3">
        <CardTitle>Recent calls</CardTitle>
        {!recent.data ? (
          <p className="text-sm text-muted-foreground">{recent.error ?? "Loading…"}</p>
        ) : recent.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">This session hasn't made a call yet.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {recent.data.map((c, i) => (
              <li key={`${c.at}-${i}`} className="flex items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 truncate font-mono text-xs">{c.tool}</span>
                <span className="flex shrink-0 items-center gap-2"><Pill tone={c.blocked ? "warn" : c.ok ? "good" : "bad"}>{c.blocked ? "Blocked" : c.ok ? "OK" : "Error"}</Pill><span className="w-16 text-right text-xs text-muted-foreground">{ago(c.at)}</span></span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card label="Disconnect" className="mt-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1 basis-64">
            <h2 className="text-base font-semibold">Disconnect this session</h2>
            <p className="text-sm text-muted-foreground">The app stops working at once. Connecting it again starts a new session.</p>
          </div>
          {confirming ? (
            <span className="flex gap-2"><button type="button" className={danger} onClick={disconnect}>Disconnect {session.label ?? session.app}</button><button type="button" className={button} onClick={() => setConfirming(false)}>Keep</button></span>
          ) : (
            <button type="button" className={danger} onClick={() => setConfirming(true)}>Disconnect</button>
          )}
        </div>
      </Card>
    </div>
  );
}
