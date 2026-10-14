import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { DEFAULT_BRIDGE_URL } from "./bridge.js";

const manifest: PaperclipPluginManifestV1 = {
  id: "papercliped.remote-control",
  apiVersion: 1,
  version: "2.5.3",
  displayName: "Papercliped",
  description: "A control room for the AI apps connected to your Paperclip through Papercliped: every session, what each may use, which agents it applies to, an API only / Full / Agent only switch, and what happened.",
  author: "OpenSourcx",
  categories: ["connector", "ui"],
  capabilities: ["plugin.state.read", "plugin.state.write", "http.outbound", "agents.read", "ui.sidebar.register", "ui.page.register", "ui.detailTab.register", "ui.dashboardWidget.register"],
  entrypoints: { worker: "dist/worker.js", ui: "dist/ui" },
  instanceConfigSchema: {
    type: "object",
    properties: {
      bridgeUrl: {
        type: "string",
        title: "Papercliped bridge URL",
        description: "Where your Papercliped bridge runs. Must be https. Change it only if you host your own bridge.",
        default: DEFAULT_BRIDGE_URL,
      },
    },
  },
  ui: {
    slots: [
      { type: "sidebar", id: "papercliped-nav", displayName: "Papercliped", exportName: "PapercliedSidebar", order: 90 },
      { type: "page", id: "papercliped-page", displayName: "Papercliped", exportName: "PapercliedPage", routePath: "papercliped", order: 90 },
      // While the control room is open, its own menu replaces the company menu, like Paperclip does on an agent's page.
      { type: "routeSidebar", id: "papercliped-menu", displayName: "Papercliped", exportName: "PapercliedRouteSidebar", routePath: "papercliped" },
      { type: "detailTab", id: "papercliped-agent", displayName: "Papercliped", exportName: "PapercliedAgentTab", entityTypes: ["agent"], order: 90 },
      { type: "dashboardWidget", id: "papercliped-widget", displayName: "Papercliped", exportName: "PapercliedWidget", order: 90 },
    ],
  },
};

export default manifest;
