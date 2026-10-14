import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { normalizeBridgeUrl } from "./bridge.js";
import { failure } from "./action-error.js";
import { createHandlers } from "./handlers.js";

const plugin = definePlugin({
  async setup(ctx) {
    const h = createHandlers({
      state: ctx.state,
      fetch: (url, init) => ctx.http.fetch(url, init),
      bridgeUrl: async () => (await ctx.config.get()).bridgeUrl,
      listAgents: async (companyId) =>
        (await ctx.agents.list({ companyId, limit: 500 })).map((a) => ({ id: a.id, name: a.name, role: a.role ?? null, title: a.title ?? null, status: String(a.status) })),
    });
    // Failures go back as data (see action-error.ts).
    // Actions, not data handlers: only actions receive the host-verified actor, and everything here is per user.
    for (const key of Object.keys(h) as (keyof typeof h)[]) {
      ctx.actions.register(key, async (params, { actor, companyId }) => {
        try {
          return await h[key](params, { type: actor.type, userId: actor.userId, companyId });
        } catch (e) {
          return failure(e);
        }
      });
    }
  },
  async onValidateConfig(config) {
    try {
      normalizeBridgeUrl((config as { bridgeUrl?: unknown }).bridgeUrl);
      return { ok: true };
    } catch (e) {
      return { ok: false, errors: [(e as Error).message] };
    }
  },
  async onHealth() {
    return { status: "ok" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
