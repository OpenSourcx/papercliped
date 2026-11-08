import type { AnchorHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { docsHostSlug, isExternal, resolveHref } from "../lib/hosts";

/** Paths the React app renders itself; other same-site paths (like /status.json or /api) are bridge paths and need a full load. */
const APP_PATH = /^\/(docs(\/|$)|epaperclip$|pin$|papercliped$|connect$|changelog$|community$|brand$|status$|privacy$|terms$|kit$|$)/;
/** Whether this app renders the path on this host (on the docs host that is / and /<page>). */
export const isAppPath = (path: string) => (docsHostSlug(path) != null ? true : APP_PATH.test(path));

/**
 * A link that goes to the right host: client-side navigation when the page is in this app on this host, a normal link
 * otherwise (other host, bridge page, external site).
 */
export function AppLink({ to, children, ...rest }: { to: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const href = resolveHref(to);
  if (isExternal(href) || !isAppPath(href.split("#")[0])) return <a href={href} rel={isExternal(href) ? "noopener noreferrer" : undefined} {...rest}>{children}</a>;
  return <Link to={href} {...rest}>{children}</Link>;
}
