// Writes data the website shows, generated from the real code so it can't drift: the tool catalogue with the scope each tool
// needs. Run after `npm run build`:  node scripts/gen-web-data.mjs   (test/web-data.test.ts fails if the file is stale)
import { readFileSync, writeFileSync } from "node:fs";
import { surfaceOfTool } from "../dist/access/policy.js";
import { requiredScope } from "../dist/oauth/scopes.js";
import { tools } from "../dist/tools.js";

export function toolData(list = tools, scopeOf = requiredScope) {
  return list.map((t) => ({ name: t.name, title: t.title, description: t.description, access: t.access, scope: scopeOf(t, {}), surface: surfaceOfTool(t) }));
}

const WORKS_IN = { read: "Every mode", agent: "Full, Agent only", api: "Full, API only" };

/** The tool reference page (site/docs/tools.md), served by the bridge and the docs site. */
export function toolsMarkdown(data = toolData()) {
  const groups = [["paperclip:read", "Read only"], ["paperclip:control", "Full control"]];
  const esc = (s) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  let md = `# Tool reference\n\nEvery tool Papercliped gives your AI app, generated from the code (\`src/tools.ts\`). ${data.length} tools in total. There are two levels: **Read only** can use the read tools; **Full control** can use every tool.\n\nRaw API calls (\`paperclip_api_request\`) need Read only for GET and Full control for anything else.\n`;
  for (const [scope, title] of groups) {
    const rows = data.filter((t) => t.scope === scope);
    md += `\n## ${title} (${rows.length})\n\n| Tool | What it does | Changes anything? | Works in |\n| --- | --- | --- | --- |\n`;
    for (const t of rows) md += `| **${esc(t.title)}** \`${t.name}\` | ${esc(t.description)} | ${t.access === "read" ? "No" : t.access === "destructive" ? "Yes, can't be undone" : "Yes"} | ${t.name === "paperclip_api_request" ? "GET: every mode; other methods: Full, API only" : WORKS_IN[t.surface]} |\n`;
  }
  return md + `\n**Works in** is the [access switch](/docs/access-modes): *every mode* tools only look; *Full, Agent only* tools hand work to agents; *Full, API only* tools control Paperclip directly. See [Permissions](/docs/permissions) for how levels work and how to change them.\n`;
}

/** The level a prompt needs: Full control if any of its tools changes something. */
export function promptLevel(p, data = toolData()) {
  return p.tools.some((n) => data.find((t) => t.name === n)?.scope === "paperclip:control") ? "Full control" : "Read only";
}

/** The prompt gallery page (site/docs/prompts.md), from web/src/content/prompts.json (the website's /prompts reads the same file). */
export function promptsMarkdown(gallery, data = toolData()) {
  let md = `# Prompt gallery\n\nPapercliped lets you run your Paperclip by talking to your AI app, so you don't have to click through the dashboard to make a task, wake an agent or answer an approval. Copy a prompt, replace the parts in [brackets], and send it. Your AI app picks the right tools.\n\nEach prompt says the level it needs. **Read only** prompts only look; **Full control** prompts change something, and your AI app asks before anything that can't be undone. Browse and copy them on [papercliped.co/prompts]({{URL}}/prompts).\n\n## Tips\n\n- **Use names, not ids.** Say "the Web Engineer" or "the onboarding issue"; your AI app looks up the ids.\n- **More than one company?** Start with "Use [company name] for this chat."\n- **Ask for a preview.** Add "show me before you create anything" to any prompt that makes several changes.\n- **Chain steps.** "Wake X, wait until they finish, then summarise" works in one message.\n- **Not sure what's possible?** Ask "What can you do with my Paperclip?"\n`;
  for (const c of gallery.categories) {
    md += `\n## ${c.title}\n\n${c.intro}\n`;
    for (const p of gallery.prompts.filter((x) => x.category === c.id)) {
      md += `\n### ${p.title}\n\n> ${p.prompt.replace(/\n/g, "\n> ")}\n\n${promptLevel(p, data)} · ${p.tools.map((t) => `\`${t}\``).join(", ")}${p.note ? `\n\n${p.note}` : ""}\n`;
    }
  }
  return md + `\nGot a prompt that works well? Share it in [the community]({{URL}}/community) or open a pull request that adds it to \`web/src/content/prompts.json\`. Every tool is listed in the [tool reference](/docs/tools).\n`;
}

const out = new URL("../web/src/generated/tools.json", import.meta.url);
writeFileSync(out, JSON.stringify(toolData(), null, 2) + "\n");
writeFileSync(new URL("../site/docs/tools.md", import.meta.url), toolsMarkdown());
const gallery = JSON.parse(readFileSync(new URL("../web/src/content/prompts.json", import.meta.url), "utf8"));
writeFileSync(new URL("../site/docs/prompts.md", import.meta.url), promptsMarkdown(gallery));
console.log(`wrote ${out.pathname}, site/docs/tools.md and site/docs/prompts.md`);
