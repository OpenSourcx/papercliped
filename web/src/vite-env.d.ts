/// <reference types="vite/client" />
declare module "virtual:themes.css";
declare module "virtual:docs" {
  const docs: import("./lib/docsBuild").Doc[];
  export default docs;
}
interface ImportMetaEnv {
  readonly VITE_DISCORD_URL?: string;
  readonly VITE_REDDIT_URL?: string;
  readonly VITE_X_URL?: string;
  readonly VITE_DISCUSSIONS_URL?: string;
  readonly VITE_FORUM_URL?: string;
}
declare module "virtual:release" {
  /** Read from the npm registry when the site is built; null when it could not be read. */
  const release: { epaperclip: string | null };
  export default release;
}
