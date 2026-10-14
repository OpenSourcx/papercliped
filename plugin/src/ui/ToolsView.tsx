import { useMemo, useState } from "react";
import { Card, Notice, PageHeader, Pill } from "./atoms.js";
import { field } from "./look.js";
import { modeTitle, SURFACE, surfaceAllowed, type SurfaceId } from "./modes.js";
import { useRoom } from "./room.js";
import type { Session, ToolInfo } from "./types.js";

const ORDER: SurfaceId[] = ["read", "agent", "api"];

/** Can a session ever use this tool (its level and its tool list)? The access switch is shown separately. */
const sessionCanUse = (s: Session, t: ToolInfo) => (s.level === "paperclip:control" || t.access === "read" || t.name === "paperclip_api_request") && (!s.tools || s.tools.includes(t.name));

/** Every tool, in one list: what it does, which surface it's on, whether the switch allows it, and how many sessions can use it. */
export function ToolsView() {
  const room = useRoom();
  const [find, setFind] = useState("");
  const mode = room.policy.data?.mode ?? "full";
  const sessions = room.sessions.data ?? [];
  const tools = room.tools.data ?? [];
  const shown = useMemo(() => tools.filter((t) => `${t.title} ${t.name} ${t.description}`.toLowerCase().includes(find.trim().toLowerCase())), [tools, find]);

  return (
    <div>
      <PageHeader title="Tools" subtitle={`All ${tools.length || ""} tools an AI app can use through Papercliped. The access switch is "${modeTitle(mode)}"; the list shows what that allows.`.replace("All  ", "All ")} />
      {room.tools.error && <Notice tone="bad" action={<button type="button" className="underline underline-offset-2" onClick={room.tools.reload}>Try again</button>}>{room.tools.error}</Notice>}
      <input className={`${field} mb-3 w-full sm:w-64`} value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a tool" aria-label="Find a tool" name="papercliped-tool-filter" autoComplete="off" />
      {room.tools.loading && !room.tools.data && <p className="text-sm text-muted-foreground">Loading…</p>}
      <div className="space-y-4">
        {ORDER.map((surface) => {
          const list = shown.filter((t) => t.surface === surface);
          if (!list.length) return null;
          const open = surfaceAllowed(mode, surface);
          return (
            <Card key={surface} label={SURFACE[surface].title}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold">{SURFACE[surface].title}</h2>
                  <p className="text-sm text-muted-foreground">{SURFACE[surface].blurb}</p>
                </div>
                <Pill tone={open ? "good" : "warn"}>{open ? `Allowed in ${modeTitle(mode)}` : `Not in ${modeTitle(mode)}`}</Pill>
              </div>
              <ul className="divide-y divide-border">
                {list.map((t) => {
                  const n = sessions.filter((s) => sessionCanUse(s, t)).length;
                  return (
                    <li key={t.name} className="flex flex-wrap items-start justify-between gap-2 py-2">
                      <div className="min-w-0 flex-1 basis-64">
                        <p className="text-sm font-medium">{t.title} <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">{t.name}</span></p>
                        <p className="text-xs text-muted-foreground">{t.description}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {t.access !== "read" && <Pill tone={t.access === "destructive" ? "bad" : "neutral"}>{t.access === "destructive" ? "Destructive" : "Changes things"}</Pill>}
                        {sessions.length > 0 && <span className="text-xs text-muted-foreground">{n} of {sessions.length} {sessions.length === 1 ? "session" : "sessions"}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
        {room.tools.data && shown.length === 0 && <p className="text-sm text-muted-foreground">No tools match.</p>}
      </div>
    </div>
  );
}
