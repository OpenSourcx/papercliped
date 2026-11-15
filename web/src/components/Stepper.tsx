import { useEffect, useState, type ReactNode } from "react";
import { cx } from "./cx";

/** Numbered steps you can click through; advances on its own unless the visitor prefers reduced motion or has interacted. */
export function Stepper({ steps }: { steps: { title: string; body: ReactNode }[] }) {
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % steps.length), 4500);
    return () => clearInterval(t);
  }, [auto, steps.length]);
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <ol className="flex flex-col gap-2">
        {steps.map((s, n) => (
          <li key={s.title}>
            <button type="button" aria-current={n === i ? "step" : undefined} onClick={() => { setI(n); setAuto(false); }}
              className={cx("flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all duration-150", n === i ? "border-accent bg-surface shadow-md" : "border-line")}>
              <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-full font-display text-lg font-bold", n === i ? "bg-accent text-accent-ink" : "border border-field")}>{n + 1}</span>
              <span className="font-semibold">{s.title}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="rounded-lg border border-line bg-surface p-5" aria-live="polite">
        <p className="text-sm font-bold text-muted">Step {i + 1} of {steps.length}</p>
        <h3 key={i} className="animate-pop mt-1 text-2xl font-semibold">{steps[i].title}</h3>
        <div className="mt-2 text-ink">{steps[i].body}</div>
      </div>
    </div>
  );
}
