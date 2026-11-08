import { useEffect } from "react";

const SITE = "https://papercliped.co";

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Papercliped` : "Papercliped";
  }, [title]);
}

function setMeta(sel: string, attr: "content" | "href", value: string) {
  document.head.querySelector(sel)?.setAttribute(attr, value);
}

/** Title, description, canonical and Open Graph tags for one page. Crawlers that run no JavaScript see the defaults in index.html. */
export function usePageMeta(title: string, description: string, path: string) {
  useEffect(() => {
    document.title = `${title} · Papercliped`;
    const url = SITE + path;
    let canon = document.head.querySelector('link[rel="canonical"]');
    if (!canon) {
      canon = document.createElement("link");
      canon.setAttribute("rel", "canonical");
      document.head.appendChild(canon);
    }
    canon.setAttribute("href", url);
    setMeta('meta[name="description"]', "content", description);
    setMeta('meta[property="og:title"]', "content", `${title} · Papercliped`);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[property="og:url"]', "content", url);
  }, [title, description, path]);
}
