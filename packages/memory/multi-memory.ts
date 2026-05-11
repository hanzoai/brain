/**
 * Multi-memory archive resolution.
 *
 * Fortémi routes per-tenant via `X-Fortemi-Memory: <slug>` headers and
 * per-schema search_path. Hanzo follows the same shape under
 * `X-Hanzo-Memory` (canonical) with `X-Fortemi-Memory` accepted as alias.
 *
 * The resolver doesn't actually open new SQLite files / Postgres schemas
 * here — it returns a normalized identifier the BrainStore implementation
 * uses to pick its data location.
 */

export interface MemoryHandle {
  /** Canonical slug, e.g. "default" or "team-acme". */
  slug: string;
  /** Optional data dir override; if absent, uses `~/.hanzo/brain/<slug>`. */
  dataDir?: string;
  /** Optional Postgres schema name (for Postgres backend). */
  schema?: string;
}

export interface MemoryRouter {
  resolve(headers: Record<string, string | undefined>): MemoryHandle;
  list(): MemoryHandle[];
  register(h: MemoryHandle): void;
}

export function createMemoryRouter(initial: MemoryHandle[] = []): MemoryRouter {
  const m = new Map<string, MemoryHandle>();
  // Always-on default memory.
  if (!initial.some((h) => h.slug === "default")) {
    m.set("default", { slug: "default" });
  }
  for (const h of initial) m.set(h.slug, h);

  return {
    register(h) { m.set(h.slug, h); },
    list() { return Array.from(m.values()); },
    resolve(headers) {
      const want =
        headers["x-hanzo-memory"] ??
        headers["X-Hanzo-Memory"] ??
        headers["x-fortemi-memory"] ??
        headers["X-Fortemi-Memory"] ??
        "default";
      return m.get(want) ?? m.get("default")!;
    },
  };
}
