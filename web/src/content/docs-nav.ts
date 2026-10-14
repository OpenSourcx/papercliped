/** The docs table of contents. Every page in site/docs/*.md must be listed exactly once (test/docs.test.ts checks). */
export const DOCS_NAV: { title: string; slugs: string[] }[] = [
  { title: "Get started", slugs: ["what-is-papercliped", "getting-started", "signup"] },
  { title: "Host your Paperclip", slugs: ["hosting", "connect-your-paperclip", "host-vps", "host-railway", "host-render", "host-fly", "host-coolify"] },
  { title: "Connect your AI app", slugs: ["other-ai-apps", "chatgpt"] },
  { title: "Guides", slugs: ["prompts", "permissions", "control-room", "access-modes", "manage", "paperclip-plugin", "anonymous-mode", "self-hosting"] },
  { title: "Reference", slugs: ["tools", "manage-api", "public-api", "environment", "cli", "limits-and-errors", "security"] },
  { title: "Help", slugs: ["faq", "troubleshooting"] },
];

/** How the sidebar groups the sections, with an icon for each (names from components/Icons). */
export const DOCS_GROUPS: { label: string; sections: { title: string; icon: "rocket" | "plug" | "book" | "code" | "help" | "link" }[] }[] = [
  { label: "Learn", sections: [{ title: "Get started", icon: "rocket" }, { title: "Host your Paperclip", icon: "link" }, { title: "Connect your AI app", icon: "plug" }, { title: "Guides", icon: "book" }] },
  { label: "Reference", sections: [{ title: "Reference", icon: "code" }, { title: "Help", icon: "help" }] },
];

export const DOC_ORDER = DOCS_NAV.flatMap((s) => s.slugs);
export const sectionOf = (slug: string) => DOCS_NAV.find((s) => s.slugs.includes(slug))?.title ?? "Docs";
/** Where "Edit on GitHub" goes: the generated tools page is edited in the code, not the Markdown. */
export const editUrl = (slug: string) => (slug === "tools" ? "https://github.com/OpenSourcx/papercliped/blob/main/src/tools.ts" : `https://github.com/OpenSourcx/papercliped/edit/main/site/docs/${slug}.md`);
/** The page's Markdown on GitHub. */
export const sourceUrl = (slug: string) => (slug === "tools" ? "https://github.com/OpenSourcx/papercliped/blob/main/site/docs/tools.md" : `https://github.com/OpenSourcx/papercliped/blob/main/site/docs/${slug}.md`);
