import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Icon, type IconName } from "./icons.js";
import { MODES } from "./modes.js";
import type { Mode } from "./types.js";

/** The knob's travel. Overshoots a little and settles, like a physical switch; instant when the person prefers less motion. */
function useTravel() {
  const [calm, setCalm] = useState(false);
  useEffect(() => {
    const q = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!q) return;
    setCalm(q.matches);
    const on = (e: MediaQueryListEvent) => setCalm(e.matches);
    q.addEventListener?.("change", on);
    return () => q.removeEventListener?.("change", on);
  }, []);
  return calm ? "none" : "transform 260ms cubic-bezier(0.34, 1.45, 0.5, 1)";
}

/** Arrow keys move through a radio group, the way the platform's own radios do. */
function useArrows(count: number, index: number, pick: (i: number) => void) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + count) % count;
    pick(next);
    refs.current[next]?.focus();
  };
  return { refs, onKeyDown };
}

const ROW = 56; // height of one position on the vertical switch, in px
const KNOB = 40;

/**
 * The access switch: three positions on a vertical track (API only, Full, Agent only) with a knob that slides between them.
 * Click a position, drag-free; arrow keys work; the selected position is announced as a radio.
 */
export function AccessSwitch({ value, onChange, disabled, label = "What AI apps may do" }: { value: Mode; onChange: (m: Mode) => void; disabled?: boolean; label?: string }) {
  const transition = useTravel();
  const index = Math.max(0, MODES.findIndex((m) => m.id === value));
  const { refs, onKeyDown } = useArrows(MODES.length, index, (i) => !disabled && onChange(MODES[i].id));
  return (
    <div role="radiogroup" aria-label={label} aria-disabled={disabled} onKeyDown={onKeyDown} className="flex items-stretch gap-4">
      <div
        className="relative shrink-0 rounded-full border border-border bg-muted"
        style={{ width: KNOB + 16, height: ROW * MODES.length, boxShadow: "inset 0 2px 6px rgb(0 0 0 / 0.12)" }}
        aria-hidden="true"
      >
        <div
          className="absolute left-2 flex items-center justify-center rounded-full border border-border bg-primary text-primary-foreground"
          style={{ top: (ROW - KNOB) / 2, width: KNOB, height: KNOB, transform: `translateY(${index * ROW}px)`, transition, boxShadow: "0 3px 8px rgb(0 0 0 / 0.25)" }}
        >
          <Icon name={MODES[index].icon} className="h-4 w-4" />
        </div>
      </div>
      <div className="flex min-w-0 flex-col">
        {MODES.map((m, i) => {
          const on = i === index;
          return (
            <button
              key={m.id}
              ref={(el) => void (refs.current[i] = el)}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(m.id)}
              className={`flex flex-col justify-center rounded-md px-2 text-left outline-none transition-colors disabled:pointer-events-none disabled:opacity-50 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring ${on ? "text-foreground" : "text-muted-foreground"}`}
              style={{ height: ROW }}
            >
              <span className={`text-sm ${on ? "font-semibold" : "font-medium"}`}>{m.title}</span>
              <span className="text-xs text-muted-foreground">{m.short}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface Choice<V extends string> {
  id: V;
  label: string;
  icon?: IconName;
  hint?: string;
}

/**
 * A row of choices with a sliding highlight, for tight places (an agent's row, the dashboard widget).
 * Same behaviour as the access switch: one selected, arrow keys, announced as radios.
 */
export function Segmented<V extends string>({ value, choices, onChange, disabled, label, size = "md" }: { value: V; choices: Choice<V>[]; onChange: (v: V) => void; disabled?: boolean; label: string; size?: "sm" | "md" }) {
  const transition = useTravel();
  const index = Math.max(0, choices.findIndex((c) => c.id === value));
  const { refs, onKeyDown } = useArrows(choices.length, index, (i) => !disabled && onChange(choices[i].id));
  return (
    <div role="radiogroup" aria-label={label} aria-disabled={disabled} onKeyDown={onKeyDown} className={`relative w-full sm:w-auto rounded-lg border border-border bg-muted p-0.5`} style={{ display: "inline-grid", gridAutoRows: "1fr", gridTemplateColumns: `repeat(${choices.length}, minmax(0, 1fr))` }}>
      <div
        aria-hidden="true"
        className="absolute top-0.5 rounded-md border border-border bg-card"
        style={{ left: 2, bottom: 2, width: `calc((100% - 4px) / ${choices.length})`, transform: `translateX(${index * 100}%)`, transition, boxShadow: "0 1px 3px rgb(0 0 0 / 0.12)" }}
      />
      {choices.map((c, i) => {
        const on = i === index;
        return (
          <button
            key={c.id}
            ref={(el) => void (refs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            disabled={disabled}
            title={c.hint}
            onClick={() => onChange(c.id)}
            className={`relative z-10 ${size === "sm" ? "h-7" : "h-8"} inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-1.5 sm:px-3 text-xs font-medium outline-none transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring ${on ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {c.icon && <span className="hidden sm:inline-flex"><Icon name={c.icon} className="h-3.5 w-3.5" /></span>}
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

/** The three access modes as a compact row. */
export function ModeRow({ value, onChange, disabled, label = "What AI apps may do", size }: { value: Mode; onChange: (m: Mode) => void; disabled?: boolean; label?: string; size?: "sm" | "md" }) {
  return <Segmented value={value} choices={MODES.map((m) => ({ id: m.id, label: m.title, icon: m.icon, hint: m.body }))} onChange={onChange} disabled={disabled} label={label} size={size} />;
}

/** A small caption under something, in the page's secondary text style. */
export function Hint({ children }: { children: ReactNode }) {
  return <p className="my-1 text-xs text-muted-foreground">{children}</p>;
}
