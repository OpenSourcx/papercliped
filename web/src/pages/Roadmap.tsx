import { AppLink } from "../components/AppLink";
import { ROADMAP } from "../content/products";
import { usePageTitle } from "./usePageTitle";

/** Every product and feature area with an honest status, from content/products.ts. No dates: nothing here is promised for a day. */
export function Roadmap() {
  usePageTitle("What we're building");
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-12 sm:pt-16">
      <h1 className="text-4xl font-semibold sm:text-5xl">What we're building</h1>
      <p className="mt-4 max-w-3xl text-lg">Each part of Papercliped and where it stands today. <strong className="font-semibold">Available</strong> means released and usable. <strong className="font-semibold">Preview</strong> means released but new, partial or pre-release. <strong className="font-semibold">In progress</strong> is being built. <strong className="font-semibold">Planned</strong> is not started. We don't give dates we haven't committed to.</p>
      {ROADMAP.map((a) => (
        <section key={a.name} className="mt-12" aria-labelledby={`r-${a.name.replace(/\W+/g, "-").toLowerCase()}`}>
          <h2 id={`r-${a.name.replace(/\W+/g, "-").toLowerCase()}`} className="text-2xl font-semibold">{a.name}</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <caption className="sr-only">{a.name}: features and their status</caption>
              <thead><tr className="border-b border-line text-muted"><th scope="col" className="py-2 pr-4 font-medium">Feature</th><th scope="col" className="w-32 py-2 pr-4 font-medium">Status</th><th scope="col" className="w-32 py-2 font-medium">More</th></tr></thead>
              <tbody>
                {a.items.map((i) => (
                  <tr key={i.title} className="border-b border-line align-top">
                    <th scope="row" className="py-3 pr-4 font-normal">{i.title}{i.note ? <span className="block text-muted">{i.note}</span> : null}</th>
                    <td className="py-3 pr-4 font-medium">{i.status}</td>
                    <td className="py-3"><AppLink to={i.to} className="text-link underline">Details</AppLink></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
