import { useEffect, useMemo, useState } from "react";
import { usePluginAction } from "@paperclipai/plugin-sdk/ui";
import { failureOf } from "../action-error.js";
import { errText } from "./format.js";
import type { Call } from "./types.js";

/** Every plugin action the pages use, as one stable object. */
export function useCalls(): Call {
  const raw = {
    status: usePluginAction("status"), link: usePluginAction("link"), connections: usePluginAction("connections"),
    setLevel: usePluginAction("setLevel"), disconnect: usePluginAction("disconnect"), privacy: usePluginAction("privacy"),
    links: usePluginAction("links"), removeLink: usePluginAction("removeLink"), unlink: usePluginAction("unlink"),
    rotateSecret: usePluginAction("rotateSecret"), disconnectPaperclip: usePluginAction("disconnectPaperclip"), deleteAccount: usePluginAction("deleteAccount"),
    serviceStatus: usePluginAction("serviceStatus"),
    sessions: usePluginAction("sessions"), setSession: usePluginAction("setSession"), policy: usePluginAction("policy"), setPolicy: usePluginAction("setPolicy"),
    tools: usePluginAction("tools"), activity: usePluginAction("activity"), agents: usePluginAction("agents"),
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => Object.fromEntries(Object.entries(raw).map(([k, fn]) => [k, unwrap(fn)])) as unknown as Call, Object.values(raw));
}

/** The worker returns expected failures as data (see action-error.ts); throw them here so every page handles them as errors. */
function unwrap(fn: (p?: never) => Promise<unknown>) {
  return async (p?: never) => {
    const r = await fn(p);
    const msg = failureOf(r);
    if (msg) throw new Error(msg);
    return r;
  };
}

export interface Loaded<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
  /** Replace the data right away (an optimistic update, or the answer to a save). */
  set: (v: T | ((old: T | null) => T)) => void;
}

/** Load something once (and again on `reload`, or every `everyMs`), keeping the last good value while a refresh runs. */
export function useLoad<T>(load: () => Promise<T>, deps: readonly unknown[], everyMs = 0): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .then((v) => alive && (setData(v), setError(null)))
      .catch((e) => alive && setError(errText(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  useEffect(() => {
    if (!everyMs) return;
    const t = setInterval(() => setTick((n) => n + 1), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return { data, error, loading, reload: () => setTick((n) => n + 1), set: (v) => setData((old) => (typeof v === "function" ? (v as (o: T | null) => T)(old) : v)) };
}
