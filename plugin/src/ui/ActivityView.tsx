import { useState } from "react";
import { Empty, Notice, PageHeader, Pill } from "./atoms.js";
import { useLoad } from "./calls.js";
import { ago } from "./format.js";
import { field } from "./look.js";
import { useRoom } from "./room.js";
import type { CallRow } from "./types.js";

const WHY: Record<string, string> = {
  policy_blocked: "Blocked by your settings",
  insufficient_scope: "Needs Full control",
  read_only: "Bridge is read-only",
  invalid_input: "Invalid request",
  upstream_4xx: "Paperclip refused it",
  upstream_5xx: "Paperclip had a problem",
  upstream_unreachable: "Paperclip unreachable",
  rate_limited: "Too many requests",
  unauthorized: "Not signed in",
  internal: "Something went wrong",
};

/** The newest calls through your sessions: what was used, by which app, and whether it went through. Never what was sent or returned. */
export function ActivityView() {
  const room = useRoom();
  const [session, setSession] = useState("");
  const [blockedOnly, setBlockedOnly] = useState(false);
  const calls = useLoad(async () => ((await room.call.activity({ session: session || undefined, limit: 100 })) as { calls: CallRow[] }).calls, [room.call, session], 20_000);
  const rows = (calls.data ?? []).filter((c) => !blockedOnly || c.blocked || !c.ok);

  return (
    <div>
      <PageHeader title="Activity" subtitle="The newest calls through your sessions. This shows what was used and what happened, never what was sent or returned." />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <select className={field} value={session} onChange={(e) => setSession(e.target.value)} aria-label="Session" name="papercliped-activity-session">
          <option value="">All sessions</option>
          {(room.sessions.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.label ?? s.app}</option>)}
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={blockedOnly} onChange={(e) => setBlockedOnly(e.target.checked)} /> Only blocked or failed</label>
        <button type="button" className="text-sm underline underline-offset-2 text-muted-foreground hover:text-foreground" onClick={calls.reload}>Refresh</button>
      </div>
      {calls.error && <Notice tone="bad">{calls.error}</Notice>}
      {!calls.data && !calls.error && <p className="text-sm text-muted-foreground">Loading…</p>}
      {calls.data && rows.length === 0 && <Empty icon="activity" title={blockedOnly ? "Nothing was blocked" : "No calls yet"}>{blockedOnly ? "Every call in this list went through." : "When an AI app uses Papercliped, each call appears here."}</Empty>}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th scope="col" className="px-4 py-2 font-medium">When</th>
                <th scope="col" className="px-4 py-2 font-medium">Session</th>
                <th scope="col" className="px-4 py-2 font-medium">Tool</th>
                <th scope="col" className="px-4 py-2 font-medium">Result</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((c, i) => (
                <tr key={`${c.at}-${i}`}>
                  <td className="whitespace-nowrap px-4 py-2 text-muted-foreground" title={new Date(c.at).toLocaleString()}>{ago(c.at)}</td>
                  <td className="px-4 py-2">{c.app ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs">{c.tool}</td>
                  <td className="px-4 py-2">
                    <Pill tone={c.blocked ? "warn" : c.ok ? "good" : "bad"}>{c.blocked ? "Blocked" : c.ok ? "OK" : "Failed"}</Pill>
                    {!c.ok && c.error && <span className="ml-2 text-xs text-muted-foreground">{WHY[c.error] ?? c.error}</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right text-xs tabular-nums text-muted-foreground">{c.ms} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
