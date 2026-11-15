import { Mascot } from "../components/Mascot";
import { ButtonLink } from "../components/ui";
import { usePageTitle } from "./usePageTitle";

/** Pages that the next phases fill in. Until then they point to what exists today. */
export function Placeholder({ title, note }: { title: string; note: string }) {
  usePageTitle(title);
  return (
    <section className="mx-auto max-w-2xl px-4 py-20 text-center">
      <Mascot size={80} />
      <h1 className="mt-4 text-4xl font-semibold">{title}</h1>
      <p className="mt-3 text-muted">{note}</p>
      <div className="mt-6 flex justify-center gap-3">
        <ButtonLink to="/">Home</ButtonLink>
        <ButtonLink to="https://github.com/OpenSourcx/papercliped" variant="secondary">GitHub</ButtonLink>
      </div>
    </section>
  );
}

export function NotFound() {
  return <Placeholder title="Page not found" note="That page doesn't exist (or hasn't been built yet)." />;
}
