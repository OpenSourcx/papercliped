// No imports, so the website (web/) can reuse this renderer as is.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * A deliberately small Markdown renderer for the project's own pages (docs, privacy, terms). Everything is HTML-escaped first;
 * only a fixed set of constructs produces tags, and links are limited to http(s), mailto and same-site paths.
 */
const safeHref = (h: string) => (/^(https?:\/\/|mailto:|\/|#)/i.test(h) && !/^\/\//.test(h) ? h : null);

function inline(src: string): string {
  const codes: string[] = [];
  let s = esc(src).replace(/`([^`]+)`/g, (_m, c) => `\u0000${codes.push(`<code>${c}</code>`) - 1}\u0000`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, href) => {
    const h = safeHref(href.replace(/&amp;/g, "&"));
    if (!h) return m;
    const ext = /^https?:/i.test(h);
    return `<a href="${esc(h)}"${ext ? ' rel="noopener noreferrer"' : ""}>${text}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i) => codes[Number(i)]);
}

const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const text = h[2];
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      out.push(`<h${h[1].length} id="${esc(id)}">${inline(text)}</h${h[1].length}>`);
      i++;
      continue;
    }
    if (/^\|.*\|\s*$/.test(line) && /^\|?\s*:?-{2,}/.test(lines[i + 1] ?? "")) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<div class="tw"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    if (/^>/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote>${renderMarkdown(buf.join("\n"))}</blockquote>`);
      continue;
    }
    const ul = /^[-*]\s+/.test(line), ol = /^\d+\.\s+/.test(line);
    if (ul || ol) {
      const items: string[] = [];
      const re = ul ? /^[-*]\s+(.*)$/ : /^\d+\.\s+(.*)$/;
      while (i < lines.length && re.test(lines[i])) {
        const body = [re.exec(lines[i++])![1]];
        // An item continues on indented lines, including fenced code and blank lines followed by more indented content.
        while (i < lines.length && !re.test(lines[i])) {
          if (/^\s+\S/.test(lines[i])) body.push(lines[i++]);
          else if (!lines[i].trim() && /^\s+\S/.test(lines[i + 1] ?? "") && !re.test(lines[i + 1] ?? "")) body.push(lines[i++]);
          else break;
        }
        const rich = body.some((l) => /^\s*```/.test(l) || !l.trim());
        if (!rich) items.push(`<li>${inline(body.map((l) => l.trim()).join(" "))}</li>`);
        else {
          const rest = body.slice(1);
          const pad = Math.min(...rest.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)![0].length));
          items.push(`<li>${renderMarkdown([body[0], ...rest.map((l) => l.slice(Math.min(pad, /^\s*/.exec(l)![0].length)))].join("\n"))}</li>`);
        }
      }
      out.push(ul ? `<ul>${items.join("")}</ul>` : `<ol>${items.join("")}</ol>`);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|```|[-*]\s|\d+\.\s|>)/.test(lines[i]) && !/^\|.*\|\s*$/.test(lines[i])) para.push(lines[i++].trim());
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out.join("\n");
}
