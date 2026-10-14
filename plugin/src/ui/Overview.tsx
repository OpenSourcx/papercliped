import { useEffect, useMemo } from "react";
import { usePluginToast } from "@paperclipai/plugin-sdk/ui";
import { Card, CardTitle, Empty, Notice, PageHeader, Pill, Stat } from "./atoms.js";
import { useLoad } from "./calls.js";
import { ago, errText } from "./format.js";
import { Icon } from "./icons.js";
import { MODES, modeTitle, surfaceAllowed } from "./modes.js";
import { useRoom, useRoomLinks } from "./room.js";
import { AccessSwitch } from "./Switch.js";
import type { CallRow, Mode } from "./types.js";

const DAY = 86_400_000;

/** The control room's front page: the access switch, the numbers that matter, and what needs a look. */
export function Overview() {
  const room = useRoom();
  const toast = usePluginToast();
  const link = useRoomLinks();
  const { policy, sessions, tools, agents } = room;
  const calls = useLoad(async () => ((await room.call.activity({ limit: 100 })) as { calls: CallRow[] }).calls, [room.call], 30_000);

  const mode = policy.data?.mode ?? "full";
  const current = MODES.find((m) => m.id === mode)!;
  const overrides = Object.keys(policy.data?.agents ?? {});
  const off = Object.values(policy.data?.agents ?? {}).filter((m) => m === "off").length;
  const available = useMemo(() => (tools.data ?? []).filter((t) => surfaceAllowed(mode, t.surface)).length, [tools.data, mode]);
  const today = (calls.data ?? []).filter((c) => Date.now() - c.at < DAY);
  const blocked = today.filter((c) => c.blocked).length;
  const quiet = (sessions.data ?? []).filter((s) => !s.lastUsedAt);
  const limited = (sessions.data ?? []).filter((s) => s.tools || s.agents).length;

  useEffect(() => {
    if (policy.error) toast({ title: "Couldn't load the access settings", body: policy.error, tone: "error" });
  }, [policy.error]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (m: Mode) => {
    if (!policy.data || m === policy.data.mode) return;
    room.savePolicy({ ...policy.data, mode: m }).then(() => toast({ title: `Papercliped is now ${modeTitle(m)}`, tone: "success" })).catch(() => undefined);
  };

  return (
    <div>
      <PageHeader title="Control room" subtitle="Everything AI apps can do in your Paperclip, who they are, and what each is allowed." />
      <div className="grid gap-3 md:grid-cols-2">
        <Card label="Access">
          <CardTitle hint="One switch for every agent. You can set any agent apart on the Agents page.">Access</CardTitle>
          {policy.data ? (
            <AccessSwitch value={mode} onChange={change} />
          ) : policy.error ? (
            <Notice tone="bad" action={<button type="button" className="underline underline-offset-2" onClick={policy.reload}>Try again</button>}>{policy.error}</Notice>
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          <p className="mt-4 text-sm text-muted-foreground">{current.body}</p>
          {tools.data && (
            <p className="mt-2 text-xs text-muted-foreground">
              {available} of {tools.data.length} tools are available in this mode{overrides.length ? `, and ${overrides.length} ${overrides.length === 1 ? "agent is" : "agents are"} set apart` : ""}.
            </p>
          )}
        </Card>

        <div className="grid grid-cols-2 gap-3 self-start">
          <Stat label="Sessions" value={sessions.data?.length ?? "—"} hint={limited ? `${limited} with limits` : "none limited"} />
          <Stat label="Agents" value={agents.data?.length ?? "—"} hint={off ? `${off} off` : overrides.length ? `${overrides.length} set apart` : "all follow the switch"} />
          <Stat label="Calls today" value={calls.data ? today.length : "—"} hint="through your sessions" />
          <Stat label="Blocked today" value={calls.data ? blocked : "—"} hint={blocked ? "see Activity" : "nothing refused"} />
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Card label="Needs a look">
          <CardTitle>Needs a look</CardTitle>
          <ul className="space-y-2 text-sm">
            {(sessions.data ?? []).length === 0 && !sessions.loading && (
              <li className="text-muted-foreground">No AI app is connected yet. Add Papercliped as a connector in Claude or ChatGPT and it appears here.</li>
            )}
            {quiet.map((s) => (
              <li key={s.id} className="flex items-start gap-2">
                <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span><a {...link("sessions", s.id)} className="font-medium underline underline-offset-2">{s.label ?? s.app}</a> hasn't made a call yet.</span>
              </li>
            ))}
            {off > 0 && (
              <li className="flex items-start gap-2">
                <Icon name="ban" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{off} {off === 1 ? "agent is" : "agents are"} <a {...link("agents")} className="font-medium underline underline-offset-2">off</a>: AI apps can't see {off === 1 ? "it" : "them"}.</span>
              </li>
            )}
            {blocked > 0 && (
              <li className="flex items-start gap-2">
                <Icon name="triangle-alert" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{blocked} {blocked === 1 ? "call was" : "calls were"} <a {...link("activity")} className="font-medium underline underline-offset-2">blocked</a> in the last day.</span>
              </li>
            )}
            {!room.me.connected && (
              <li className="flex items-start gap-2">
                <Icon name="triangle-alert" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>Your Paperclip key is not connected: connect again from your AI app.</span>
              </li>
            )}
            {sessions.data && sessions.data.length > 0 && quiet.length === 0 && off === 0 && blocked === 0 && room.me.connected && (
              <li className="flex items-start gap-2 text-muted-foreground"><Icon name="circle-check" className="mt-0.5 h-4 w-4 shrink-0" /> Nothing needs attention.</li>
            )}
          </ul>
        </Card>

        <Card label="Recent activity">
          <CardTitle>Recent activity</CardTitle>
          {calls.error ? (
            <p className="text-sm text-muted-foreground">{calls.error}</p>
          ) : !calls.data ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : calls.data.length === 0 ? (
            <Empty icon="activity" title="No calls yet">When an AI app uses Papercliped, each call shows up here: what it used, and whether it went through.</Empty>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {calls.data.slice(0, 6).map((c, i) => (
                <li key={`${c.at}-${i}`} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="min-w-0 truncate"><span className="font-medium">{c.app ?? "An app"}</span> <span className="text-muted-foreground">used</span> <span className="font-mono text-xs">{c.tool.replace(/^papercliped?_/, "")}</span></span>
                  <span className="flex shrink-0 items-center gap-2"><Pill tone={c.blocked ? "warn" : c.ok ? "good" : "bad"}>{c.blocked ? "Blocked" : c.ok ? "OK" : "Error"}</Pill><span className="w-16 text-right text-xs text-muted-foreground">{ago(c.at)}</span></span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs"><a {...link("activity")} className="underline underline-offset-2">All activity</a></p>
        </Card>
      </div>
      {sessions.error && <Notice tone="warn">{`Couldn't load your sessions: ${errText(sessions.error)}`}</Notice>}
    </div>
  );
}
