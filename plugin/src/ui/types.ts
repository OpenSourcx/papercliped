import type { CallRow, Mode, Policy, Session, ToolInfo } from "../bridge.js";

export type { CallRow, Mode, Policy, Session, ToolInfo };
export interface Me { name: string; anonymous: boolean; alias: string | null; paperclip: string | null; connected: boolean }
export interface Conn { id: string; app: string; level: string; createdAt: number; lastUsedAt: number | null }
export interface Link { id: string; host: string | null; createdAt: number; lastUsedAt: number | null; current: boolean }
export interface Service { status: "ok" | "degraded" | "down"; version: string; users: number | null; liveConnections: number | null; requestSuccessRate: number | null; signInSuccessRate: number | null; p95Ms: number | null; statusPage: string }
export interface Agent { id: string; name: string; role: string | null; title: string | null; status: string }
export type Status = { linked: false; expired?: boolean } | { linked: true; me: Me };

/** The plugin actions the page calls (see src/handlers.ts). */
export type Call = Record<
  | "status" | "link" | "connections" | "setLevel" | "disconnect" | "privacy" | "links" | "removeLink" | "unlink" | "rotateSecret" | "disconnectPaperclip" | "deleteAccount" | "serviceStatus"
  | "sessions" | "setSession" | "policy" | "setPolicy" | "tools" | "activity" | "agents",
  (params?: Record<string, unknown>) => Promise<unknown>
>;
