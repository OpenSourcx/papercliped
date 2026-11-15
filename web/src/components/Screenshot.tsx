/**
 * A real console screenshot (see scripts/screens.mjs): AVIF with a WebP fallback, in the theme the visitor is using. The site's palette
 * follows the device for light and dark through CSS alone, so `prefers-color-scheme` picks the matching file. Width and height are the
 * real pixel size so nothing shifts while it loads; only the one above the fold is eager and high priority.
 */
export const SHOT_W = 1440;
export const SHOT_H = 900;

export function Screenshot({ name, alt, priority = false, caption = "Demo data" }: { name: string; alt: string; priority?: boolean; caption?: string | null }) {
  const src = (theme: "dark" | "light", ext: "avif" | "webp") => `/screens/${name}-${theme}.${ext}`;
  return (
    <figure className="m-0">
      <picture>
        <source type="image/avif" media="(prefers-color-scheme: light)" srcSet={src("light", "avif")} />
        <source type="image/webp" media="(prefers-color-scheme: light)" srcSet={src("light", "webp")} />
        <source type="image/avif" srcSet={src("dark", "avif")} />
        <img
          src={src("dark", "webp")}
          width={SHOT_W}
          height={SHOT_H}
          alt={alt}
          decoding="async"
          loading={priority ? "eager" : "lazy"}
          {...(priority ? { fetchPriority: "high" as const } : {})}
          className="h-auto w-full rounded-lg border border-line shadow-lg"
        />
      </picture>
      {caption ? <figcaption className="mt-2 text-sm text-muted">{caption}</figcaption> : null}
    </figure>
  );
}
