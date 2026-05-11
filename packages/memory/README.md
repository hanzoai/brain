# @hanzo/bot-memory

> The Hanzo Brain memory layer. Pluggable BrainStore contract. SQLite default — single file, zero infra. **Path shared across every Hanzo SDK** at `~/.hanzo/brain/brain.db`.

## Canonical artifact locations

Every Hanzo SDK on a machine reads/writes the same paths so brains
compose across the bot, hanzo-mcp, hanzo-dev, and the Python SDK:

| Path                      | What                                     |
| ------------------------- | ---------------------------------------- |
| `~/.hanzo/brain/brain.db` | The brain — pages / edges / facts / FTS5 |
| `~/.hanzo/workspace/`     | Markdown source — auto-ingested          |
| `~/.hanzo/config.toml`    | Per-machine bot/mcp config               |
| `~/.hanzo/cache/`         | Embedding cache, tool-output cache       |
| `~/.hanzo/logs/`          | Structured logs                          |

## What ships in core

- **SQLite backend** (canonical default) — `~/.hanzo/brain/brain.db`. FTS5 keyword. Optional sqlite-vec for ANN.
- **Pluggable interface** — `registerBackend("name", factory)`. Anyone can ship Qdrant / Meilisearch / Postgres / LanceDB / D1 / libSQL as a sibling extension.

## Scale-out backends (sibling extensions, not in core)

Hanzo ships the heavy machinery, all open source — register them by name.
Native stack uses **ZAP** (zero-copy transport) + **hanzo-consensus** (metastable
agent agreement) + **zapdb** (storage primitives) end-to-end. No libSQL,
no Turso — we ship our own.

| Backend       | Repo                                                                          | License  | Use                                                                                                                                                                                                  |
| ------------- | ----------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `qdrant`      | [`hanzoai/vector`](https://github.com/hanzoai/vector)                         | Apache 2 | Vector ANN at scale (millions of embeddings, multi-replica)                                                                                                                                          |
| `meilisearch` | [`hanzoai/search`](https://github.com/hanzoai/search)                         | MIT      | Fast keyword FTS when SQLite FTS5 stops being enough                                                                                                                                                 |
| `replicate`   | [`hanzoai/replicate`](https://github.com/hanzoai/replicate)                   | Apache 2 | Background SQLite WAL → S3 backup, point-in-time restore                                                                                                                                             |
| `vfs`         | [`hanzoai/vfs`](https://github.com/hanzoai/vfs)                               | Apache 2 | S3-backed virtual block FS with PQ encryption — unlimited write storage                                                                                                                              |
| `zapdb`       | **[`zap-proto/db`](https://github.com/zap-proto/db)** (canonical)             | Apache 2 | The canonical Hanzo storage layer. ZAP-native primitives, multi-language. In-flight migration from `luxfi/zapdb` (Go, badger-derived) and `luxcpp/zapdb` (C++) into `zap-proto/db`.                  |
| `luxdb`       | [`luxfi/database`](https://github.com/luxfi/database)                         | BSD-3    | **Lux-flavored extension** of zapdb. Adds blockchain-specific concerns (chain heads, archival, validator sets) on top of the base zapdb. Don't use for generic brain stores — pick `zapdb` directly. |
| `postgres`    | (sibling pkg)                                                                 |          | Multi-tenant team brain with pgvector                                                                                                                                                                |

### The native distributed-SQL story (we ship our own — not libSQL/Turso)

For multi-machine SQLite-shaped semantics with native replication, the
canonical Hanzo stack is **ZAP + hanzo-consensus + zapdb**, not libSQL/Turso:

- **Wire**: ZAP (zero-copy transport) — same protocol the rest of Hanzo speaks. Carries MCP, A2A, and ACP natively too. Repos live under [`zap-proto`](https://github.com/zap-proto) (one per language: `zap-proto/c`, `zap-proto/cpp`, `zap-proto/go`, `zap-proto/py`, `zap-proto/rust`, …).
- **Consensus**: `hanzo-consensus` for metastable agent agreement. For storage-level write ordering we run the same metastable primitive on a node quorum (one quorum per brain shard).
- **Storage** — `zap-proto/db` is the canonical home for **zapdb**. It's the base store, multi-language, ZAP-native. Currently mirrored at `luxfi/zapdb` (Go) and `~/work/luxcpp/zapdb` (C++) pending the migration to `zap-proto/db`. `luxfi/database` is a separate Lux-flavored extension of zapdb that adds blockchain concerns (chain heads, archival, validator sets) — generic brain users want `zapdb` directly, not `luxfi/database`.
- **Backup**: `replicate` ships SQLite WAL → S3 for the solo + small-team cases.
- **Streaming**: `vfs` for unlimited-size brains backed by S3 blocks with PQ encryption.

We deliberately don't pull in libSQL or Turso; they'd force us off our own ZAP+consensus path. The multi-replica zapdb primitive is in-flight at `luxfi/zapdb` (Go) and `~/work/luxcpp/zapdb` (C++), both migrating to `zap-proto/db`.

Default routing:

- **Solo dev, < 100K pages** → SQLite + FTS5 (zero infra)
- **Solo dev, > 10K pages with vector** → SQLite + `sqlite-vec` (requires better-sqlite3 driver — bun:sqlite has no extension loading)
- **Durable solo (offsite backup)** → SQLite + `replicate` to S3
- **Multi-machine personal** → `zapdb` over ZAP + hanzo-consensus (our native distributed-SQL story; canonical home is `zap-proto/db`, in-flight migration from `luxfi/zapdb`)
- **Team / Hanzo Node** → Qdrant for vectors + Meilisearch for FTS + `zapdb` for facts/edges (or Postgres if multi-tenant + external)
- **Org-scale streaming** → VFS-backed brain.db, lazy block-level fetch from S3, unlimited size

## Schema

```sql
CREATE TABLE pages (
  slug         TEXT PRIMARY KEY,
  content      TEXT NOT NULL,
  frontmatter  TEXT,                   -- JSON
  updated_at   TEXT NOT NULL           -- ISO 8601
);

-- FTS5 virtual table over pages.content
CREATE VIRTUAL TABLE pages_fts USING fts5(content, content='pages', content_rowid='rowid');

CREATE TABLE edges (
  source    TEXT NOT NULL,             -- page slug
  target    TEXT NOT NULL,             -- entity slug
  type      TEXT NOT NULL,             -- mentions/attended/works_at/invested_in/founded/advises
  evidence  TEXT,                      -- verbatim phrase that triggered inference
  PRIMARY KEY (source, target, type)
);

CREATE TABLE facts (
  id          TEXT PRIMARY KEY,        -- subject::predicate::ts
  subject     TEXT NOT NULL,           -- entity slug
  predicate   TEXT NOT NULL,           -- preference/status/decision/replied/…
  object      TEXT NOT NULL,
  source      TEXT,                    -- originating page slug or session id
  ts          TEXT NOT NULL,           -- ISO 8601
  confidence  REAL DEFAULT 1.0
);
```

Anyone implementing `BrainStore` for another backend should mirror this shape — `@hanzo/bot-graph-links` and `@hanzo/bot-recipes-brain` Just Work against any conforming store.

## Pluggability

```ts
import { registerBackend, open } from "@hanzo/bot-memory";

registerBackend("my-store", async (cfg) => {
  const store: BrainStore = makeMyStore(cfg);
  return store;
});

const store = await open({ backend: "my-store" });
```

Environment override: `HANZO_BRAIN_BACKEND=my-store`.

## API surface

```ts
const store = await open(); // SQLite, ~/.hanzo/brain/brain.db

await store.upsertPage("people/alice", markdown, { type: "person" });
await store.upsertEdges("people/alice", edges);
await store.upsertFact({
  subject: "people/alice",
  predicate: "preference",
  object: "replies in under 2 hours",
});

const facts = await store.recall("people/alice", { limit: 50 });
const hits = await store.hybridSearch("Acme", 5);
const out = await store.edgesFor("people/alice", "out");
```

## Config

```ts
interface MemoryConfig {
  backend?: string; // default "sqlite"
  dataDir?: string; // default ~/.hanzo/brain
  dbPath?: string; // explicit file; overrides dataDir
  embeddingModel?: string; // for the optional vector ANN path
  embeddingApiKey?: string;
}
```

## Driver

- **bun:sqlite** (canonical — already built into Bun, no install needed)
- **better-sqlite3** (fallback for Node-only deployments)

Either works. The init step tries bun:sqlite first.

## Tests

```bash
cd ~/work/hanzo/brain/packages/memory && bun test
```

109 tests across 3 files cover: SQLite store (upsert + read pages, upsert + read edges, upsert + recall facts, FTS hybrid search, pluggability via `registerBackend`, unknown-backend error), the full algorithm surface (`fusion`, `rerank`, `dedup`, `script`, `fts`, `embed`, `temporal`, `two-stage`, `federated`, `filters`, `multi-memory`, `graph`, `skos`, `fair`, `doc-types`, `code-ast`, `email`, `exif`, `captions`, `sprite`, `events`, `tokenizer`, `eval`, `hardware`, `circuit-breaker`, `retry`, `range`, `tus`, `spatial`, `address`, `mmpke01`), and the `Inference` / `Extract` sub-registries.
