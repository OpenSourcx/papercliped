import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { AppLink } from "./AppLink";
import { cx } from "./cx";

type Variant = "primary" | "secondary" | "ghost";
const BTN = "inline-flex items-center justify-center gap-2 rounded-lg font-semibold select-none transition-[background-color,border-color,opacity] duration-150 ease-out disabled:pointer-events-none disabled:opacity-50";
const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:opacity-90",
  secondary: "border border-line bg-bg/40 text-ink hover:border-field hover:bg-surface",
  ghost: "text-ink hover:bg-surface",
};
const SIZE = { sm: "h-8 px-3.5 text-sm", md: "h-10 px-5", lg: "h-12 px-7 text-base" };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: keyof typeof SIZE;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "primary", size = "md", className, type = "button", ...rest }, ref) {
  return <button ref={ref} type={type} className={cx(BTN, VARIANT[variant], SIZE[size], className)} {...rest} />;
});

/** A link that looks like a button. External links open normally (no target juggling) and are marked rel=noopener. */
export function ButtonLink({ to, variant = "primary", size = "md", className, children }: { to: string; variant?: Variant; size?: keyof typeof SIZE; className?: string; children: ReactNode }) {
  return <AppLink to={to} className={cx(BTN, VARIANT[variant], SIZE[size], className)}>{children}</AppLink>;
}

export function TextLink({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return <AppLink to={to} className={cx("text-link underline decoration-1 underline-offset-2 hover:decoration-2", className)}>{children}</AppLink>;
}

/** A surface. `interactive` darkens the border on hover; nothing moves. */
export function Card({ children, className, interactive = false, as: As = "div" }: { children: ReactNode; className?: string; interactive?: boolean; as?: "div" | "section" | "article" | "li" }) {
  return <As className={cx("rounded-lg border border-line bg-surface p-6", interactive && "transition-colors duration-150 hover:border-field", className)}>{children}</As>;
}

export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center rounded-lg border border-line px-2.5 py-0.5 text-xs font-medium text-muted", className)}>{children}</span>;
}

export function Badge({ children, tone = "accent", className }: { children: ReactNode; tone?: "accent" | "outline"; className?: string }) {
  return <span className={cx("inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-semibold", tone === "accent" ? "bg-accent text-accent-ink" : "border border-field text-ink", className)}>{children}</span>;
}

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}
export function Field({ label, hint, error, id, className, ...rest }: FieldProps) {
  const auto = useId();
  const fid = id ?? auto;
  const hid = hint ? `${fid}-hint` : undefined;
  const eid = error ? `${fid}-err` : undefined;
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <label htmlFor={fid} className="text-sm font-medium">{label}</label>
      <input id={fid} aria-describedby={[hid, eid].filter(Boolean).join(" ") || undefined} aria-invalid={error ? true : undefined}
        className="h-10 rounded-lg border border-field bg-transparent px-3 text-ink placeholder:text-muted" {...rest} />
      {hint && <span id={hid} className="text-sm text-muted">{hint}</span>}
      {error && <span id={eid} role="alert" className="text-sm font-medium text-ink">⚠ {error}</span>}
    </div>
  );
}

export function Table({ head, rows, caption }: { head: ReactNode[]; rows: ReactNode[][]; caption?: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full border-collapse text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-surface">
          <tr>{head.map((h, i) => <th key={i} scope="col" className="border-b border-line px-4 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => <tr key={i} className="border-b border-line last:border-0">{r.map((c, j) => <td key={j} className="px-4 py-2 align-top">{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

const CALLOUT = { note: "ℹ", tip: "✦", warning: "⚠", danger: "⛔" } as const;
export function Callout({ kind = "note", title, children }: { kind?: keyof typeof CALLOUT; title?: string; children: ReactNode }) {
  return (
    <aside className={cx("my-4 flex gap-3 rounded-xl border p-4", kind === "warning" || kind === "danger" ? "border-accent" : "border-line", "bg-surface")} role={kind === "danger" ? "alert" : "note"}>
      <span aria-hidden="true" className="text-lg leading-6">{CALLOUT[kind]}</span>
      <div>
        <p className="font-semibold">{title ?? kind[0].toUpperCase() + kind.slice(1)}</p>
        <div className="text-ink">{children}</div>
      </div>
    </aside>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="font-display text-3xl font-bold">{value}</div>
      {hint && <div className="text-sm text-muted">{hint}</div>}
    </div>
  );
}
