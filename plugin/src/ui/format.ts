/** Paperclip's host rejects actions with a plain object ({ code, message }), not an Error, so look inside before falling back. */
export function errText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const m = (e as { message?: unknown; error?: unknown }).message ?? (e as { error?: unknown }).error;
    if (typeof m === "string" && m) return m;
  }
  return "Something went wrong. Try again.";
}
export function ago(ms: number | null) {
  if (!ms) return "never";
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
}
export const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 1000) / 10}`);
export const LEVEL = { "paperclip:read": "Read only", "paperclip:control": "Full control" } as Record<string, string>;
