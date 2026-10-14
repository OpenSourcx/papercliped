import { useHostLocation, useHostNavigation } from "@paperclipai/plugin-sdk/ui";

// The same classes Paperclip puts on its own sidebar links (Tasks, Artifacts, Cases ...), so this entry gets the same spacing,
// type, colours, hover and active look in every theme, light or dark. They are the host's classes, not ours.
export const ITEM = "flex items-center gap-2.5 mx-2 rounded-lg px-2 py-1.5 pointer-coarse:py-1 text-(length:--text-compact) font-medium transition-colors";
export const IDLE = "text-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
export const ACTIVE = "bg-sidebar-accent text-sidebar-accent-foreground";

/** The Lucide "paperclip" icon (ISC licence), drawn like Paperclip's other sidebar icons: 16px, 2px line, current colour. */
export function PaperclipIcon() {
  return (
    <span data-slot="sidebar-nav-icon" className="relative shrink-0">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-paperclip h-4 w-4" aria-hidden="true">
        <path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551" />
      </svg>
    </span>
  );
}

/** Where the Papercliped entry points: the page's route, and whether the user is on it now. */
export function isOnPapercliped(pathname: string): boolean {
  return pathname.replace(/\/+$/, "").split("/").at(-1) === "papercliped";
}

/** The "Papercliped" link in Paperclip's sidebar: an icon and a label, styled like every other entry. */
export function PapercliedSidebar() {
  const nav = useHostNavigation();
  const { pathname } = useHostLocation();
  const active = isOnPapercliped(pathname);
  return (
    <a {...nav.linkProps("/papercliped")} className={`${ITEM} ${active ? ACTIVE : IDLE}`} aria-current={active ? "page" : undefined}>
      <PaperclipIcon />
      <span className="min-w-0 flex-1 truncate">Papercliped</span>
    </a>
  );
}
