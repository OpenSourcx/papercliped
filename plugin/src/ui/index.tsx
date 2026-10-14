import { useCallback, useEffect, useState } from "react";
import { ErrorBoundary, Spinner, useHostContext, usePluginToast } from "@paperclipai/plugin-sdk/ui";
import { ActivityView } from "./ActivityView.js";
import { AgentsView } from "./AgentsView.js";
import { Notice } from "./atoms.js";
import { useCalls } from "./calls.js";
import { errText } from "./format.js";
import { LinkForm } from "./LinkForm.js";
import { muted, title } from "./look.js";
import { Overview } from "./Overview.js";
import { RoomProvider, useSection } from "./room.js";
import { Sessions } from "./Sessions.js";
import { Settings } from "./Settings.js";
import { PapercliedSidebar } from "./Sidebar.js";
import { PapercliedAgentTab, PapercliedRouteSidebar, PapercliedWidget } from "./Slots.js";
import { ToolsView } from "./ToolsView.js";
import type { Me, Status } from "./types.js";

// Everything Paperclip mounts: the sidebar entry, the control room's left menu and page, an agent tab and a dashboard widget.
export { PapercliedAgentTab, PapercliedRouteSidebar, PapercliedSidebar, PapercliedWidget };

/** The Papercliped control room inside Paperclip: link your account, then see and manage every session, agent and tool. */
export function PapercliedPage() {
  return (
    <ErrorBoundary fallback={<p role="alert" className="p-6">Something went wrong on this page. Reload to try again.</p>}>
      <Page />
    </ErrorBoundary>
  );
}

function Page() {
  const call = useCalls();
  const toast = usePluginToast();
  const ctx = useHostContext();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => {
    call.status().then((s) => { setStatus(s as Status); setError(null); }).catch((e) => setError(errText(e)));
  }, [call]);
  useEffect(refresh, [refresh]);
  const onMe = useCallback((me: Me) => setStatus({ linked: true, me }), []);

  return (
    <div className="max-w-5xl p-6">
      {error && (
        <Notice tone="bad" action={<button type="button" onClick={refresh} className="underline underline-offset-2 hover:text-foreground">Try again</button>}>{error}</Notice>
      )}
      {!status && !error && <Spinner label="Loading Papercliped" />}
      {status && !status.linked && (
        <>
          <h1 className={title}>Papercliped</h1>
          <p className={`${muted} mb-2`}>Connect Claude, ChatGPT or any MCP app to this Paperclip, and control exactly what each may do. Link your account to open the control room.</p>
          <LinkForm expired={!!status.expired} onLink={(username, secret) => call.link({ username, secret, instanceHost: window.location.host }).then((r) => { setStatus(r as Status); toast({ title: "Linked", tone: "success" }); })} />
        </>
      )}
      {status && status.linked && (
        <RoomProvider call={call} me={status.me} companyId={ctx.companyId} onUnlinked={refresh} onMe={onMe}>
          <Section />
        </RoomProvider>
      )}
    </div>
  );
}

function Section() {
  const { section } = useSection();
  switch (section) {
    case "sessions": return <Sessions />;
    case "agents": return <AgentsView />;
    case "tools": return <ToolsView />;
    case "activity": return <ActivityView />;
    case "settings": return <Settings />;
    default: return <Overview />;
  }
}
