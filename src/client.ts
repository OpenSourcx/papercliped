import type { BridgeConfig } from "./config.js";
import { ToolInputError } from "./errors.js";
import { trackUpstream } from "./telemetry/timing.js";

export class PaperclipApiError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly path: string,
    readonly body: unknown,
  ) {
    const detail =
      body && typeof body === "object" && "error" in body && typeof (body as any).error === "string"
        ? `: ${(body as any).error}`
        : "";
    super(`${method} ${path} failed with ${status}${detail}`);
    this.name = "PaperclipApiError";
  }
}

export type Query = Record<string, string | number | boolean | undefined | null>;

export class PaperclipClient {
  constructor(
    readonly config: BridgeConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  resolveCompanyId(explicit?: string | null): string {
    const id = explicit?.trim() || this.config.companyId;
    if (!id) {
      throw new ToolInputError(
        "companyId is required: pass it, or set PAPERCLIP_COMPANY_ID (use paperclip_list_companies to find one)",
      );
    }
    return id;
  }

  async request<T = unknown>(
    method: string,
    path: string,
    opts: { query?: Query; body?: unknown } = {},
  ): Promise<T> {
    if (!path.startsWith("/")) throw new ToolInputError(`API path must start with "/": ${path}`);
    if (path.includes("..")) throw new ToolInputError("API path must not contain '..'");
    if (/%2e|%2f|%5c|%00/i.test(path)) throw new ToolInputError("API path must not contain encoded dots, slashes or backslashes");
    if (/[?#\\\x00-\x1f\x7f]/.test(path)) throw new ToolInputError("API path must not contain ?, #, backslashes or control characters (use `query` for parameters)");
    const base = new URL(this.config.apiUrl);
    const url = new URL(`${this.config.apiUrl}${path}`);
    const root = base.pathname.replace(/\/+$/, "");
    if (url.origin !== base.origin || (url.pathname !== root && !url.pathname.startsWith(`${root}/`))) {
      throw new ToolInputError("API path must stay under the Paperclip API");
    }
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.config.apiKey) headers.Authorization = `Bearer ${this.config.apiKey}`;
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";

    let res: Response;
    let text: string;
    try {
      // Time headers AND body transfer as "upstream": that is the wait the caller experiences.
      ({ res, text } = await trackUpstream(async () => {
        const r = await this.fetchImpl(url, {
          method,
          headers,
          body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
          signal: AbortSignal.timeout(this.config.timeoutMs),
        });
        return { res: r, text: await r.text() };
      }));
    } catch (err) {
      const why = err instanceof Error ? (err.cause as Error | undefined)?.message ?? err.message : String(err);
      throw new Error(`Cannot reach Paperclip at ${this.config.apiUrl} (${why}). Check PAPERCLIP_API_URL and that the server is running.`);
    }
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (!res.ok) throw new PaperclipApiError(res.status, method, path, parsed);
    return parsed as T;
  }

  get = <T = unknown>(path: string, query?: Query) => this.request<T>("GET", path, { query });
  post = <T = unknown>(path: string, body?: unknown) => this.request<T>("POST", path, { body: body ?? {} });
  patch = <T = unknown>(path: string, body: unknown) => this.request<T>("PATCH", path, { body });
}
