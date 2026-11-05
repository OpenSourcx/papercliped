#!/usr/bin/env node
import { readConfig, readHttpConfig } from "./config.js";
import { migrate } from "./migrate.js";
import { OAuthProvider } from "./oauth/provider.js";
import { createHttpServer } from "./server.js";
import { ManageRoutes } from "./manage/routes.js";
import { PublicApiRoutes } from "./public-api/routes.js";
import { SiteRoutes } from "./site/site.js";
import { VERSION } from "./version.js";
import { fileURLToPath } from "node:url";
import { parseHosts } from "./web/hosts.js";
import { WebAppRoutes } from "./web/routes.js";
import { createStore } from "./store-factory.js";
import { AuditRecorder, NodeReporter, SystemSampler } from "./telemetry/recorder.js";
import { MemoryStore } from "./oauth/store.js";

const SWEEP_EVERY_MS = 60 * 60 * 1000;
const KEEPALIVE_EVERY_MS = 10 * 60 * 1000;

async function main() {
  const config = readConfig();
  let http;
  try {
    http = readHttpConfig();
  } catch (e) {
    console.error(`Configuration error: ${(e as Error).message}`);
    process.exit(1);
  }
  if (!http.bridgeToken && !http.oauth) {
    console.error("Refusing to start: set BRIDGE_TOKEN (e.g. `openssl rand -hex 32`) and/or BRIDGE_OAUTH=1. The bridge exposes control of your agents.");
    process.exit(1);
  }

  // One store serves OAuth state, accounts and audit telemetry. The public stats API reads aggregates from it; the private
  // operator dashboard (a separate, access-controlled service) reads the same telemetry tables.
  const store = http.oauth ? createStore(http.oauth) : new MemoryStore();
  try {
    await store.ping();
  } catch (e) {
    console.error(`Cannot use the configured store: ${(e as Error).message}`);
    process.exit(1);
  }
  if (http.oauth && /^(1|true|yes|on)$/i.test(process.env.BRIDGE_AUTO_MIGRATE ?? "") && http.oauth.database) {
    // For hosts without a pre-deploy hook. Needs a connection that allows advisory locks (Supabase: session pooler / direct).
    const url = process.env.DATABASE_MIGRATE_URL?.trim();
    const db = url ? { ...http.oauth.database, connectionString: url } : http.oauth.database;
    const applied = await migrate(db).catch((e) => {
      console.error(`Auto-migrate failed: ${e.message}`);
      process.exit(1);
    });
    if (applied.length) console.error(`migrations applied: ${applied.join(", ")}`);
  }

  const provider = http.oauth ? new OAuthProvider({ config, oauth: http.oauth, bridgeToken: http.bridgeToken, store }) : null;
  const recorder = new AuditRecorder(store, { stderr: http.audit.stderr });
  recorder.start();
  const sampler = new SystemSampler(store);
  sampler.start();
  const reporter = new NodeReporter(store, sampler, recorder.node);
  reporter.start();

  // Public pages (landing, docs, privacy, terms) need the public https origin.
  const siteUrl = http.oauth?.issuer ?? http.publicUrl;
  const site = siteUrl
    ? new SiteRoutes({
        url: siteUrl,
        mcpUrl: http.oauth?.issuer ?? http.publicUrl ?? undefined,
        contact: process.env.SITE_CONTACT?.trim() || "https://github.com/OpenSourcx/papercliped/issues",
        effective: process.env.SITE_EFFECTIVE_DATE?.trim() || "2026-10-06",
        stats: async () => ({ users: await store.countAccounts(), connections: await store.liveGrantCount() }),
      })
    : undefined;
  const publicApi = new PublicApiRoutes({ store, version: VERSION, docsUrl: "https://papercliped.co/docs/public-api", publicUrl: siteUrl ?? undefined, proxyHops: http.oauth?.proxyHops ?? 0 });
  // The React website, when built (web/dist next to the package, or WEB_DIST); otherwise the bridge's own Markdown pages.
  const hosts = parseHosts(process.env.PUBLIC_HOSTS);
  const webDir = WebAppRoutes.locate(process.env, fileURLToPath(new URL("../web/dist", import.meta.url)));
  const web = webDir ? new WebAppRoutes({ dir: webDir, hosts, forumUrl: process.env.FORUM_URL?.trim() || null }) : undefined;
  if (web) console.error(`website: ${webDir}${process.env.PUBLIC_HOSTS ? ` (hosts: ${process.env.PUBLIC_HOSTS})` : ""}`);
  const manage = provider && http.oauth?.mode === "multi" ? new ManageRoutes(provider, { connectClaimSigningKey: process.env.CONNECT_CLAIM_SIGNING_KEY?.trim() || null }) : undefined;
  const server = createHttpServer(config, http, { oauth: provider, recorder, site, manage, publicApi, web });
  server.listen(http.port, http.host, () => {
    const o = http.oauth;
    console.error(
      `paperclip-bridge listening on http://${http.host}:${http.port}` +
        (o ? ` [oauth ${o.mode}${o.mode === "single" ? `, ${o.login} login → ${config.apiUrl}` : ""}, store: ${o.database ? "postgres" : o.dataFile ? "file" : "memory"}, issuer ${o.issuer}]` : ` → ${config.apiUrl}`) +
        (config.readOnly ? " [read-only]" : ""),
    );
  });

  let sweeper: NodeJS.Timeout | undefined;
  // Free tiers: Supabase pauses an idle project and Render spins a quiet service down. A periodic write keeps the database
  // active; the self-ping keeps Render awake while it is up (an external pinger is what wakes it from sleep — docs/LAUNCH.md).
  const beat = async () => {
    try {
      await store.heartbeat();
    } catch (e) {
      console.error("heartbeat failed:", (e as Error).message);
    }
    if (keepalive) {
      try {
        const r = await fetch(`${http.publicUrl}/healthz`, { signal: AbortSignal.timeout(15_000) });
        await r.arrayBuffer();
      } catch {
        /* a failed self-ping is harmless */
      }
    }
  };
  const keepalive = !!http.publicUrl?.startsWith("https:") && !/^(0|false|no|off)$/i.test(process.env.BRIDGE_KEEPALIVE ?? "1");
  const beater = setInterval(() => void beat(), KEEPALIVE_EVERY_MS);
  beater.unref();
  void beat();

  const run = async () => {
    try {
      const n = provider ? await provider.sweep() : 0;
      if (n) console.error(`sweep: revoked ${n} idle grant(s)`);
      const pruned = await store.pruneAudit(Date.now() - http.audit.retentionDays * 86_400_000);
      if (pruned) console.error(`sweep: pruned ${pruned} audit row(s)`);
    } catch (e) {
      console.error("sweep failed:", (e as Error).message);
    }
  };
  sweeper = setInterval(() => void run(), SWEEP_EVERY_MS);
  sweeper.unref();
  void run();

  const shutdown = (sig: string) => {
    console.error(`${sig}: shutting down`);
    if (sweeper) clearInterval(sweeper);
    sampler.stop();
    reporter.stop();
    clearInterval(beater);
    server.close(() => void recorder.stop().finally(() => store.close()).finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 10_000).unref(); // don't hang a deploy on a stuck keep-alive
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

void main();
