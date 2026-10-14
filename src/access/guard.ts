import type { PaperclipClient } from "../client.js";
import { redactAgents } from "./policy.js";

/**
 * A view of the user's Paperclip in which some agents do not exist. Every response is stripped of those agents before a tool
 * sees it, so reports, lists and syncs are all consistent: a report built from this client cannot name a hidden agent,
 * because it never received one. Anything the server already summed (totals) is left as it is.
 */
export function guardClient(client: PaperclipClient, hidden: ReadonlySet<string>): PaperclipClient {
  if (hidden.size === 0) return client;
  const g = Object.create(client) as PaperclipClient;
  const request = async <T>(...args: Parameters<PaperclipClient["request"]>): Promise<T> => redactAgents(await client.request<T>(...args), hidden);
  g.request = request as PaperclipClient["request"];
  g.get = (<T = unknown>(path: string, query?: Parameters<PaperclipClient["get"]>[1]) => request<T>("GET", path, { query })) as PaperclipClient["get"];
  g.post = (<T = unknown>(path: string, body?: unknown) => request<T>("POST", path, { body: body ?? {} })) as PaperclipClient["post"];
  g.patch = (<T = unknown>(path: string, body: unknown) => request<T>("PATCH", path, { body })) as PaperclipClient["patch"];
  return g;
}
