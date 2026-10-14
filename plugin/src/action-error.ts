/**
 * Paperclip answers a failed plugin action with HTTP 502, and a proxy in front of Paperclip (Cloudflare, for one) swaps that
 * for its own HTML error page, so the message never reaches the page. The worker therefore returns expected failures as
 * ordinary data under this key, and the page turns them back into errors.
 */
export const ACTION_ERROR = "papercliped_error";

export interface ActionFailure {
  [ACTION_ERROR]: string;
}

export const failure = (e: unknown): ActionFailure => ({
  [ACTION_ERROR]: (e instanceof Error && e.message ? e.message : "Something went wrong. Try again.").slice(0, 300),
});

export const failureOf = (v: unknown): string | null =>
  v && typeof v === "object" && typeof (v as Record<string, unknown>)[ACTION_ERROR] === "string" ? ((v as Record<string, string>)[ACTION_ERROR] as string) : null;
