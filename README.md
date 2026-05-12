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
                            hanzoai/node (Rust host)
                       ┌────────────┴────────────┐
                       │  brain crate + consensus│
                       │  + ZAP + PQC + threshold│
                       │  + SQLite default       │
                       │  • chain: hanzonet/*    │
                       └────────────┬────────────┘
                                    │
   ┌──────────────┬──────────────┬──┴───────────┬───────────────┐
   ▼              ▼              ▼              ▼               ▼
 hanzoai/bot  python-sdk    hanzoai/mcp    hanzobot/go   hanzobot/cpp
 (TS canon;   (hanzo-       (Rust crate    (Go single       (C++17 header-
  OpenClaw)    memory)       hanzo-mcp::    static binary)   only, embed
                             brain)                          in any host)
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
go install github.com/hanzobot/go/cmd/hanzo-bot@latest

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

For multi-machine SQLite-shaped distributed semantics, we ship our own stack — **ZAP transport + Quasar consensus + zapdb**, inherited from the [`hanzonet`](https://github.com/hanzonet) chain layer — not libSQL/Turso. See [`hanzobot/core/spec.md`](https://github.com/hanzobot/core/blob/main/spec.md) for the full contract.

## Hosts and chain

The brain is a first-class crate inside [`hanzoai/node`](https://github.com/hanzoai/node).
The node owns persistence (`~/.hanzo/brain/brain.db`), RPC (so any agent that
talks to a Hanzo Node gets `brain.recall` / `brain.search` / `brain.ingest`
without a sidecar), and inherits the chain layer from
[`hanzonet`](https://github.com/hanzonet) — Hanzo Network, the decentralized
AI compute chain:

| Layer | Lives in |
|---|---|
| Brain crate (Rust) | `hanzoai/node` workspace member (and `hanzoai/mcp` mirror for standalone MCP server use) |
| Chain genesis / validator coord | [`hanzonet/genesis`](https://github.com/hanzonet/genesis) |
| Block explorer | [`hanzonet/explore`](https://github.com/hanzonet/explore) |
| Bridge (MPC + privacy Teleport) | [`hanzonet/bridge`](https://github.com/hanzonet/bridge) |
| DEX (AMM) | [`hanzonet/exchange`](https://github.com/hanzonet/exchange) |
| Faucet | [`hanzonet/faucet`](https://github.com/hanzonet/faucet) |
| Wallet | [`hanzonet/wallet`](https://github.com/hanzonet/wallet) |
| Threshold-crypto service | [`hanzoai/mpc`](https://github.com/hanzoai/mpc) |
| Secrets / KMS | [`hanzoai/kms`](https://github.com/hanzoai/kms) |

The Quasar consensus, ZAP transport, PQC signatures, threshold-crypto wraps,
and SQLite/zapdb storage that the brain relies on are workspace crates inside
the node and aren't separately addressable repos — the chain surface that
*is* separately addressable lives under [`hanzonet`](https://github.com/hanzonet).

Five runtimes ship the same algorithm surface, byte-equivalent on the wire:

- **TypeScript** — `@hanzo/bot-memory` (this monorepo, canonical)
- **Python** — [`hanzo-memory`](https://github.com/hanzoai/python-sdk) (`hanzo_memory.algorithms`)
- **Go** — [`hanzobot/go`](https://github.com/hanzobot/go) (`pkg/brain`)
- **Rust** — [`hanzoai/node`](https://github.com/hanzoai/node) (`hanzo-brain` workspace member) and [`hanzoai/mcp`](https://github.com/hanzoai/mcp) (`hanzo_mcp::brain::algorithms`)
- **C++** — [`hanzobot/cpp`](https://github.com/hanzobot/cpp) (`include/hanzo/brain/algorithms.hpp`, header-only C++17)

Pure-CPU algorithm modules in `packages/memory/` (mirrored in every runtime):

- Retrieval: `fusion` (RRF / RSF / adaptive k / adaptive weights), `rerank` (MMR),
  `dedup`, `script`, `fts`, `embed` (MRL), `temporal`, `two-stage`, `federated`,
  `filters`, `multi-memory`
- Knowledge: `graph` (SNN / PFNET / Louvain), `skos`, `fair`, `doc-types`,
  `code-ast`, `email`, `exif`, `captions`, `sprite`
- Operational: `events`, `tokenizer`, `eval`, `hardware`, `circuit-breaker`,
  `retry`, `range`, `tus`, `spatial`
- Crypto: `address` (wallet-style ids), `mmpke01` (multi-recipient envelope)
- Inference: `inference/{index,slug,capabilities,runtime-config,mock,few-shot,
  refinement,link-types,vision,transcription,diarization,gliner}`
- Extraction: `extract/{index,text,email,spreadsheet,archive,exif-adapter,code,
  pdf,image,audio,video,3d,media-optimize,structured,summarizer,sprite-adapter}`

Cross-runtime tests, all green:
**121 TypeScript + 53 Python + 58 Go + 38 Rust (mcp) + 38 Rust (node) + 98 C++ = 406**.

## Sister repos

- **[hanzoai/node](https://github.com/hanzoai/node)** — Hanzo Node (Rust). Host for brain + bot infrastructure. Owns `~/.hanzo/brain/brain.db`, RPC, ZAP transport, Quasar consensus, threshold crypto.
- **[hanzonet](https://github.com/hanzonet)** — Hanzo Network. Chain layer: `genesis`, `explore`, `bridge`, `exchange`, `faucet`, `wallet`.
- **[hanzobot/core](https://github.com/hanzobot/core)** — language-agnostic bot contract (channels, router, billing, brain hooks)
- **[hanzoai/bot](https://github.com/hanzoai/bot)** — TS runtime (OpenClaw fork; 30+ channels, voice, mobile)
- **[hanzobot/go](https://github.com/hanzobot/go)** — Go runtime (single binary, embeddable)
- **[hanzobot/cpp](https://github.com/hanzobot/cpp)** — C++ runtime (header-only C++17, embeddable in any native host)
- **[hanzoai/python-sdk](https://github.com/hanzoai/python-sdk)** — Python (hanzo-memory pkg)
- **[hanzoai/mcp](https://github.com/hanzoai/mcp)** — TS + Rust + Go MCP server with the 13 HIP-0300 tools + brain tools

## License

MIT.
