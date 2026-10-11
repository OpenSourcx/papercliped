import { readFileSync } from "node:fs";

/**
 * Broker configuration. The file holds no secrets: the Proxmox token secret comes from PROXMOX_TOKEN_SECRET and the
 * token Paperclip uses to call the broker from LOCALHOST_BROKER_TOKEN. Everything an agent could want to vary
 * (storage, bridge, template, size) is fixed here per profile, so a request can only pick a profile by name.
 */

export interface OstemplateProfile {
  kind: "ostemplate";
  ostemplate: string; // e.g. local:vztmpl/debian-13-standard_13.1-1_amd64.tar.zst
  storage: string;
  bridge: string;
  cores: number;
  memoryMb: number;
  diskGb: number;
}

export interface TemplateProfile {
  kind: "template";
  template: number; // vmid of an LXC template whose root authorized_keys already holds the plugin's public key
  fullClone: boolean; // directory storage cannot make linked clones; ZFS and LVM-thin can
  storage?: string; // target storage for a full clone
  cores: number;
  memoryMb: number;
}

export type Profile = OstemplateProfile | TemplateProfile;

export interface BrokerConfig {
  listen: { host: string; port: number };
  proxmox: { url: string; node: string; tokenId: string; tokenSecret: string; caPem?: string };
  brokerToken: string;
  pool: string;
  tag: string;
  vmidRange: [number, number];
  limits: { maxLeases: number; maxTtlMinutes: number; defaultTtlMinutes: number; maxCores: number; maxMemoryMb: number; maxDiskGb: number };
  profiles: Record<string, Profile>;
  auditLog: string;
}

const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/;

function int(v: unknown, what: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) throw new Error(`${what} must be an integer between ${min} and ${max}`);
  return v;
}

function str(v: unknown, what: string, re: RegExp = /^\S.{0,254}$/): string {
  if (typeof v !== "string" || !re.test(v)) throw new Error(`${what} is missing or invalid`);
  return v;
}

export function parseBrokerConfig(raw: unknown, env: Record<string, string | undefined>, readFile: (p: string) => string = (p) => readFileSync(p, "utf8")): BrokerConfig {
  if (!raw || typeof raw !== "object") throw new Error("config must be a JSON object");
  const c = raw as Record<string, any>;

  const tokenSecret = env.PROXMOX_TOKEN_SECRET?.trim();
  if (!tokenSecret) throw new Error("PROXMOX_TOKEN_SECRET is not set");
  const brokerToken = env.LOCALHOST_BROKER_TOKEN?.trim();
  if (!brokerToken || brokerToken.length < 32) throw new Error("LOCALHOST_BROKER_TOKEN must be set and at least 32 characters");

  const pm = c.proxmox ?? {};
  const url = str(pm.url, "proxmox.url");
  if (new URL(url).protocol !== "https:") throw new Error("proxmox.url must use https");

  const [lo, hi] = Array.isArray(c.vmidRange) ? c.vmidRange : [];
  int(lo, "vmidRange[0]", 100, 999_999_999);
  int(hi, "vmidRange[1]", lo, 999_999_999);
  if (hi - lo > 10_000) throw new Error("vmidRange is wider than 10000 IDs; keep the broker's reach small");

  const l = c.limits ?? {};
  const limits = {
    maxLeases: int(l.maxLeases ?? 10, "limits.maxLeases", 1, 500),
    maxTtlMinutes: int(l.maxTtlMinutes ?? 240, "limits.maxTtlMinutes", 5, 7 * 24 * 60),
    defaultTtlMinutes: int(l.defaultTtlMinutes ?? 120, "limits.defaultTtlMinutes", 5, 7 * 24 * 60),
    maxCores: int(l.maxCores ?? 4, "limits.maxCores", 1, 256),
    maxMemoryMb: int(l.maxMemoryMb ?? 4096, "limits.maxMemoryMb", 128, 1_048_576),
    maxDiskGb: int(l.maxDiskGb ?? 32, "limits.maxDiskGb", 1, 65_536),
  };
  if (limits.defaultTtlMinutes > limits.maxTtlMinutes) throw new Error("limits.defaultTtlMinutes cannot exceed limits.maxTtlMinutes");

  const profiles: Record<string, Profile> = {};
  for (const [name, p] of Object.entries((c.profiles ?? {}) as Record<string, any>)) {
    if (!NAME.test(name)) throw new Error(`profile name "${name}" is invalid`);
    const cores = int(p.cores, `profiles.${name}.cores`, 1, limits.maxCores);
    const memoryMb = int(p.memoryMb, `profiles.${name}.memoryMb`, 128, limits.maxMemoryMb);
    if (typeof p.ostemplate === "string") {
      profiles[name] = {
        kind: "ostemplate",
        ostemplate: str(p.ostemplate, `profiles.${name}.ostemplate`, /^[A-Za-z0-9_.-]+:vztmpl\/[A-Za-z0-9_.+-]+$/),
        storage: str(p.storage, `profiles.${name}.storage`, NAME),
        bridge: str(p.bridge, `profiles.${name}.bridge`, /^[A-Za-z0-9_.-]{1,15}$/),
        cores,
        memoryMb,
        diskGb: int(p.diskGb, `profiles.${name}.diskGb`, 1, limits.maxDiskGb),
      };
    } else if (p.template !== undefined) {
      const template = int(p.template, `profiles.${name}.template`, 100, 999_999_999);
      if (template >= lo && template <= hi) throw new Error(`profiles.${name}.template must be outside vmidRange, or the broker could destroy it`);
      profiles[name] = {
        kind: "template",
        template,
        fullClone: p.fullClone !== false,
        storage: p.storage === undefined ? undefined : str(p.storage, `profiles.${name}.storage`, NAME),
        cores,
        memoryMb,
      };
    } else {
      throw new Error(`profiles.${name} needs either "ostemplate" or "template"`);
    }
  }
  if (Object.keys(profiles).length === 0) throw new Error("define at least one profile");

  return {
    listen: { host: typeof c.listen?.host === "string" ? c.listen.host : "127.0.0.1", port: int(c.listen?.port ?? 8787, "listen.port", 1, 65_535) },
    proxmox: {
      url,
      node: str(pm.node, "proxmox.node", NAME),
      tokenId: str(pm.tokenId, "proxmox.tokenId", /^[^@\s]+@[^!\s]+![A-Za-z0-9_.-]+$/),
      tokenSecret,
      caPem: typeof pm.caFile === "string" ? readFile(pm.caFile) : undefined,
    },
    brokerToken,
    pool: str(c.pool, "pool", NAME),
    tag: str(c.tag ?? "localhost-lease", "tag", /^[a-z0-9][a-z0-9_+.-]{0,62}$/),
    vmidRange: [lo, hi],
    limits,
    profiles,
    auditLog: typeof c.auditLog === "string" ? c.auditLog : "audit.jsonl",
  };
}
