import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { onDocsHost } from "./lib/hosts";
import { ToastProvider } from "./components/Toast";
import { Brand } from "./pages/Brand";
import { Changelog } from "./pages/Changelog";
import { Community } from "./pages/Community";
import { DocPage, DocsIndex } from "./pages/Docs";
import { Home } from "./pages/Home";
import { Legal } from "./pages/Legal";
import { RenderFrame } from "./pages/Render";
import { Status } from "./pages/Status";
import { Kit } from "./pages/Kit";
import { NotFound } from "./pages/Placeholder";
import { Prompts } from "./pages/Prompts";

/** Every route the site serves. scripts/check-routes.mjs loads each of these in a real browser. */
export const ROUTES = ["/", "/kit", "/docs", "/changelog", "/prompts", "/community", "/brand", "/privacy", "/terms", "/status"] as const;

export function App() {
  // docs.papercliped.co: the docs landing at / and each page at /<page> (the bridge maps hosts; see web/src/lib/hosts.ts).
  if (onDocsHost())
    return (
      <ToastProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<DocsIndex />} />
            <Route path="/:slug" element={<DocPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </ToastProvider>
    );
  return (
    <ToastProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/kit" element={<Kit />} />
          <Route path="/docs" element={<DocsIndex />} />
          <Route path="/docs/:slug" element={<DocPage />} />
          <Route path="/changelog" element={<Changelog />} />
          <Route path="/prompts" element={<Prompts />} />
          <Route path="/community" element={<Community />} />
          <Route path="/brand" element={<Brand />} />
          <Route path="/privacy" element={<Legal page="privacy" />} />
          <Route path="/terms" element={<Legal page="terms" />} />
          <Route path="/status" element={<Status />} />
          <Route path="/__render" element={<RenderFrame />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </ToastProvider>
  );
}
