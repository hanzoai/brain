/**
 * Hanzo Brain — Memory
 *
 * Pluggable memory layer. SQLite by default — single file at
 * `~/.hanzo/brain/brain.db` (shared with hanzo-mcp, hanzo-dev, and any
 * other Hanzo SDK on the same machine), zero infra, ships in the same
 * static binary as the rest of the bot.
 *
 * Canonical scale-out backends (register via @hanzo/bot-memory-* sibling
 * extensions, not in core):
 *   • qdrant       — vector ANN at scale (`~/work/hanzo/vector` fork)
 *   • meilisearch  — fast keyword FTS at scale (`~/work/hanzo/search` fork)
 *   • zapdb        — canonical Hanzo store, ZAP-native, multi-language
 *                    (`zap-proto/db`; in-flight migration from
 *                    `luxfi/zapdb` Go + `~/work/luxcpp/zapdb` C++)
 *   • replicate    — SQLite WAL → S3 backup (`~/work/hanzo/replicate`)
 *   • vfs          — S3-backed streaming block FS (`~/work/hanzo/vfs`)
 *
 * `luxfi/database` is the Lux-flavored extension of zapdb (adds chain
 * heads / archival / validator sets) — NOT a generic brain backend.
 * Brain users pick `zapdb` directly.
 *
 * Third parties can plug in their own backend (Postgres, LanceDB, D1,
 * libSQL, etc.) by calling `registerBackend("name", factory)` from
 * another extension. The default selector picks SQLite unless config
 * explicitly names another backend.
 *
 * Schema (pages, edges, facts, FTS5) is documented in `sqlite.ts`.
 * Anyone implementing `BrainStore` against another store should mirror
 * that shape so recipes and `@hanzo/bot-graph-links` Just Work.
 */

import type { Edge } from "@hanzo/bot-graph-links";

// ── Algorithm modules (fortemi parity, see PARITY.md) ──────────────────
export * from "./fusion.js";
export * from "./rerank.js";
export * from "./dedup.js";
export * from "./script.js";
export * from "./embed.js";
export * from "./temporal.js";
export * from "./captions.js";

// ── Pluggable store contract ────────────────────────────────────────

export interface BrainStore {
  init(): Promise<void>;
  upsertPage(slug: string, content: string, frontmatter?: Record<string, unknown>): Promise<void>;
  getPage(slug: string): Promise<{ slug: string; content: string; updated_at: string } | null>;
  upsertEdges(source: string, edges: Edge[]): Promise<void>;
  edgesFor(slug: string, dir?: "in" | "out" | "both"): Promise<Edge[]>;
  upsertFact(fact: Fact): Promise<void>;
  recall(entity: string, opts?: { limit?: number; since?: string }): Promise<Fact[]>;
  hybridSearch(query: string, topK?: number): Promise<SearchHit[]>;
  close(): Promise<void>;
}

export interface Fact {
  id?: string;
  subject: string; // entity slug (e.g. "people/alice")
  predicate: string; // e.g. "preference", "status", "decision"
  object: string; // value
  source?: string; // page slug or session id
  ts?: string; // ISO; defaults to now
  confidence?: number; // 0..1
}

export interface SearchHit {
  slug: string;
  excerpt: string;
  score: number;
  source: "vector" | "keyword" | "fused";
}

export interface MemoryConfig {
  backend?: string; // registered backend name. default: "sqlite"
  dataDir?: string; // default ~/.hanzo/brain
  dbPath?: string; // explicit file path; overrides dataDir
  embeddingModel?: string;
  embeddingApiKey?: string;
}

export type BackendFactory = (cfg: MemoryConfig) => Promise<BrainStore> | BrainStore;

// ── Backend registry ────────────────────────────────────────────────

const BACKENDS = new Map<string, BackendFactory>();

export function registerBackend(name: string, factory: BackendFactory): void {
  BACKENDS.set(name, factory);
}

export function listBackends(): string[] {
  return Array.from(BACKENDS.keys());
}

// Register the canonical SQLite backend at module load.
registerBackend("sqlite", async (cfg) => {
  const { SqliteStore } = await import("./sqlite.js");
  return new SqliteStore(cfg);
});

// Advertise canonical scale-out backends. Each is shipped as its own
// sibling extension (out-of-tree to keep the bot binary small); calling
// `open({ backend: "<name>" })` without the sibling installed throws a
// helpful install message rather than failing at lookup time. This is
// the "all interfaces supported" contract — listBackends() shows them
// all, you only install what you need.
const ADVERTISED: Record<string, string> = {
  // Native Hanzo stack — ZAP transport + hanzo-consensus + zapdb storage.
  // No libSQL / Turso — we ship our own. Canonical zapdb home is
  // `zap-proto/db` (in-flight migration from luxfi/zapdb + luxcpp/zapdb).
  qdrant: "@hanzo/bot-memory-qdrant", // vector ANN at scale, fork at ~/work/hanzo/vector
  meilisearch: "@hanzo/bot-memory-meilisearch", // keyword FTS at scale, fork at ~/work/hanzo/search
  postgres: "@hanzo/bot-memory-postgres", // multi-tenant team brain w/ pgvector
  lancedb: "@hanzo/bot-memory-lancedb", // already shipped — embedded vector DB
  zapdb: "@hanzo/bot-memory-zapdb", // canonical Hanzo store — zap-proto/db (Go + C++ ports), ZAP-native
  replicate: "@hanzo/bot-memory-replicate", // SQLite WAL → S3 backup, ~/work/hanzo/replicate
  vfs: "@hanzo/bot-memory-vfs", // S3 streaming block FS, ~/work/hanzo/vfs
};

for (const [name, pkg] of Object.entries(ADVERTISED)) {
  if (!BACKENDS.has(name)) {
    registerBackend(name, () => {
      throw new Error(
        `memory: backend "${name}" not installed. Run \`pnpm add ${pkg}\` ` +
          `(or any registerBackend("${name}", factory) caller) to enable.`,
      );
    });
  }
}

// ── Open ────────────────────────────────────────────────────────────

export async function open(cfg: MemoryConfig = {}): Promise<BrainStore> {
  const name = cfg.backend ?? process.env.HANZO_BRAIN_BACKEND ?? "sqlite";
  const factory = BACKENDS.get(name);
  if (!factory) {
    const available = Array.from(BACKENDS.keys()).join(", ");
    throw new Error(
      `memory: unknown backend "${name}". Registered backends: ${available}. ` +
        `Call registerBackend("${name}", factory) from your extension to plug one in.`,
    );
  }
  const store = await factory(cfg);
  await store.init();
  return store;
}

// ── OpenClaw plugin contract ────────────────────────────────────────

export interface MemoryApi {
  store: BrainStore;
  registerBackend: typeof registerBackend;
  listBackends: typeof listBackends;
}

export default async function register(api: any, cfg: MemoryConfig = {}): Promise<MemoryApi> {
  const store = await open(cfg);

  // Wire bot lifecycle hooks. Each is a soft contract — if the bot core
  // doesn't expose the hook, this plugin is inert for that surface.
  if (typeof api?.memory?.registerBackend === "function") {
    api.memory.registerBackend("hanzo-brain", store);
  }
  if (typeof api?.memory?.onUpsertEdges === "function") {
    api.memory.onUpsertEdges((src: string, edges: Edge[]) => store.upsertEdges(src, edges));
  }
  if (typeof api?.tools?.register === "function") {
    api.tools.register({
      name: "brain.recall",
      description: "Recall facts about an entity from the Hanzo Brain.",
      input: { entity: "string", limit: "number?" },
      handler: ({ entity, limit }: { entity: string; limit?: number }) =>
        store.recall(entity, { limit }),
    });
    api.tools.register({
      name: "brain.search",
      description: "Hybrid search across all brain pages.",
      input: { query: "string", topK: "number?" },
      handler: ({ query, topK }: { query: string; topK?: number }) =>
        store.hybridSearch(query, topK),
    });
  }

  return { store, registerBackend, listBackends };
}
