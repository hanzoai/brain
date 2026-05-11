# brain

> The Hanzo Brain. Single binary brain that compounds knowledge across every channel, every agent, every runtime.

Drop markdown into `~/.hanzo/workspace/`. Edges auto-extract (zero LLM). Facts queryable via MCP. One SQLite file at `~/.hanzo/brain/brain.db`. Same file readable by every Hanzo runtime — TS, Python, Rust, Go.

```
                       ┌──────────────────────────┐
                       │   ~/.hanzo/brain/        │
                       │   • brain.db (SQLite)    │
                       │   • workspace/ (md)      │
                       │   • recipes/ (yaml)      │
                       │   • cache/  • logs/      │
                       └─────────────┬────────────┘
                                     │
            ┌──────────────┬─────────┴────────┬──────────────┐
            ▼              ▼                  ▼              ▼
       hanzoai/bot   hanzoai/python-sdk   hanzoai/mcp    hanzoai/bot-go
       (TS — runtime  (Python — hanzo-    (Rust —        (Go — single
        canonical;     memory pkg ports    rust/src/      static binary,
        OpenClaw fork) graph_links +       brain crate)   pure-Go SQLite)
                       recipes)
```

## Why a brain

Your AI agent is smart but forgetful. **brain** gives it a brain.

- **Hybrid search** — FTS5 + vector + RRF fusion. Mostly returns what keyword alone can't.
- **Self-wiring graph** — every page write extracts typed edges (`attended / works_at / invested_in / founded / advises`) via regex + role inference. Zero LLM calls.
- **Facts table** — `subject / predicate / object / ts / confidence`. Queryable in real time across sessions.
- **Recipes** — daily-life automations as YAML. Email → classify → draft → swipe-to-reply. Add your own.
- **Pluggable storage** — SQLite default. Register Qdrant / Meilisearch / zapdb / postgres / replicate / vfs as needed. Same `BrainStore` contract everywhere.

## Install (TS canonical, ships with the bot)

```bash
# Pulls @hanzo/bot which ships the brain meta-pack
npm install -g @hanzo/bot
hanzo-bot serve
```

Enable in `hanzo.toml`:

```toml
[plugins.brain]
enabled = true

[plugins.brain.memory]
# Optional. Defaults below.
# backend = "sqlite"
# dbPath  = "~/.hanzo/brain/brain.db"
```

## Install (Go — single static binary)

```bash
go install github.com/hanzoai/bot-go/cmd/hanzo-bot@latest

hanzo-bot brain init                       # opens ~/.hanzo/brain/brain.db
hanzo-bot brain ingest <file.md>           # ingest + auto-extract typed edges
hanzo-bot brain recall <slug>              # facts for an entity
hanzo-bot brain search <query>             # hybrid FTS search
hanzo-bot recipes list                     # installed recipes
```

## Install (Python)

```bash
pip install hanzo-memory
```

```python
from hanzo_memory.graph_links import extract_edges
from hanzo_memory.recipes import list_recipes, load_recipe

edges = extract_edges(
    slug="people/alice",
    content="Alice founded Acme. She invested in Foobar.",
)
# [Edge(target='companies/acme', type='founded', …),
#  Edge(target='companies/foobar', type='invested_in', …)]
```

## Install (Rust — embedded in hanzo-mcp)

```rust
use hanzo_mcp::brain::{extract_edges, slugify};

let edges = extract_edges("people/alice", "Alice is the CEO of Acme.", Some("person"));
```

## Runtimes — feature parity matrix

| Feature | TS | Python | Rust | Go |
|---|---|---|---|---|
| BrainStore interface | ✓ | ✓ | ✓ | ✓ |
| SQLite backend (default) | ✓ | ✓ | ✓ | ✓ |
| FTS5 hybrid search | ✓ | ✓ | trait | ✓ |
| Graph-links extractor | ✓ | ✓ | ✓ | ✓ |
| Recipe loader | ✓ | ✓ | ✓ | ✓ |
| MCP `brain.recall` + `brain.search` tools | ✓ | ✓ | planned | planned |
| Pluggable backends (`registerBackend`) | ✓ | ✓ | ✓ | ✓ |
| Channel adapters | ✓ (30+) | — | — | — |
| Voice (Twilio + Realtime) | ✓ | — | — | — |

A `brain.db` written by **any** runtime is byte-identical to one written by **every other** runtime. Same schema, same FTS5 setup, same `pages` / `edges` / `facts` shape.

## Schema

```sql
CREATE TABLE pages (
  slug         TEXT PRIMARY KEY,
  content      TEXT NOT NULL,
  frontmatter  TEXT,            -- JSON
  updated_at   TEXT NOT NULL    -- ISO 8601
);

CREATE VIRTUAL TABLE pages_fts USING fts5(content, content='pages', content_rowid='rowid');

CREATE TABLE edges (
  source    TEXT NOT NULL,
  target    TEXT NOT NULL,
  type      TEXT NOT NULL,      -- mentions / attended / works_at / invested_in / founded / advises
  evidence  TEXT,
  PRIMARY KEY (source, target, type)
);

CREATE TABLE facts (
  id          TEXT PRIMARY KEY,
  subject     TEXT NOT NULL,
  predicate   TEXT NOT NULL,
  object      TEXT NOT NULL,
  source      TEXT,
  ts          TEXT NOT NULL,
  confidence  REAL DEFAULT 1.0
);
```

## Canonical artifact paths (every Hanzo SDK uses these)

| Path | What |
|---|---|
| `~/.hanzo/brain/brain.db` | The brain |
| `~/.hanzo/workspace/` | Markdown source — auto-ingested |
| `~/.hanzo/recipes/` | User-authored YAML recipes |
| `~/.hanzo/config.toml` | Per-machine config |
| `~/.hanzo/cache/` | Embedding cache, tool-output cache |
| `~/.hanzo/logs/` | Structured logs |

## Pluggable backends — scale out without changing the contract

| Backend | When | Repo |
|---|---|---|
| `sqlite` (default) | solo, < 100K pages | in-tree, ships everywhere |
| `qdrant` | vector ANN at scale | [`hanzoai/vector`](https://github.com/hanzoai/vector) |
| `meilisearch` | keyword FTS at scale | [`hanzoai/search`](https://github.com/hanzoai/search) |
| `zapdb` | canonical native store (ZAP-native, multi-language) | `zap-proto/db` (in-flight) |
| `replicate` | SQLite WAL → S3 backup | [`hanzoai/replicate`](https://github.com/hanzoai/replicate) |
| `vfs` | S3 streaming block FS, unlimited size | [`hanzoai/vfs`](https://github.com/hanzoai/vfs) |
| `postgres` | multi-tenant team | sibling pkg |

For multi-machine SQLite-shaped distributed semantics, we ship our own stack — **ZAP transport + hanzo-consensus + zapdb** — not libSQL/Turso. See [`hanzoai/bot-core/spec.md`](https://github.com/hanzoai/bot-core/blob/main/spec.md) for the full contract.

## Sister repos

- **[hanzoai/bot-core](https://github.com/hanzoai/bot-core)** — language-agnostic bot contract (channels, router, billing, brain hooks)
- **[hanzoai/bot](https://github.com/hanzoai/bot)** — TS runtime (OpenClaw fork; 30+ channels, voice, mobile)
- **[hanzoai/bot-go](https://github.com/hanzoai/bot-go)** — Go runtime (single binary, embeddable)
- **[hanzoai/python-sdk](https://github.com/hanzoai/python-sdk)** — Python (hanzo-memory pkg)
- **[hanzoai/mcp](https://github.com/hanzoai/mcp)** — TS + Rust + Go MCP server with the 13 HIP-0300 tools + brain tools

## License

MIT.
