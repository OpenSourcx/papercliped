import { AppLink } from "../components/AppLink";
import { cx } from "../components/cx";
import { ButtonLink, Card, TextLink } from "../components/ui";
import { byId, FIT, PRODUCTS, STATUS, type Product, type ProductId, type Shot, type Status } from "../content/products";
import { usePageMeta } from "./usePageTitle";

/** Status as text plus a shape, never colour alone. */
export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const s = STATUS[status];
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide",
      status === "live" ? "bg-accent text-accent-ink" : status === "early" ? "border border-field text-ink" : "border border-dashed border-field text-ink", className)}>
      <span aria-hidden="true">{s.mark}</span>{s.label}
    </span>
  );
}

/** A product card: used on the home page and the /products overview. */
export function ProductCard({ p }: { p: Product }) {
  return (
    <Card as="li" interactive className="flex flex-col p-6">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-2xl font-bold tracking-tight">{p.name}</h3>
        <StatusBadge status={p.status} />
      </div>
      <p className="mt-2 text-muted">{p.tagline}</p>
      <p className="mt-auto pt-5"><AppLink to={p.to} className="inline-flex min-h-11 items-center font-semibold underline decoration-1 underline-offset-4 hover:decoration-2" aria-label={`${p.name}: learn more`}>Learn more<span aria-hidden="true">&nbsp;→</span></AppLink></p>
    </Card>
  );
}

/** The picture: account, hosted services, your server, workers. A list, so it reads in order without the layout. */
export function HowTheyFit({ headingId = "fit-h" }: { headingId?: string }) {
  return (
    <ol aria-labelledby={headingId} className="mx-auto grid max-w-3xl gap-3">
      {FIT.map((f, i) => (
        <li key={f.title}>
          <div className={cx("rounded-2xl border p-5", f.zone.startsWith("Your") ? "border-field bg-surface" : "border-line bg-bg")}>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">{i + 1}. {f.zone}</p>
            <h3 className="mt-1 text-lg font-bold"><AppLink to={f.to} className="underline decoration-1 underline-offset-4 hover:decoration-2">{f.title}</AppLink></h3>
            <p className="mt-1 text-muted">{f.body}</p>
          </div>
          {i < FIT.length - 1 && <p aria-hidden="true" className="py-1 text-center text-xl text-muted">↓</p>}
        </li>
      ))}
    </ol>
  );
}

function Screenshot({ s }: { s: Shot }) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-line bg-surface">
      <picture>
        {s.dark && <source media="(prefers-color-scheme: dark)" srcSet={s.dark} />}
        <img src={s.light ?? s.dark} alt={s.alt} width={s.width} height={s.height} loading="lazy" className="h-auto w-full" />
      </picture>
      <figcaption className="border-t border-line px-4 py-3 text-sm text-muted">{s.caption}</figcaption>
    </figure>
  );
}

function Block({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
      <h2 id={id} className="text-3xl font-bold tracking-tighter sm:text-4xl">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

const Bullets = ({ items }: { items: string[] }) => <ul className="list-disc space-y-2 pl-5 text-muted">{items.map((t) => <li key={t}>{t}</li>)}</ul>;

export function ProductPage({ id }: { id: ProductId }) {
  const p = byId(id);
  usePageMeta(`${p.name}: ${p.tagline.replace(/\.$/, "")}`, p.description, p.to);
  const siblings = PRODUCTS.filter((x) => x.id !== id);
  return (
    <>
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="hero-glow" />
        <div className="relative mx-auto max-w-4xl px-4 pt-14 sm:pt-20">
          <p className="flex flex-wrap items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-muted">
            <AppLink to="/products" className="inline-flex min-h-11 items-center underline decoration-1 underline-offset-4">Papercliped products</AppLink>
            <StatusBadge status={p.status} />
          </p>
          <h1 className="mt-3 text-5xl font-bold leading-[0.95] tracking-tighter sm:text-7xl">{p.name}</h1>
          <p className="mt-4 max-w-2xl text-2xl font-medium tracking-tight sm:text-3xl">{p.tagline}</p>
          <p className="mt-5 max-w-2xl text-lg text-muted">{p.intro}</p>
          <p className="mt-5 max-w-2xl rounded-xl border border-line bg-surface p-4 text-sm"><strong>Status: {STATUS[p.status].label}.</strong> {p.statusDetail}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            {p.cta.map((c, i) => <ButtonLink key={c.label} to={c.to} size="lg" variant={i === 0 ? "primary" : "secondary"}>{c.label}</ButtonLink>)}
          </div>
        </div>
      </section>

      {p.id === "pin" && (
        <div className="mx-auto mt-10 flex max-w-4xl items-center gap-4 px-4">
          <img src="/products/pin-orb.svg" alt="" width={64} height={64} className="h-16 w-16" />
          <p className="text-sm text-muted">The orb is Pin's own mark. It belongs to Pin and is not the logo of ePaperclip, Papercliped or Connect.</p>
        </div>
      )}

      <Block id="who" title="Who it is for"><Bullets items={p.who} /></Block>
      <Block id="start" title="How to get started">
        <ol className="grid gap-4 sm:grid-cols-3">
          {p.how.map((h, i) => (
            <Card as="li" key={h.title}><p className="text-xs font-bold uppercase tracking-widest text-muted">Step {i + 1}</p><h3 className="mt-1 font-sans text-lg font-bold">{h.title}</h3><p className="mt-1 text-muted">{h.body}</p></Card>
          ))}
        </ol>
      </Block>
      <Block id="where" title="What runs where">
        <div className="grid gap-4 md:grid-cols-2">
          <Card><h3 className="font-sans text-lg font-bold">On your device</h3><div className="mt-3"><Bullets items={p.where.local} /></div></Card>
          <Card><h3 className="font-sans text-lg font-bold">Hosted by Papercliped</h3><div className="mt-3"><Bullets items={p.where.hosted} /></div></Card>
        </div>
      </Block>
      <Block id="trust" title="Privacy and security">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {p.trust.map((t) => <Card as="li" key={t.t}><h3 className="font-sans text-lg font-bold">{t.t}</h3><p className="mt-1 text-muted">{t.d}</p></Card>)}
        </ul>
        <p className="mt-6"><TextLink to="/docs/security">Read the security model</TextLink></p>
      </Block>
      <Block id="seen" title="What it looks like">
        <div className={cx("grid gap-6", p.shots.length > 1 && "md:grid-cols-2")}>{p.shots.map((s) => <Screenshot key={s.alt} s={s} />)}</div>
      </Block>
      <Block id="fit" title="How the products fit together">
        <HowTheyFit headingId="fit" />
      </Block>
      <Block id="more" title="The rest of the family">
        <ul className="grid gap-4 sm:grid-cols-3">{siblings.map((s) => <ProductCard key={s.id} p={s} />)}</ul>
      </Block>
    </>
  );
}

export function Products() {
  usePageMeta("Products", "The Papercliped family: Console, Connect, ePaperclip and Pin, and how they fit together. Honest status for each.", "/products");
  return (
    <>
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="hero-glow" />
        <div className="relative mx-auto max-w-4xl px-4 pb-6 pt-14 text-center sm:pt-20">
          <h1 className="text-5xl font-bold leading-[0.95] tracking-tighter sm:text-7xl">One account, four products.</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">Papercliped started by connecting AI apps to your Paperclip. It now has a family around it: a hosted Console and optional Connect, and ePaperclip with Pin on your own Proxmox server. Each page says plainly what is live and what is not.</p>
        </div>
      </section>
      <Block id="all" title="The products">
        <ul className="grid gap-4 sm:grid-cols-2">{PRODUCTS.map((p) => <ProductCard key={p.id} p={p} />)}</ul>
        <p className="mt-6 text-muted">Looking for the original? <TextLink to="/docs/getting-started">Connect Claude or ChatGPT to your Paperclip</TextLink> is live today.</p>
      </Block>
      <Block id="fit" title="How they fit together"><HowTheyFit headingId="fit" /></Block>
      <Block id="status" title="Status, honestly">
        <ul className="space-y-3">
          {(["live", "early", "soon"] as Status[]).map((s) => <li key={s} className="flex flex-wrap items-center gap-3"><StatusBadge status={s} /><span className="text-muted">{STATUS[s].note}</span></li>)}
        </ul>
      </Block>
    </>
  );
}
