import { useEffect, useState } from "react";
import { cx } from "./cx";
import { Icon } from "./Icons";
import { Mascot } from "./Mascot";

type Row = { name: string; before: string; after: string };
interface Scenario {
  id: string;
  label: string;
  ask: string;
  tools: string[];
  reply: string;
  panel: string;
  rows: Row[];
}

/** Three short, scripted exchanges. The tool names are the real ones from src/tools.ts. */
const SCENARIOS: Scenario[] = [
  {
    id: "pause",
    label: "Pause an agent",
    ask: "Pause the agent that's over budget.",
    tools: ["paperclip_list_agents", "paperclip_pause_agent"],
    reply: "Paused Web Engineer. It had used 112% of its monthly budget.",
    panel: "Agents",
    rows: [
      { name: "CEO", before: "Running", after: "Running" },
      { name: "Web Engineer", before: "Running", after: "Paused" },
      { name: "Mail Officer", before: "Idle", after: "Idle" },
    ],
  },
  {
    id: "report",
    label: "Weekly report",
    ask: "How did my agents do this week?",
    tools: ["paperclip_report_agent_performance", "paperclip_report_costs"],
    reply: "18 issues closed and 2 blocked. Spend was $41.20, down 9% on last week.",
    panel: "This week",
    rows: [
      { name: "Issues closed", before: "…", after: "18" },
      { name: "Blocked", before: "…", after: "2" },
      { name: "Spend", before: "…", after: "$41.20" },
    ],
  },
  {
    id: "approve",
    label: "Approve a request",
    ask: "Approve the CEO's request to hire a support agent.",
    tools: ["paperclip_list_approvals", "paperclip_decide_approval"],
    reply: "Approved. The CEO can now hire a Support Agent.",
    panel: "Approvals",
    rows: [
      { name: "Hire: Support Agent", before: "Pending", after: "Approved" },
      { name: "Budget: +$20 / month", before: "Pending", after: "Pending" },
    ],
  },
];

const STEPS = 5; // 0 empty · 1 question · 2 tools running · 3 tools done, Paperclip updates · 4 answer
const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** The homepage hero: an AI app on the left steering a Paperclip on the right. Pick a tab to replay another exchange. */
export function HeroDemo({ className }: { className?: string }) {
  const [i, setI] = useState(0);
  const [step, setStep] = useState(() => (reduced() ? STEPS - 1 : 0));
  const [auto, setAuto] = useState(true);
  const s = SCENARIOS[i];

  useEffect(() => {
    if (reduced()) return setStep(STEPS - 1);
    if (step < STEPS - 1) {
      const t = setTimeout(() => setStep((x) => x + 1), step === 0 ? 400 : 900);
      return () => clearTimeout(t);
    }
    if (!auto) return;
    const t = setTimeout(() => {
      setI((x) => (x + 1) % SCENARIOS.length);
      setStep(0);
    }, 4200);
    return () => clearTimeout(t);
  }, [step, auto, i]);

  const pick = (n: number) => {
    setAuto(false);
    setI(n);
    setStep(reduced() ? STEPS - 1 : 0);
  };

  return (
    <div className={cx("overflow-hidden rounded-xl border border-line bg-surface", className)}>
      <div role="tablist" aria-label="Examples" className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2">
        {SCENARIOS.map((x, n) => (
          <button key={x.id} type="button" role="tab" aria-selected={n === i} onClick={() => pick(n)}
            className={cx("shrink-0 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors", n === i ? "bg-bg text-ink shadow-sm" : "text-muted hover:text-ink")}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="grid md:grid-cols-[1.25fr_1fr]">
        {/* The AI app */}
        <div className="min-h-[17rem] space-y-3 p-5 text-left sm:p-6" aria-live="polite">
          <p className="text-xs font-bold text-muted">Your AI app</p>
          {step >= 1 && <p className="animate-toast-in ml-auto w-fit max-w-[85%] rounded-lg rounded-br-md bg-accent px-4 py-2.5 text-accent-ink">{s.ask}</p>}
          {step >= 2 && (
            <ul className="animate-toast-in flex flex-wrap gap-2">
              {s.tools.map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bg px-2.5 py-1 font-mono text-xs text-muted">
                  <span aria-hidden="true" className={cx("h-1.5 w-1.5 rounded-full", step >= 3 ? "bg-ink" : "animate-pulse-dot bg-muted")} />
                  {t}
                  <span className="sr-only">{step >= 3 ? " done" : " running"}</span>
                </li>
              ))}
            </ul>
          )}
          {step >= 4 && (
            <div className="animate-toast-in flex max-w-[90%] gap-2.5">
              <Mascot size={28} interactive={false} title="" className="shrink-0" />
              <p className="rounded-lg rounded-tl-md border border-line bg-bg px-4 py-2.5">{s.reply}</p>
            </div>
          )}
        </div>
        {/* The Paperclip it controls */}
        <div className="border-t border-line bg-bg/60 p-5 text-left sm:p-6 md:border-l md:border-t-0">
          <p className="flex items-center justify-between text-xs font-bold text-muted">
            <span>Your Paperclip · {s.panel}</span>
            <Icon name="clock" size={13} />
          </p>
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-bg">
            {s.rows.map((r) => {
              const v = step >= 3 ? r.after : r.before;
              const changed = step >= 3 && r.after !== r.before;
              return (
                <li key={r.name} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="font-medium">{r.name}</span>
                  <span className={cx("rounded-lg border px-2.5 py-0.5 text-xs font-semibold tabular-nums transition-colors duration-300", changed ? "border-accent bg-accent text-accent-ink" : "border-line text-muted")}>{v}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-muted">Every change goes through the level you chose. Read only can look; Full control can act.</p>
        </div>
      </div>
    </div>
  );
}
