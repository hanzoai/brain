# Fortémi ↔ Hanzo Brain — Algorithm Parity

> Source of comparison: **fortemi/fortemi @ v2026.5.0** (`~/work/fortemi/fortemi`).
> Target: ensure every algorithm Fortémi ships is reachable from Hanzo, via either
> (a) a sibling repo in `~/work/hanzo`, (b) a module in this monorepo
> (`packages/{brain,memory,graph-links,recipes-brain}`), or (c) the cross-runtime
> Go/Python/Rust ports.

A `~/.hanzo/brain/brain.db` produced by any Hanzo runtime must support the same
retrieval surface a fortemi instance does. This file is the contract.

Status key:

- ✅ **Supported** — algorithm already implemented in a Hanzo repo, with a
  thin adapter in `packages/memory` or accessible via `hanzo-mcp`.
- 🟡 **Partial** — primitive exists in a Hanzo repo but is not yet plumbed
  through `BrainStore`. Adapter is the only missing step.
- 🔵 **Planned** — not yet built; an issue or module stub lives in this repo.

---

## 1. Retrieval and ranking — `crates/matric-search`

| Algorithm | Fortémi crate:file | Hanzo location | Status |
|---|---|---|---|
| **Reciprocal Rank Fusion** (Cormack et al. 2009, K=20 BEIR-tuned) | `matric-search/src/rrf.rs:16` | `packages/memory/index.ts` (hybridSearch RRF), `bot-go/pkg/brain/sqlite.go` (HybridSearch), `mcp/rust/src/brain/store.rs` | ✅ |
| **Relative Score Fusion** (Weaviate v1.24, +6% FIQA over RRF) | `matric-search/src/rsf.rs` | `packages/memory/fusion.ts::rsfFuse` | ✅ |
| **Adaptive RRF k-tuning** (per-query characteristics) | `matric-search/src/adaptive_rrf.rs` | `packages/memory/fusion.ts::selectRrfK` | ✅ |
| **Adaptive fusion weights** (FTS/semantic mix per query type) | `matric-search/src/adaptive_weights.rs` | `packages/memory/fusion.ts::selectWeights` | ✅ |
| **ColBERT late-interaction reranking** (token-level MaxSim) | `matric-search/src/colbert.rs` | `~/work/hanzo/search` (Tantivy-based; ColBERT module to add) | 🟡 |
| **Maximal Marginal Relevance** (Carbonell & Goldstein 1998) | `matric-search/src/mmr.rs` | `packages/memory/rerank.ts::mmrRerank` | ✅ |
| **Chunk-aware deduplication** (per-doc best chunk) | `matric-search/src/deduplication.rs` | `packages/memory/dedup.ts::dedupHits` | ✅ |
| **HNSW ef_search tuning** (Malkov & Yashunin 2020) | `matric-search/src/hnsw_tuning.rs` | `~/work/hanzo/vector` (HNSW index lives here) | 🟡 |
| **Unicode script detection** (CJK / emoji / Latin classifier) | `matric-search/src/script_detection.rs` | `packages/memory/script.ts::detectScript` | ✅ |
| **FTS feature flags** (websearch_to_tsquery, trigram fallback, CJK bigrams) | `matric-search/src/fts_flags.rs` | `packages/memory/fts.ts` (new) | 🔵 |
| **Hybrid search engine** (FTS + dense + RRF + script-aware routing) | `matric-search/src/hybrid.rs` | `packages/memory/index.ts` (basic); needs script + RSF integration | 🟡 |
| **BM25 full-text** (PostgreSQL `tsvector`) | implicit via Postgres | SQLite default uses FTS5 (`packages/memory/sqlite.ts`); Postgres backend planned | 🟡 |
| **pgvector dense search** | implicit via Postgres | `~/work/hanzo/vector`, `~/work/hanzo/sql-vector`, optional `qdrant` backend | ✅ |

---

## 2. Background NLP pipeline — `crates/matric-jobs`

| Capability | Fortémi handler | Hanzo location | Status |
|---|---|---|---|
| Extraction registry / dispatcher | `matric-jobs/src/extraction.rs`, `extraction_handler.rs` | `packages/recipes-brain/extract.ts` (new — wraps recipes) | 🔵 |
| **Vision** (image → scene description via Ollama/Qwen multimodal) | `matric-jobs/src/adapters/vision.rs` | `~/work/hanzo/python-sdk/pkg/hanzo-tools-browser` (screenshot+OCR); `hanzo-mcp` vision tool | 🟡 |
| **Audio transcription** (Whisper) | `audio_transcription_handler.rs`, `audio_chunk_handler.rs`, `audio_util.rs`, `audio_transcribe.rs` | `~/work/hanzo/python-sdk/pkg/hanzo-tools-llm` (Whisper wrapper); MCP `transcribe` tool | 🟡 |
| **Speaker diarization** (pyannote 3.1) | `diarization_handler.rs`, `matric-inference/src/diarization.rs` | not yet; planned sidecar via `hanzo-tools-llm` | 🔵 |
| **Speaker relabel** (post-hoc user mapping) | `relabel_handler.rs` | with diarization | 🔵 |
| **Video keyframe extraction + scene detection** | `keyframe_*_handler.rs`, `adapters/video_multimodal.rs` | not yet; planned `hanzo-tools-video` | 🔵 |
| **Multi-pass keyframe vision** (scene / characters / setting) | `keyframe_character_vision_handler.rs`, `keyframe_setting_vision_handler.rs` | planned `hanzo-tools-video` | 🔵 |
| **3D model multi-view rendering** (Open3D) | `adapters/glb_3d_model.rs`, `view_vision_handler.rs`, `view_assembly_handler.rs` | not yet; planned `hanzo-tools-3d` (Blender bridge already in `Agent`) | 🔵 |
| **Email parsing** (RFC 2822 + MIME) | `adapters/email.rs` | `~/work/hanzo/python-sdk/pkg/hanzo-tools-fs` (file-aware); add `email` adapter | 🟡 |
| **Spreadsheet → markdown** (xlsx/xls/ods) | `adapters/spreadsheet.rs` (calamine) | planned `hanzo-tools-fs` adapter | 🔵 |
| **Archive listing** (zip/tar/gz) | `adapters/archive.rs` | planned `hanzo-tools-fs` adapter | 🔵 |
| **PDF text + OCR** | `adapters/pdf_text.rs`, `pdf_ocr.rs` | `~/work/hanzo/python-sdk/pkg/hanzo-tools-fs` (PDF tools exist) | 🟡 |
| **Office format conversion** | `adapters/office_convert.rs` | planned `hanzo-tools-fs` adapter | 🔵 |
| **Media optimizer** (ffmpeg faststart, web-compatible remux, 720p preview) | `media_optimize_handler.rs` | not yet | 🔵 |
| **Sprite sheets + WebVTT** (video seek-bar previews) | `sprite_handler.rs` | not yet | 🔵 |
| **EXIF extraction** | `matric-core/src/exif.rs`, `adapters/exif.rs` | not yet | 🔵 |
| **Code-AST chunking** (tree-sitter, syntactic) | `adapters/code_ast.rs` | `~/work/hanzo/ast` (tree-sitter wrapper) | 🟡 |
| **Structured extract** (JSON-mode LLM) | `adapters/structured_extract.rs` | `~/work/hanzo/python-sdk/pkg/hanzo-tools-llm` JSON mode | 🟡 |
| **Content summarizer** | `adapters/content_summarizer.rs` | `~/work/hanzo/python-sdk/pkg/hanzo-tools-llm` | 🟡 |
| **Native text passthrough** | `adapters/text_native.rs` | `packages/recipes-brain/extract.ts` (default branch) | 🔵 |
| Job-queue pause/resume (per archive + global) | `matric-jobs/src/pause.rs` | `~/work/hanzo/python-sdk/pkg/hanzo-tasks` (temporal-backed) | ✅ |

---

## 3. Graph and knowledge organization — `matric-core`

| Capability | Fortémi location | Hanzo location | Status |
|---|---|---|---|
| **Zero-LLM typed link extraction** (regex + role inference) | implicit in note ingest pipeline | `packages/graph-links/index.ts`, `mcp/rust/src/brain/graph_links.rs`, `bot-go/pkg/brain/graphlinks.go`, `python-sdk/pkg/hanzo-memory/src/hanzo_memory/graph_links.py` | ✅ |
| **Edge types** (6 canonical: mentions, attended, works_at, invested_in, founded, advises) | implicit | same files as above | ✅ |
| **Slugify** (NFKD + lowercase + 80-char cap) | implicit | same files as above | ✅ |
| **Recursive CTE graph traversal** | `matric-db` (PostgreSQL) | `packages/memory/index.ts` (`exploreGraph`); SQLite recursive CTE supported | 🟡 |
| **SNN similarity scoring** (shared-nearest-neighbor refinement) | matric-db graph maintenance | not yet | 🔵 |
| **PFNET sparsification** (topology-preserving thinning) | matric-db graph maintenance | not yet | 🔵 |
| **Louvain community detection** (with SKOS-derived labels) | matric-db graph maintenance | not yet | 🔵 |
| **W3C SKOS vocabularies** (broader/narrower/related/scopeNote) | `matric-core/src/models/*`, `concepts/schemes/{id}/export/turtle` | not yet; add `packages/skos` | 🔵 |
| **FAIR metadata export** (Dublin Core, JSON-LD) | `matric-core/src/fair.rs` | not yet; add `packages/fair` | 🔵 |
| **131 document type registry** + auto-detect | `matric-core/src/defaults.rs`, registry tables | not yet | 🔵 |
| **Tokenizer** (tiktoken-rs) | `matric-core/src/tokenizer.rs` | `~/work/hanzo/python-sdk/pkg/hanzo-tools-llm` (token counter) | 🟡 |
| **Captions renderer** (WebVTT / SRT / RTTM) | `matric-core/src/captions.rs` | `packages/memory/captions.ts::renderVtt`, `renderSrt`, `renderRttm` | ✅ |
| **Tags + collection filters** (composable strict filters) | `matric-core/src/strict_filter.rs`, `tags.rs`, `collection_filter.rs` | `packages/memory/index.ts` (basic); strict filter composition planned | 🟡 |
| **Temporal filters** (UUIDv7 timestamp window) | `matric-core/src/temporal.rs`, `uuid_utils.rs` | `packages/memory/temporal.ts::rangeBounds`, `namedRange` | ✅ |
| **File-safety guards** (magic-byte sniff, size caps) | `matric-core/src/file_safety.rs` | `~/work/hanzo/python-sdk/pkg/hanzo-tools-fs` | 🟡 |
| **Hardware-tier autodetect** (edge / gpu-12gb / gpu-24gb) | `matric-core/src/hardware.rs`, `inference/src/hardware.rs` | `~/work/hanzo/python-sdk/pkg/hanzo-tools-config` | 🟡 |
| **AsyncAPI schema gen** (real-time events) | `matric-core/src/asyncapi.rs` | not yet | 🔵 |
| **Shard / migration / version handling** | `matric-core/src/shard/*` | `~/work/hanzo/replicate` (WAL/segment level); brain.db migrations live in `packages/memory/sqlite.ts` | 🟡 |
| **Event bus** (SSE / WebSocket / webhook) | `matric-core/src/events.rs`, `matric-api` event routes | `~/work/hanzo/python-sdk/pkg/hanzo-network` (SSE), `hanzo-iam` webhooks | 🟡 |

---

## 4. Inference — `crates/matric-inference`

| Capability | Fortémi | Hanzo location | Status |
|---|---|---|---|
| **Pluggable provider trait** (`InferenceBackend`) | `matric-inference/src/lib.rs`, `provider.rs` | `~/work/hanzo/gateway` (KrakenD), `~/work/hanzo/zen-gateway`, `~/work/hanzo/python-sdk/pkg/hanzo-tools-llm` | ✅ |
| **Ollama backend** | `ollama.rs` | `hanzo-tools-llm` | ✅ |
| **OpenAI / OpenAI-compatible** | `openai/*` | `hanzo-tools-llm`, `zen-gateway` | ✅ |
| **OpenRouter** | provider-qualified slugs | `zen-gateway` (multi-model) | ✅ |
| **llama.cpp** (OpenAI-compatible) | provider-qualified slugs | `zen-gateway` accepts any OpenAI-compatible base URL | ✅ |
| **Provider-qualified slug routing** (`provider:model:tag`) | `provider.rs` | `~/work/hanzo/python-sdk/pkg/hanzo-tools-llm` model selector | 🟡 |
| **Hot-swap runtime config** (`db_override` → `env` → `default`) | `config.rs` | not yet — add `packages/brain/runtime-config.ts` | 🔵 |
| **Circuit breaker** (closed/open/half-open) | `circuit_breaker.rs` | not yet | 🔵 |
| **Retry with exponential backoff** | `retry.rs` | `hanzo-tools-llm` (general retry); add backoff helper | 🟡 |
| **Latency tracker** (per-op P95) | `latency.rs` | `~/work/hanzo/insights` (telemetry) | 🟡 |
| **Capability flags** (embedding / title-gen / revision / vision) | `capabilities.rs` | not yet — add `packages/brain/capabilities.ts` | 🔵 |
| **Model discovery** (auto-detect Ollama) | `discovery.rs` | `hanzo-tools-llm` (provider probe) | 🟡 |
| **Hardware-tiered selector** (Budget / Mid / High) | `hardware.rs`, `selector.rs` | `hanzo-tools-config` | 🟡 |
| **Task-based model selection** (title/revision/embed task types) | `selector.rs` | not yet | 🔵 |
| **Embedding model registry** (asymmetric E5 prefixes) | `embedding_models.rs` | `packages/memory/embed.ts::getEmbeddingModel`, `registerEmbeddingModel`, `prefixFor` | ✅ |
| **Matryoshka Representation Learning** (12× storage savings) | embedded in `embedding_models.rs` | `packages/memory/embed.ts::mrlTruncate` | ✅ |
| **Two-stage retrieval** (coarse → fine via MRL) | hybrid + embedding sets | `packages/memory/embed.ts::coarseDim` (helper; full plumb via store backend) | 🟡 |
| **Few-shot prompt builder** (3-5 ICL examples) | `few_shot.rs` | `~/work/hanzo/python-sdk/pkg/hanzo-tools-llm` (prompt helpers) | 🟡 |
| **AI refinement** (Self-Refine / ReAct / Reflexion) | `refinement.rs` | `~/work/hanzo/agents` (multi-step), `~/work/hanzo/agent` | 🟡 |
| **Eval suites** (title quality / revision / semantic accuracy) | `eval.rs` | not yet — add `packages/brain/evals` | 🔵 |
| **Thinking-mode handling** (Qwen `<think>` tags) | `thinking.rs`, `model_config.rs` | `zen-gateway` strips internal think tags | ✅ |
| **GLiNER NER** (zero-shot, 0.5B BERT) | `gliner.rs` | not yet — sidecar via `hanzo-tools-llm` | 🔵 |
| **Vision endpoint trait** | `vision.rs` | `hanzo-tools-llm` vision wrapper | 🟡 |
| **Transcription endpoint trait** | `transcription.rs` | `hanzo-tools-llm` Whisper wrapper | 🟡 |
| **Diarization endpoint trait** | `diarization.rs` | pyannote sidecar — not yet | 🔵 |
| **Link-type classifier** (typed graph edges via LLM) | `link_types.rs` | `packages/graph-links` is zero-LLM; LLM-typed variant planned | 🔵 |
| **Mock backend** (deterministic embeddings) | `mock.rs` | `~/work/hanzo/python-sdk/pkg/hanzo-tools-llm` mock provider | 🟡 |

---

## 5. Crypto — `crates/matric-crypto`

| Capability | Fortémi | Hanzo location | Status |
|---|---|---|---|
| **AES-256-GCM AEAD** | `cipher.rs` | `~/work/hanzo/crypto` (Rust), `~/work/hanzo/kms` envelopes | ✅ |
| **Argon2id passphrase KDF** | `kdf.rs` | `~/work/hanzo/crypto` | ✅ |
| **X25519 ECDH** (Curve25519) | `pke/ecdh.rs` | `~/work/hanzo/crypto`, `~/work/hanzo/age` (X25519 recipient impl) | ✅ |
| **HKDF-SHA256** | `pke/ecdh.rs` | `~/work/hanzo/crypto` | ✅ |
| **Ephemeral keypair forward secrecy** | `pke/encrypt.rs` | `~/work/hanzo/age` matches semantics | ✅ |
| **BLAKE3 hashing** | `pke/address.rs` | `~/work/hanzo/crypto` | ✅ |
| **Wallet-style public address** (`mm:<base58check>`) | `pke/address.rs` | reuse `~/work/hanzo/identity` (DID) or add `hanzo:` prefix variant | 🔵 |
| **Multi-recipient envelope** (per-recipient KEK wrap of one DEK) | `pke/encrypt.rs` | `~/work/hanzo/age` is the canonical Hanzo equivalent; bridge MMPKE01↔age | 🟡 |
| **Magic-byte file format detect** | `detect.rs`, `format.rs` | `~/work/hanzo/age` armor detection | 🟡 |
| **Zeroize-on-drop secrets** | crate-wide | `~/work/hanzo/crypto` follows same convention | ✅ |

---

## 6. API + MCP surface — `crates/matric-api`, `mcp-server`

| Capability | Fortémi | Hanzo location | Status |
|---|---|---|---|
| **REST + OpenAPI/Swagger** | `matric-api` (Axum) | `~/work/hanzo/api`, `~/work/hanzo/gateway` (KrakenD), `~/work/hanzo/openapi` | ✅ |
| **MCP server** (43 core / 205 full tools) | `mcp-server/` | `~/work/hanzo/mcp` (TS+Rust+Go), `~/work/hanzo/python-sdk/pkg/hanzo-mcp` | ✅ |
| **TUS resumable uploads** (v1.0.0) | matric-api routes | not yet — add via `hanzo-ingress` middleware | 🔵 |
| **HTTP Range requests** | matric-api attachment serving | `~/work/hanzo/ingress`, `~/work/hanzo/static` | ✅ |
| **OAuth2** (client_credentials + auth_code) | matric-api routes | `~/work/hanzo/iam` (Casdoor) | ✅ |
| **API key auth** | matric-api routes | `~/work/hanzo/iam` access keys | ✅ |
| **Multi-memory archives** (schema-isolated) | `X-Fortemi-Memory` header → per-schema search_path | `packages/memory` should accept `X-Hanzo-Memory` (or `X-Org-Id`) and route to per-tenant SQLite/Postgres schema | 🔵 |
| **Federated cross-archive search** | `POST /search/federated` | planned `packages/memory/federated.ts` | 🔵 |
| **SSE + WebSocket events** | matric-api event routes | `~/work/hanzo/python-sdk/pkg/hanzo-network` SSE, `~/work/hanzo/livekit` WS | 🟡 |
| **Webhook delivery** | matric-api routes | `~/work/hanzo/iam` and `~/work/hanzo/insights` webhooks | ✅ |
| **Synchronous chat** with knowledge context (GPU concurrency gate, multi-turn) | matric-api `/chat` | `~/work/hanzo/chat` UI + `zen-gateway` model routing; brain side needs context-injection helper | 🟡 |

---

## 7. Storage and backends — `crates/matric-db`

| Capability | Fortémi | Hanzo location | Status |
|---|---|---|---|
| PostgreSQL 18 + pgvector + PostGIS | `matric-db` (sqlx, 106 migrations) | optional `postgres` backend in `packages/memory` (planned); `~/work/hanzo/postgres` | 🟡 |
| **SQLite + FTS5** (default, zero-infra) | not a fortemi default — only Postgres | `packages/memory/sqlite.ts` (TS), `bot-go/pkg/brain/sqlite.go` (Go), `mcp/rust/src/brain/store.rs` (Rust) | ✅ (Hanzo unique) |
| **Spatial-temporal queries** (PostGIS location + time range) | matric-db spatial routes | `packages/memory/geo.ts` (planned); SQLite + R-Tree fallback | 🔵 |
| **Per-memory schema isolation** | sqlx `SET LOCAL search_path` | tenant-aware path resolution in `packages/memory` | 🔵 |
| **Embedding sets** (filter + full sets, MRL) | matric-db tables | not yet — add `packages/memory/embed.ts` | 🔵 |

Scale-out backends (already in this repo's README):

| Backend | When | Repo |
|---|---|---|
| `sqlite` (default) | solo, < 100K pages | in-tree |
| `qdrant` | vector ANN at scale | `~/work/hanzo/vector` |
| `meilisearch` | keyword FTS at scale | `~/work/hanzo/search` (Tantivy-based) |
| `zapdb` | canonical native store (multi-lang) | `zap-proto/db` (in-flight) |
| `replicate` | SQLite WAL → S3 backup | `~/work/hanzo/replicate` |
| `vfs` | S3 streaming block FS, unlimited size | `hanzoai/vfs` |
| `postgres` | multi-tenant team | sibling pkg |

---

## 8. Net-new modules to add in this repo

These are the gaps that don't have a clean home in another Hanzo repo, and
belong inside hanzoai/brain itself (one module = one algorithm, DRY):

1. `packages/memory/fusion.ts` — RRF, **RSF**, **adaptive RRF k**, **adaptive weights** ✅
2. `packages/memory/rerank.ts` — **MMR** diversity reranker ✅
3. `packages/memory/dedup.ts` — chunk-aware **deduplication** for chunked docs ✅
4. `packages/memory/script.ts` — Unicode **script detection** (Latin / CJK / emoji) ✅
5. `packages/memory/temporal.ts` — UUIDv7 temporal window helpers ✅
6. `packages/memory/embed.ts` — embedding model registry + **MRL truncation** + two-stage retrieval ✅
7. `packages/memory/captions.ts` — WebVTT / SRT / RTTM rendering ✅
8. `packages/memory/fts.ts` — FTS feature flags + bigram CJK + trigram emoji helpers (planned)
9. `packages/memory/federated.ts` — cross-archive federated search (planned)
10. `packages/memory/runtime-config.ts` — hot-swap inference config (`db_override` → `env` → `default`) (planned)
11. `packages/memory/capabilities.ts` — model capability flags + task-based selector (planned)
12. `packages/memory/eval.ts` — eval harness (title / revision / semantic accuracy / MRR / recall) (planned)
13. `packages/memory/skos.ts` — W3C SKOS concept tree (broader / narrower / related, Turtle export) (planned)
14. `packages/memory/fair.ts` — Dublin Core + JSON-LD metadata export (planned)
15. `packages/memory/graph-maint.ts` — **SNN scoring**, **PFNET sparsification**, **Louvain** community detection (planned)
16. `packages/graph-links/llm.ts` — LLM-typed link variant (parallel to zero-LLM regex) (planned)
17. `packages/recipes-brain/extract.ts` — extraction registry surface (vision / audio / video / 3D / email / spreadsheet / archive / pdf / office / sprite) (planned)

Tests for landed modules live in `packages/memory/algorithms.test.ts` (21 cases).

These are mirrored in Python (`hanzo-memory`) and Rust (`hanzoai/mcp::brain`)
and Go (`bot-go/pkg/brain/*`) following the cross-runtime byte-equivalence rule.

---

## 9. Sibling-repo work to wire up

For 🟡 rows, the algorithm exists in another Hanzo repo but isn't reachable
through the `BrainStore` contract. Adapter PRs needed:

- `hanzo/search` → expose Tantivy + ColBERT as a `BrainStore` backend (`registerBackend("search", ...)`)
- `hanzo/vector` → expose HNSW + ef_search tuning as a `BrainStore` backend (`registerBackend("vector", ...)`)
- `hanzo/crypto` → re-export AES-GCM + Argon2id + X25519 + HKDF + BLAKE3 from a single facade matching matric-crypto's surface
- `hanzo/age` → bridge MMPKE01 ↔ age format; same multi-recipient semantics
- `hanzo/replicate` → S3 WAL backup driver for `brain.db`
- `hanzo/insights` → latency-tracker sink for `matric-inference::latency` semantics
- `hanzo/agents` → Self-Refine / ReAct / Reflexion patterns under a common `Refiner` trait
- `hanzo-tools-llm` → fortemi-style provider registry (Ollama / OpenAI / OpenRouter / llama.cpp) under `provider:model:tag` slug routing
- `hanzo-tools-fs` → email / spreadsheet / archive / office / PDF adapters
- `hanzo-ast` → code-AST chunker registered as a recipe-brain extraction strategy

---

## 10. What's intentionally NOT planned for parity

- **Open3D 3D renderer process** — too heavy as a brain-side dep; will live as
  a `hanzo-tools-3d` sidecar only when the use case requires it.
- **Pyannote diarization sidecar bundle** — same; ship via `hanzo-tools-llm`
  when first user lands.
- **131-doc-type auto-detect table verbatim** — Hanzo will keep a smaller
  curated set and accept user-provided detectors. The 131-row taxonomy is a
  Fortémi-specific design choice, not an algorithm.

---

## Sign-off

This file is the **truth source** for cross-repo work. Every algorithm in
Fortémi has a row above with a concrete Hanzo destination. Updates to either
side land here first, then in the implementing repo.

If you add an algorithm anywhere in Hanzo that Fortémi also has, update the
matching row and flip the status. If you add an algorithm Fortémi doesn't
have, add a new section so the audit stays symmetric.
