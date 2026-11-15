/**
 * How ePaperclip fits together, as inline SVG so it follows the theme (colours come from the site's tokens) and needs no request.
 * Every box and arrow is something the engine repository states: the browser talks to the ePaperclip service on port 443, which calls the
 * Proxmox API as the signed-in person; agents run in unprivileged containers; Pin proposes and the person approves.
 */
const BOX = "fill-[var(--surface)] stroke-[var(--line)]";
export function Diagram() {
  return (
    <figure className="m-0">
      <svg viewBox="0 0 760 330" role="img" aria-labelledby="dg-t dg-d" className="h-auto w-full text-[var(--ink)]">
        <title id="dg-t">How ePaperclip works</title>
        <desc id="dg-d">A browser connects to the ePaperclip service on port 443. The service calls the Proxmox API as the signed-in person. Agents run in unprivileged containers on the same host. Pin proposes changes and the person approves them.</desc>
        <defs>
          <marker id="dg-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--muted)" /></marker>
        </defs>
        <g fontFamily="var(--font-sans)" fontSize="15">
          <rect x="10" y="125" width="150" height="70" rx="8" className={BOX} strokeWidth="1" />
          <text x="85" y="156" textAnchor="middle" fill="currentColor" fontWeight="600">Your browser</text>
          <text x="85" y="177" textAnchor="middle" fill="var(--muted)" fontSize="13">https, port 443</text>

          <rect x="230" y="20" width="280" height="290" rx="12" fill="none" stroke="var(--line)" strokeDasharray="5 4" />
          <text x="244" y="42" fill="var(--muted)" fontSize="13">Your Proxmox host</text>

          <rect x="250" y="60" width="240" height="70" rx="8" className={BOX} />
          <text x="370" y="90" textAnchor="middle" fill="currentColor" fontWeight="600">ePaperclip service</text>
          <text x="370" y="111" textAnchor="middle" fill="var(--muted)" fontSize="13">runs as its own user, not root</text>

          <rect x="250" y="150" width="240" height="60" rx="8" className={BOX} />
          <text x="370" y="177" textAnchor="middle" fill="currentColor" fontWeight="600">Proxmox VE</text>
          <text x="370" y="196" textAnchor="middle" fill="var(--muted)" fontSize="13">API as the signed-in person</text>

          <rect x="250" y="230" width="240" height="64" rx="8" className={BOX} />
          <text x="370" y="257" textAnchor="middle" fill="currentColor" fontWeight="600">Agent containers</text>
          <text x="370" y="277" textAnchor="middle" fill="var(--muted)" fontSize="13">unprivileged, no host folders</text>

          <rect x="570" y="125" width="180" height="70" rx="8" className={BOX} />
          <text x="660" y="156" textAnchor="middle" fill="currentColor" fontWeight="600">Pin (optional)</text>
          <text x="660" y="177" textAnchor="middle" fill="var(--muted)" fontSize="13">proposes, you approve</text>
        </g>
        <g stroke="var(--muted)" strokeWidth="1.5" fill="none" markerEnd="url(#dg-a)">
          <path d="M160 160H238L250 100" />
          <path d="M370 130V150" />
          <path d="M370 210V230" />
          <path d="M570 160H498" markerEnd="url(#dg-a)" />
        </g>
      </svg>
      <figcaption className="mt-2 text-sm text-muted">Pin and agents are optional. The console works on Proxmox's own permissions either way.</figcaption>
    </figure>
  );
}
