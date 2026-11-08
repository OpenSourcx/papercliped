import { useState } from "react";
import { ButtonLink } from "./ui";

/**
 * A guided, local-only product demonstration. Never call host APIs or present sample
 * machine state as live telemetry. The production Pin runtime is a separate service.
 */
const EXAMPLES = [
  {
    name: "My homelab",
    question: "Pin, how's everything looking?",
    answer: "All the essentials in one view. Two machines are online, the backup is scheduled, and you've got room to build something new.",
    focus: "Overview",
    event: "Status explained",
    detail: "Your host, machines, storage, and next action",
  },
  {
    name: "Make a plan",
    question: "Pin, help me set up a coding workspace.",
    answer: "I can walk through the plan: choose a container, set a resource limit, pick the model, then ask you to approve before anything changes.",
    focus: "Workspace",
    event: "Plan drafted",
    detail: "Review before making host changes",
  },
  {
    name: "Stay in control",
    question: "Pin, who can touch my servers?",
    answer: "You decide. Keep your host credentials local, give agents their own resource groups, and revoke an app's access whenever you want.",
    focus: "Access",
    event: "Permissions explained",
    detail: "Local ownership stays local",
  },
] as const;

export function PinStage({ compact = false }: { compact?: boolean }) {
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<"assistant" | "agent">("assistant");
  const [wave, setWave] = useState(false);
  const item = EXAMPLES[active];

  const nudge = () => {
    setWave(true);
    setActive((i) => (i + 1) % EXAMPLES.length);
  };

  return (
    <div className={"pin-stage relative isolate overflow-hidden rounded-[2rem] border border-line bg-surface shadow-2xl shadow-black/10 " + (compact ? "p-4 sm:p-5" : "p-4 sm:p-6")}>
      <div className="absolute inset-0 pointer-events-none pin-stage-grid" aria-hidden="true" />
      <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent" />
          <span className="font-mono text-[11px] uppercase tracking-[.14em] text-muted">ePaperclip · PinView</span>
        </div>
        <span className="rounded-full border border-line bg-bg/80 px-3 py-1 text-[11px] font-semibold text-muted">Interactive demo · Sample data</span>
      </div>
      <div className="relative grid gap-5 pt-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-center">
        <div className="flex flex-col items-center justify-center text-center">
          <button type="button" aria-label="Ask Pin another example" onClick={nudge}
            onAnimationEnd={() => setWave(false)}
            className={"pin-orb-button group relative grid place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-ring " + (wave ? "pin-orb-bop" : "")}>
            <span aria-hidden="true" className="pin-orb-halo" />
            <span aria-hidden="true" className="pin-orb-face">
              <span className="pin-orb-glint" />
            </span>
          </button>
          <p className="mt-4 font-display text-lg font-bold">Hey, I'm Pin.</p>
          <p className="max-w-xs text-sm text-muted">Tap the orb. I have a few ideas.</p>
          <div role="group" aria-label="Pin demonstration mode" className="mt-5 inline-flex rounded-full border border-line bg-bg p-1">
            {(["assistant", "agent"] as const).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
                className={"rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-colors " + (mode === m ? "bg-accent text-accent-ink" : "text-muted hover:text-ink")}>
                {m} mode
              </button>
            ))}
          </div>
        </div>
        <div className="min-w-0">
          <div role="tablist" aria-label="Try Pin" className="flex flex-wrap gap-2">
            {EXAMPLES.map((it, i) => (
              <button type="button" role="tab" key={it.name} aria-selected={i === active} onClick={() => setActive(i)}
                className={"rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " + (i === active ? "border-accent bg-accent text-accent-ink" : "border-line bg-bg text-muted hover:text-ink")}>
                {it.name}
              </button>
            ))}
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-bg">
            <div className="flex items-center justify-between border-b border-line px-4 py-2 text-xs">
              <span className="font-semibold">{item.focus}</span>
              <span className="font-mono text-muted">PIN / 01</span>
            </div>
            <div className="min-h-[13rem] space-y-3 p-4" aria-live="polite">
              <p className="ml-auto w-fit max-w-[94%] rounded-2xl rounded-br-sm bg-accent px-3.5 py-2.5 text-sm text-accent-ink">{item.question}</p>
              <p className="w-fit max-w-[94%] rounded-2xl rounded-bl-sm border border-line bg-surface px-3.5 py-2.5 text-sm">{item.answer}</p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-xs text-muted">
              <span>{item.event}</span>
              <span className="max-w-[14rem] text-right">{item.detail}</span>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">
            {mode === "assistant"
              ? "Assistant mode explains and proposes. You approve meaningful changes."
              : "Agent mode follows your approved policies and limits. This example does not execute anything."}
          </p>
        </div>
      </div>
    </div>
  );
}