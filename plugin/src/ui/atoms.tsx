import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons.js";

// Small pieces every page uses. Paperclip's own classes (see look.ts), so they follow its theme.

export function Card({ children, className = "", label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <section aria-label={label} className={`bg-card text-card-foreground rounded-lg border p-4 ${className}`}>
      {children}
    </section>
  );
}

export function CardTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-semibold">{children}</h2>
      {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export type Tone = "neutral" | "good" | "warn" | "bad";
const DOT: Record<Tone, string> = { neutral: "currentColor", good: "#16a34a", warn: "#d97706", bad: "#dc2626" };

/** A small label with a coloured dot, so meaning never rests on colour alone: the words say it too. */
export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: DOT[tone], opacity: tone === "neutral" ? 0.5 : 1 }} />
      {children}
    </span>
  );
}

export function Notice({ children, tone = "neutral", action }: { children: ReactNode; tone?: "neutral" | "warn" | "bad"; action?: ReactNode }) {
  return (
    <div role={tone === "bad" ? "alert" : "status"} className="my-3 flex items-start gap-2 rounded-lg border p-3 text-sm">
      <Icon name={tone === "neutral" ? "info" : "triangle-alert"} className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export function Empty({ icon = "info", title, children }: { icon?: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-10 text-center">
      <Icon name={icon} className="h-5 w-5 text-muted-foreground" />
      <p className="text-sm font-medium">{title}</p>
      {children && <p className="max-w-md text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}

/** A yes/no toggle in Paperclip's switch look. */
export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${checked ? "bg-primary" : "bg-input"}`}
    >
      <span aria-hidden="true" className="inline-block h-4 w-4 rounded-full bg-background" style={{ transform: `translateX(${checked ? 16 : 0}px)`, transition: "transform 160ms ease-out", boxShadow: "0 1px 2px rgb(0 0 0 / 0.3)" }} />
    </button>
  );
}

export function Check({ checked, onChange, children, disabled, hint }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean; hint?: ReactNode }) {
  return (
    <label className={`flex items-start gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
      <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0 flex-1">
        <span className="block">{children}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}
