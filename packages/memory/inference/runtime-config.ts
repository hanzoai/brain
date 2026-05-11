/**
 * Hot-swappable runtime configuration.
 *
 * Precedence: `db_override` → `env` → `default`.
 *
 *   - default: hard-coded fallback
 *   - env:     read from `process.env` (or any caller-supplied env map)
 *   - db_override: in-memory layer set via `set()`, surviving until process
 *                  death OR until the caller persists it to their store
 *
 * Brain doesn't enforce *where* the override is stored; consumers pass an
 * `OverrideSink` if they want to persist.
 */

export interface OverrideSink {
  load(): Record<string, string> | Promise<Record<string, string>>;
  save(key: string, value: string | null): void | Promise<void>;
}

export interface RuntimeConfigOpts {
  defaults?: Record<string, string>;
  env?: Record<string, string | undefined>;
  sink?: OverrideSink;
}

export class RuntimeConfig {
  private defaults: Record<string, string>;
  private env: Record<string, string | undefined>;
  private overrides = new Map<string, string>();
  private sink?: OverrideSink;

  constructor(opts: RuntimeConfigOpts = {}) {
    this.defaults = opts.defaults ?? {};
    this.env = opts.env ?? (typeof process !== "undefined" ? process.env : {});
    this.sink = opts.sink;
  }

  async hydrate(): Promise<void> {
    if (!this.sink) return;
    const persisted = await this.sink.load();
    for (const [k, v] of Object.entries(persisted)) this.overrides.set(k, v);
  }

  get(key: string): string | undefined {
    if (this.overrides.has(key)) return this.overrides.get(key);
    if (this.env[key] !== undefined) return this.env[key];
    return this.defaults[key];
  }

  source(key: string): "db_override" | "env" | "default" | "absent" {
    if (this.overrides.has(key)) return "db_override";
    if (this.env[key] !== undefined) return "env";
    if (this.defaults[key] !== undefined) return "default";
    return "absent";
  }

  async set(key: string, value: string): Promise<void> {
    this.overrides.set(key, value);
    if (this.sink) await this.sink.save(key, value);
  }

  async clear(key: string): Promise<void> {
    this.overrides.delete(key);
    if (this.sink) await this.sink.save(key, null);
  }

  async reset(): Promise<void> {
    for (const k of [...this.overrides.keys()]) await this.clear(k);
  }

  snapshot(): Record<string, { value: string | undefined; source: ReturnType<RuntimeConfig["source"]> }> {
    const out: Record<string, { value: string | undefined; source: ReturnType<RuntimeConfig["source"]> }> = {};
    const keys = new Set<string>([
      ...Object.keys(this.defaults),
      ...Object.keys(this.env),
      ...this.overrides.keys(),
    ]);
    for (const k of keys) out[k] = { value: this.get(k), source: this.source(k) };
    return out;
  }
}
