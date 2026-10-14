// Paperclip's own classes, so the page looks like part of Paperclip in every theme (light, dark, seasonal): the same card,
// input, button, tab and text styles it uses on its settings pages. They are the host's classes, not ours, and are read from
// its pages; a test checks that every class used here exists in the host's stylesheet when run against a live instance.
// Status, tables and metrics come from Paperclip's own components.

const BUTTON_BASE = "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium shrink-0 outline-none transition-colors disabled:pointer-events-none disabled:opacity-50 h-9 rounded-md px-3 gap-2";

/** A bordered card. */
export const panel = "bg-card text-card-foreground rounded-lg border p-4 my-3";
/** Items in a wrapping line. */
export const row = "flex flex-wrap items-center gap-2";
/** Secondary text. */
export const muted = "text-sm text-muted-foreground my-1";
/** A card heading. */
export const h2 = "text-base font-semibold mb-2";
/** The page title. */
export const title = "text-xl font-semibold";
/** Text inputs and selects. */
export const field = "h-9 rounded-md border border-border bg-transparent px-2.5 text-sm outline-none";
/** The main action. */
export const primary = `${BUTTON_BASE} bg-primary text-primary-foreground hover:bg-primary/90`;
/** Any other action. */
export const button = `${BUTTON_BASE} border border-border hover:bg-accent hover:text-accent-foreground`;
/** An action that removes something. */
export const danger = `${BUTTON_BASE} border border-destructive/40 text-destructive hover:bg-destructive/10`;
/** The tab strip and one tab. */
export const tabs = "flex gap-1 border-b border-border mt-4 mb-1 overflow-x-auto";
export const tab = (on: boolean) => `px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${on ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`;
/** An inline value to copy, like a secret key. */
export const code = "font-mono text-xs px-1.5 py-0.5 rounded-md border border-border select-all";
