import type { BrokerConfig, Profile } from "./config.js";
import type { ClusterResource, ProxmoxClient } from "../proxmox/client.js";

/**
 * The broker's whole authority. It holds the Proxmox token and does exactly four things: report host status, create a
 * lease (one unprivileged container from an allowlisted profile), read a lease, and destroy a lease. It only touches
 * guests that are inside its vmid range, in its pool, and carry its tag, so it cannot reach anything else on the host
 * even if Paperclip asks it to. Every call is written to the audit log.
 */

export class BrokerError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
  }
}

export interface Lease {
  id: string;
  vmid: number;
  status: string;
  hostname: string;
  ip: string | null;
  profile: string | null;
  expiresAt: string | null;
  runId: string | null;
}

export interface CreateLeaseRequest {
  profile: string;
  sshPublicKey?: string;
  runId?: string;
  requestedExpiresAt?: string;
}

export type AuditWriter = (entry: Record<string, unknown>) => void;

export interface BrokerDeps {
  config: BrokerConfig;
  pve: Pick<ProxmoxClient, "version" | "nodeStatus" | "clusterResources" | "checkVmidFree" | "createLxc" | "cloneLxc" | "setLxcConfig" | "lxcConfig" | "lxcInterfaces" | "startLxc" | "stopLxc" | "destroyLxc" | "waitTask">;
  audit: AuditWriter;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  ipTimeoutMs?: number;
}

const SSH_KEY = /^(ssh-ed25519|ecdsa-sha2-nistp(256|384|521)|ssh-rsa) [A-Za-z0-9+/]+={0,3}( [ -~]{0,200})?$/;
const RUN_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

export function isValidSshPublicKey(key: string): boolean {
  return SSH_KEY.test(key.trim()) && !key.trim().includes("\n");
}

const splitTags = (tags: unknown) => (typeof tags === "string" ? tags.split(/[;, ]+/).filter(Boolean) : []);

/** The broker's marker in a guest's description. It survives broker restarts, so expiry is enforced after a crash. */
export function encodeMarker(m: { profile: string; expiresAt: string; runId?: string }): string {
  return `localhost-lease profile=${m.profile} expires=${m.expiresAt}${m.runId ? ` run=${m.runId}` : ""}`;
}

export function decodeMarker(description: unknown): { profile: string | null; expiresAt: string | null; runId: string | null } {
  const text = typeof description === "string" ? decodeURIComponent(description) : "";
  const line = text.split("\n").find((l) => l.startsWith("localhost-lease ")) ?? "";
  const get = (k: string) => line.match(new RegExp(`(?:^| )${k}=(\\S+)`))?.[1] ?? null;
  return { profile: get("profile"), expiresAt: get("expires"), runId: get("run") };
}

export class Broker {
  private readonly c: BrokerConfig;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly d: BrokerDeps) {
    this.c = d.config;
    this.now = d.now ?? Date.now;
    this.sleep = d.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** Allocation is serialized so two leases never race for the same vmid or the last slot. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private inRange(vmid: number) {
    return vmid >= this.c.vmidRange[0] && vmid <= this.c.vmidRange[1];
  }

  /** Ours = in range, in our pool, tagged, and a container. Anything else is invisible to every operation. */
  private isOurs(r: ClusterResource): r is ClusterResource & { vmid: number } {
    return r.type === "lxc" && typeof r.vmid === "number" && this.inRange(r.vmid) && r.pool === this.c.pool && splitTags(r.tags).includes(this.c.tag) && (r.node === undefined || r.node === this.c.proxmox.node);
  }

  private async ours(): Promise<(ClusterResource & { vmid: number })[]> {
    return (await this.d.pve.clusterResources()).filter((r) => this.isOurs(r));
  }

  private log(action: string, fields: Record<string, unknown>) {
    this.d.audit({ ts: new Date(this.now()).toISOString(), action, ...fields });
  }

  async hostStatus() {
    const [version, node, leases] = await Promise.all([this.d.pve.version(), this.d.pve.nodeStatus(this.c.proxmox.node), this.ours()]);
    return {
      proxmox: version.version,
      node: this.c.proxmox.node,
      cpu: { usage: node.cpu, cpus: node.cpuinfo?.cpus ?? null },
      memory: { totalBytes: node.memory.total, usedBytes: node.memory.used },
      leases: { active: leases.length, max: this.c.limits.maxLeases },
      profiles: Object.keys(this.c.profiles),
      limits: { maxTtlMinutes: this.c.limits.maxTtlMinutes, defaultTtlMinutes: this.c.limits.defaultTtlMinutes },
    };
  }

  private parseId(id: string): number {
    const vmid = Number(id);
    if (!/^\d+$/.test(id) || !this.inRange(vmid)) throw new BrokerError("Unknown lease", 404, "lease_not_found");
    return vmid;
  }

  private async ipOf(vmid: number): Promise<string | null> {
    const ifaces = await this.d.pve.lxcInterfaces(this.c.proxmox.node, vmid).catch(() => []);
    const eth = ifaces.find((i) => i.name === "eth0") ?? ifaces.find((i) => i.name !== "lo" && i.inet);
    return eth?.inet ? eth.inet.split("/")[0] : null;
  }

  private async describe(r: ClusterResource & { vmid: number }): Promise<Lease> {
    const cfg = await this.d.pve.lxcConfig(this.c.proxmox.node, r.vmid);
    const m = decodeMarker(cfg.description);
    return {
      id: String(r.vmid),
      vmid: r.vmid,
      status: r.status ?? "unknown",
      hostname: typeof cfg.hostname === "string" ? cfg.hostname : r.name ?? "",
      ip: r.status === "running" ? await this.ipOf(r.vmid) : null,
      profile: m.profile,
      expiresAt: m.expiresAt,
      runId: m.runId,
    };
  }

  async listLeases(): Promise<Lease[]> {
    return Promise.all((await this.ours()).map((r) => this.describe(r)));
  }

  async getLease(id: string): Promise<Lease> {
    const vmid = this.parseId(id);
    const r = (await this.ours()).find((x) => x.vmid === vmid);
    if (!r) throw new BrokerError("Unknown lease", 404, "lease_not_found");
    return this.describe(r);
  }

  private expiry(requested?: string): string {
    const now = this.now();
    const max = now + this.c.limits.maxTtlMinutes * 60_000;
    let at = now + this.c.limits.defaultTtlMinutes * 60_000;
    if (requested !== undefined) {
      const t = Date.parse(requested);
      if (!Number.isFinite(t) || t <= now) throw new BrokerError("requestedExpiresAt must be a future ISO 8601 time", 400, "bad_expiry");
      at = t;
    }
    return new Date(Math.min(at, max)).toISOString();
  }

  private async freeVmid(): Promise<number> {
    const used = new Set((await this.d.pve.clusterResources()).map((r) => r.vmid).filter((v): v is number => typeof v === "number"));
    for (let v = this.c.vmidRange[0]; v <= this.c.vmidRange[1]; v++) {
      if (used.has(v)) continue;
      try {
        await this.d.pve.checkVmidFree(v); // also catches guests this token cannot see
        return v;
      } catch {
        continue;
      }
    }
    throw new BrokerError("No free vmid left in the broker's range", 503, "no_vmid");
  }

  async createLease(req: CreateLeaseRequest): Promise<Lease> {
    const profile: Profile | undefined = Object.hasOwn(this.c.profiles, req.profile) ? this.c.profiles[req.profile] : undefined;
    if (!profile) throw new BrokerError(`Unknown profile "${req.profile}"`, 400, "unknown_profile");
    if (req.runId !== undefined && !RUN_ID.test(req.runId)) throw new BrokerError("runId is invalid", 400, "bad_run_id");
    if (profile.kind === "ostemplate" && (!req.sshPublicKey || !isValidSshPublicKey(req.sshPublicKey))) {
      throw new BrokerError("This profile needs a single OpenSSH public key in sshPublicKey", 400, "bad_ssh_key");
    }
    const expiresAt = this.expiry(req.requestedExpiresAt);

    return this.serial(async () => {
      if ((await this.ours()).length >= this.c.limits.maxLeases) {
        this.log("lease.create", { ok: false, profile: req.profile, error: "limit" });
        throw new BrokerError(`Lease limit reached (${this.c.limits.maxLeases})`, 429, "lease_limit");
      }
      const vmid = await this.freeVmid();
      const node = this.c.proxmox.node;
      const hostname = `lh-${vmid}`;
      const description = encodeMarker({ profile: req.profile, expiresAt, runId: req.runId });
      let created = false;
      try {
        if (profile.kind === "ostemplate") {
          const upid = await this.d.pve.createLxc(node, {
            vmid,
            ostemplate: profile.ostemplate,
            hostname,
            pool: this.c.pool,
            tags: this.c.tag,
            description,
            storage: profile.storage,
            rootfs: `${profile.storage}:${profile.diskGb}`,
            cores: profile.cores,
            memory: profile.memoryMb,
            swap: 0,
            net0: `name=eth0,bridge=${profile.bridge},ip=dhcp,firewall=1`,
            unprivileged: true,
            features: "nesting=1",
            onboot: false,
            start: false,
            "ssh-public-keys": req.sshPublicKey!.trim(),
          });
          created = true;
          await this.d.pve.waitTask(node, upid);
        } else {
          const upid = await this.d.pve.cloneLxc(node, profile.template, {
            newid: vmid,
            hostname,
            pool: this.c.pool,
            description,
            full: profile.fullClone,
            storage: profile.fullClone ? profile.storage : undefined,
          });
          created = true;
          await this.d.pve.waitTask(node, upid);
          await this.d.pve.setLxcConfig(node, vmid, { tags: this.c.tag, cores: profile.cores, memory: profile.memoryMb, onboot: false });
        }
        await this.d.pve.waitTask(node, await this.d.pve.startLxc(node, vmid));
        const ip = await this.waitForIp(vmid);
        this.log("lease.create", { ok: true, vmid, profile: req.profile, runId: req.runId ?? null, expiresAt });
        return { id: String(vmid), vmid, status: "running", hostname, ip, profile: req.profile, expiresAt, runId: req.runId ?? null };
      } catch (error) {
        this.log("lease.create", { ok: false, vmid, profile: req.profile, error: error instanceof Error ? error.message : String(error) });
        if (created) await this.destroyVmid(vmid).catch(() => undefined);
        throw error instanceof BrokerError ? error : new BrokerError(error instanceof Error ? error.message : String(error), 502, "proxmox_error");
      }
    });
  }

  private async waitForIp(vmid: number): Promise<string> {
    const deadline = this.now() + (this.d.ipTimeoutMs ?? 90_000);
    for (;;) {
      const ip = await this.ipOf(vmid);
      if (ip) return ip;
      if (this.now() > deadline) throw new BrokerError("Container started but got no IP address (is DHCP available on the bridge?)", 504, "no_ip");
      await this.sleep(1_000);
    }
  }

  private async destroyVmid(vmid: number) {
    const node = this.c.proxmox.node;
    // force=1 lets Proxmox stop a running container as part of the destroy task.
    await this.d.pve.waitTask(node, await this.d.pve.destroyLxc(node, vmid));
  }

  /** Destroys a lease. A lease that is already gone counts as destroyed, so release is idempotent. */
  async destroyLease(id: string, reason = "release"): Promise<{ id: string; state: "destroyed"; alreadyGone: boolean }> {
    const vmid = this.parseId(id);
    return this.serial(async () => {
      const all = await this.d.pve.clusterResources();
      const r = all.find((x) => x.vmid === vmid);
      if (!r) {
        this.log("lease.destroy", { ok: true, vmid, reason, alreadyGone: true });
        return { id, state: "destroyed" as const, alreadyGone: true };
      }
      if (!this.isOurs(r)) {
        this.log("lease.destroy", { ok: false, vmid, reason, error: "not_ours" });
        throw new BrokerError("That guest is not a lease this broker owns", 403, "not_ours");
      }
      try {
        await this.destroyVmid(vmid);
      } catch (error) {
        this.log("lease.destroy", { ok: false, vmid, reason, error: error instanceof Error ? error.message : String(error) });
        throw new BrokerError(error instanceof Error ? error.message : String(error), 502, "proxmox_error");
      }
      this.log("lease.destroy", { ok: true, vmid, reason, alreadyGone: false });
      return { id, state: "destroyed" as const, alreadyGone: false };
    });
  }

  /** Destroys leases past their expiry. Leases with no readable expiry are treated as expired: fail closed. */
  async reapExpired(): Promise<string[]> {
    const reaped: string[] = [];
    for (const lease of await this.listLeases()) {
      const t = lease.expiresAt ? Date.parse(lease.expiresAt) : NaN;
      if (Number.isFinite(t) && t > this.now()) continue;
      try {
        await this.destroyLease(lease.id, "expired");
        reaped.push(lease.id);
      } catch {
        // logged by destroyLease; try again on the next sweep
      }
    }
    return reaped;
  }
}
