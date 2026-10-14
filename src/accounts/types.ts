import type { AccountPolicy } from "../access/policy.js";

export interface Account {
  id: string;
  /** As the user typed it (shown only in the operator's logs). */
  username: string;
  /** Lowercased, unique. */
  usernameKey: string;
  secretHash: string;
  createdAt: number;
  lastLoginAt: number | null;
  disabled: boolean;
  /** Opted in to appear under `alias` (and an anonymous instance label) in logs and the operator dashboard. */
  anonymous?: boolean;
  /** Generated once, stable for the life of the account even if anonymity is toggled. */
  alias?: string | null;
  /** Joined the beta: gets the connection manager and its API. */
  beta?: boolean;
  /** The access switch and per-agent overrides. Absent = Full for every agent. */
  policy?: AccountPolicy | null;
}

/** The account's connection to its Paperclip (one per account). The credential is sealed in the app. */
export interface AccountLink {
  accountId: string;
  /** Origin of the user's Paperclip. */
  instanceUrl: string;
  /** Paperclip's own user id — the proof of "same Paperclip identity" when someone reconnects. */
  paperclipUserId: string | null;
  sealedCredential: string | null;
  /** When Paperclip expires that credential (ms epoch). null = never; absent (old JSON stores) = connectedAt + Paperclip's default TTL. */
  credentialExpiresAt?: number | null;
  createdAt: number;
  connectedAt: number;
  lastUsedAt: number;
  /** The host, or "anon-xxxxxx" for anonymous accounts. What logs and the operator dashboard show. */
  instanceLabel?: string | null;
}

export type UserEventKind =
  | "started" //        someone opened the connect screen
  | "completed" //      a client received tokens (detail: new | connect | login)
  | "joined" //         new account created
  | "login" //          signed in with username + secret key
  | "login_failed" //   wrong username/secret, or rate-limited
  | "updated" //        reconnected (key replaced) or secret key rotated
  | "left" //           disconnected, expired for inactivity, or deleted
  | "key" //            their Paperclip key was renewed before it expired (detail: rotated | failed)
  | "plugin" //         the Papercliped plugin install ran in their Paperclip (detail: installed | already | denied | unsupported | failed)
  | "connect_failed"; // flow ended without a connection (detail: denied | expired | unreachable | invalid_instance | …)

export interface UserEvent {
  id?: number;
  at: number;
  accountId: string | null;
  username: string | null;
  kind: UserEventKind;
  /** Short, non-sensitive reason or path. Never a secret, token, URL with credentials, or user-supplied free text. */
  detail: string | null;
}

export interface UserEventBucket {
  t: number;
  completed: number;
  failed: number;
  joined: number;
}

/** One health reading from a running bridge process (the public status API and the operator dashboard read these to see the bridge is alive). */
export interface NodeSample {
  at: number;
  node: string;
  dbPingMs: number | null;
  loopLagP99Ms: number;
  rssMb: number;
  heapMb: number;
  uptimeS: number;
  version: string;
}

/** What changes when someone turns anonymity on or off. */
export interface PrivacyChange {
  anonymous: boolean;
  alias: string;
  /** The name logs and the dashboard show after the change, and the one they showed before. */
  display: string;
  prevDisplay: string;
  instanceLabel: string;
  prevInstanceLabel: string;
}

export class AliasTakenError extends Error {}
