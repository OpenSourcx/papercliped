import { useSearchParams } from "react-router-dom";
import { Mascot } from "../components/Mascot";

/**
 * Not linked anywhere: frames that scripts/render-assets.mjs and scripts/icon-pack.mjs screenshot into the wordmark PNGs, the
 * social preview image and the social banners.
 * Excluded from the sitemap and robots.
 */
export function RenderFrame() {
  const [q] = useSearchParams();
  const kind = q.get("kind");
  if (kind === "og")
    return (
      <div id="frame" className="flex h-[630px] w-[1200px] items-center gap-14 bg-bg px-24">
        <Mascot size={300} interactive={false} title="" />
        <div>
          <p className="font-display text-5xl font-bold lowercase text-muted">papercliped</p>
          <p className="mt-4 font-display text-7xl font-bold leading-tight">Papercliped, not Paperclipped.</p>
          <p className="mt-6 text-3xl text-muted">Connect Claude, ChatGPT or any MCP app to your Paperclip.</p>
        </div>
      </div>
    );
  // Social banners: X header (1500×500; the avatar covers the bottom left, so the content sits right of centre) and a
  // 16:9 banner for Discord, YouTube and directory listings.
  if (kind === "x-header")
    return (
      <div id="frame" className="flex h-[500px] w-[1500px] items-center justify-end gap-12 bg-bg pr-28">
        <div className="text-right">
          <p className="whitespace-nowrap font-display text-6xl font-bold leading-tight">Run your Paperclip<br />from any AI app.</p>
          <p className="mt-5 text-3xl text-muted">Claude · ChatGPT · Codex · any MCP app — free and open source</p>
          <p className="mt-6 font-mono text-2xl text-muted">papercliped.co</p>
        </div>
        <Mascot size={220} interactive={false} title="" />
      </div>
    );
  if (kind === "banner")
    return (
      <div id="frame" className="flex h-[540px] w-[960px] flex-col items-center justify-center gap-6 bg-bg px-16 text-center">
        <Mascot size={170} interactive={false} title="" />
        <p className="font-display text-6xl font-bold lowercase">papercliped</p>
        <p className="text-2xl text-muted">Run your Paperclip from Claude, ChatGPT, Codex or any MCP app.</p>
      </div>
    );
  return (
    <div id="frame" className="inline-flex items-center gap-4 bg-bg px-8 py-6">
      <Mascot size={96} interactive={false} title="" />
      <span className="font-display text-7xl font-bold lowercase">papercliped</span>
    </div>
  );
}
