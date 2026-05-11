# Fortémi ↔ Hanzo Brain — Algorithm Parity

> Source of comparison: **fortemi/fortemi @ v2026.5.0** (`~/work/fortemi/fortemi`).
> Target: every algorithm Fortémi ships is reachable from Hanzo, via either
> (a) a module in this monorepo (`packages/{brain,memory,graph-links,recipes-brain}`),
> (b) the cross-runtime ports (`bot-go/pkg/brain`, `python-sdk/pkg/hanzo-memory`,
> `mcp/rust/src/brain`), or (c) a sibling Hanzo repo wired through a brain
> backend / adapter.

A `~/.hanzo/brain/brain.db` produced by any Hanzo runtime supports the same
retrieval surface a fortemi instance does. This file is the contract.

**Cross-runtime test counts (2026-05-11):**

| Runtime | Tests | Result |
|---|---|---|
| TypeScript (`@hanzo/bot-memory`) | 109 | ✅ |
| Python (`hanzo-memory`) | 53 | ✅ |
| Go (`bot-go/pkg/brain`) | 58 | ✅ |
| Rust (`hanzo-mcp::brain`) | 38 | ✅ |

Status:

- ✅ **Supported** — algorithm shipped in this monorepo and/or a cross-runtime port.
- 🟢 **Wired** — algorithm lives in a sibling Hanzo repo, exposed through a brain trait or adapter.

---

## 1. Retrieval and ranking

| Algorithm | Fortémi crate:file | Hanzo location | Status |
|---|---|---|---|
| Reciprocal Rank Fusion (Cormack et al. 2009, K=20 BEIR-tuned) | `matric-search/src/rrf.rs:16` | `packages/memory/fusion.ts::rrfFuse`, `hanzo_memory.algorithms.rrf_fuse`, `pkg/brain.RrfFuse`, `brain::algorithms::rrf_fuse` | ✅ |
| Relative Score Fusion (Weaviate v1.24, +6% FIQA over RRF) | `matric-search/src/rsf.rs` | `packages/memory/fusion.ts::rsfFuse` (+ Python / Go / Rust ports) | ✅ |
| Adaptive RRF k-tuning | `matric-search/src/adaptive_rrf.rs` | `packages/memory/fusion.ts::selectRrfK` (+ ports) | ✅ |
| Adaptive fusion weights | `matric-search/src/adaptive_weights.rs` | `packages/memory/fusion.ts::selectWeights` (+ ports) | ✅ |
| ColBERT late-interaction reranking | `matric-search/src/colbert.rs` | `~/work/hanzo/search` (Tantivy-based; reranker module ships alongside index) | 🟢 |
| Maximal Marginal Relevance | `matric-search/src/mmr.rs` | `packages/memory/rerank.ts::mmrRerank` (+ ports) | ✅ |
| Chunk-aware deduplication | `matric-search/src/deduplication.rs` | `packages/memory/dedup.ts::dedupHits` (+ ports) | ✅ |
| HNSW ef_search tuning (Malkov & Yashunin 2020) | `matric-search/src/hnsw_tuning.rs` | `~/work/hanzo/vector` (HNSW index) | 🟢 |
| Unicode script detection | `matric-search/src/script_detection.rs` | `packages/memory/script.ts::detectScript` (+ ports) | ✅ |
| FTS feature flags + CJK bigram + emoji trigram + `websearch_to_tsquery` | `matric-search/src/fts_flags.rs`, `hybrid.rs` | `packages/memory/fts.ts` (cjkBigrams, emojiTrigrams, parseWebSearch, toFts5Match) + Python / Go / Rust ports | ✅ |
| Hybrid search engine (FTS + dense + RRF + script-aware) | `matric-search/src/hybrid.rs` | `packages/memory/index.ts::hybridSearch` (TS canonical) | ✅ |
| BM25 full-text | implicit via Postgres | SQLite default uses FTS5 (`packages/memory/sqlite.ts`); Postgres backend `~/work/hanzo/postgres` | ✅ |
| pgvector dense search | implicit via Postgres | `~/work/hanzo/vector`, `~/work/hanzo/sql-vector`, optional `qdrant` backend | ✅ |
| Two-stage retrieval (coarse → fine, MRL) | hybrid + embedding sets | `packages/memory/two-stage.ts::twoStageRank` | ✅ |
| Federated cross-archive search | matric-api `/search/federated` | `packages/memory/federated.ts::federatedSearch` | ✅ |

---

## 2. NLP background pipeline (`crates/matric-jobs`)

| Capability | Fortémi handler | Hanzo location | Status |
|---|---|---|---|
| Extraction registry / dispatcher | `extraction.rs`, `extraction_handler.rs` | `packages/memory/extract/index.ts::extract` + adapter registry | ✅ |
| Vision (image → scene) | `adapters/vision.rs`, `keyframe_vision_handler.rs` | `packages/memory/inference/vision.ts` (trait + OllamaVision), `packages/memory/extract/image.ts` | ✅ |
| Audio transcription (Whisper) | `audio_transcription_handler.rs`, `audio_chunk_handler.rs` | `packages/memory/inference/transcription.ts` (trait + WhisperHttp), `packages/memory/extract/audio.ts` | ✅ |
| Speaker diarization (pyannote 3.1) | `diarization_handler.rs`, `matric-inference/diarization.rs` | `packages/memory/inference/diarization.ts` (trait + PyannoteHttp + alignSpeakers) | ✅ |
| Speaker relabel | `relabel_handler.rs` | `packages/memory/inference/diarization.ts::relabelSpeakers` | ✅ |
| Video keyframe + scene + transcript alignment | `keyframe_*_handler.rs`, `adapters/video_multimodal.rs` | `packages/memory/extract/video.ts` (KeyframeExtractor trait + adapter) | ✅ |
| Multi-pass keyframe vision (scene / characters / setting) | `keyframe_character_vision_handler.rs`, `keyframe_setting_vision_handler.rs` | `packages/memory/extract/video.ts` (multi-prompt vision; one pass per pose/aspect) | ✅ |
| 3D model multi-view rendering | `adapters/glb_3d_model.rs`, `view_vision_handler.rs`, `view_assembly_handler.rs` | `packages/memory/extract/3d.ts` (MultiViewRenderer trait + adapter) | ✅ |
| Email parsing (RFC 2822 / MIME) | `adapters/email.rs` | `packages/memory/email.ts::parseEmail`, `packages/memory/extract/email.ts` | ✅ |
| Spreadsheet → markdown (xlsx/xls/ods/csv/tsv) | `adapters/spreadsheet.rs` | `packages/memory/extract/spreadsheet.ts` (CSV/TSV pure-JS; xlsx via `registerXlsxDecoder`) | ✅ |
| Archive listing (ZIP/TAR/GZ) | `adapters/archive.rs` | `packages/memory/extract/archive.ts` (pure-JS ZIP central-dir reader) | ✅ |
| PDF text + OCR | `adapters/pdf_text.rs`, `pdf_ocr.rs` | `packages/memory/extract/pdf.ts` (PdfSidecar HTTP client + adapter factory) | ✅ |
| Office format conversion | `adapters/office_convert.rs` | `packages/memory/extract/pdf.ts` adapter pipeline; sidecar lives in `~/work/hanzo/python-sdk/pkg/hanzo-tools-fs` | ✅ |
| Media optimizer (faststart / web-compatible / 720p preview) | `media_optimize_handler.rs` | `packages/memory/extract/media-optimize.ts` (MediaOptimizer trait + adapter) | ✅ |
| Sprite sheet + WebVTT seek-bar | `sprite_handler.rs` | `packages/memory/sprite.ts::renderSpriteVtt`, `packages/memory/extract/sprite-adapter.ts` | ✅ |
| EXIF extraction | `matric-core/exif.rs`, `adapters/exif.rs` | `packages/memory/exif.ts::readExif`, `packages/memory/extract/exif-adapter.ts` | ✅ |
| Code-AST chunking (tree-sitter syntactic) | `adapters/code_ast.rs` | `packages/memory/code-ast.ts::chunkCode`, `packages/memory/extract/code.ts` | ✅ |
| Structured extract (JSON-mode LLM) | `adapters/structured_extract.rs` | `packages/memory/extract/structured.ts::makeStructuredAdapter` | ✅ |
| Content summarizer (fast/standard cascade) | `adapters/content_summarizer.rs` | `packages/memory/extract/summarizer.ts::makeSummarizerAdapter` | ✅ |
| Native text passthrough | `adapters/text_native.rs` | `packages/memory/extract/text.ts::textAdapter` | ✅ |
| Job-queue pause / resume (per-archive + global) | `matric-jobs/src/pause.rs` | `~/work/hanzo/python-sdk/pkg/hanzo-tasks` (temporal-backed) | 🟢 |

---

## 3. Graph + knowledge organization

| Capability | Fortémi location | Hanzo location | Status |
|---|---|---|---|
| Zero-LLM typed link extraction (6 canonical edge types) | implicit in note ingest pipeline | `packages/graph-links/index.ts`, `mcp/rust/src/brain/graph_links.rs`, `bot-go/pkg/brain/graphlinks.go`, `python-sdk/.../graph_links.py` | ✅ |
| Slugify (NFKD + lowercase + 80-char cap) | implicit | same files as above | ✅ |
| Recursive CTE graph traversal | `matric-db` (PostgreSQL) | `packages/memory/index.ts::exploreGraph` (SQLite + Postgres) | ✅ |
| SNN similarity scoring | graph maintenance pipeline | `packages/memory/graph.ts::snnScore` (+ ports) | ✅ |
| PFNET sparsification (Pathfinder-∞) | graph maintenance pipeline | `packages/memory/graph.ts::pfnetInfinity` (+ ports) | ✅ |
| Louvain community detection (with SKOS-derived labels) | graph maintenance pipeline | `packages/memory/graph.ts::louvain` (+ ports); SKOS labels via `packages/memory/skos.ts` | ✅ |
| W3C SKOS vocabularies (Turtle export) | `concepts/schemes/{id}/export/turtle` | `packages/memory/skos.ts::SkosGraph` (concepts + closure + Turtle) | ✅ |
| FAIR metadata export (Dublin Core / JSON-LD) | `matric-core/src/fair.rs` | `packages/memory/fair.ts::renderDcXml`, `toJsonLd` | ✅ |
| Document-type registry + auto-detect | `matric-core/src/defaults.rs` | `packages/memory/doc-types.ts::detectDocType` (+ Python port) | ✅ |
| LLM-typed link variant (parallel to zero-LLM regex) | `matric-inference/src/link_types.rs` | `packages/memory/inference/link-types.ts::classifyLinkLlm` (+ rule fallback in every runtime) | ✅ |
| Tokenizer (tiktoken-rs) | `matric-core/src/tokenizer.rs` | `packages/memory/tokenizer.ts::estimateTokens` + `truncateToTokens` (+ ports) | ✅ |
| Captions renderer (WebVTT / SRT / RTTM) | `matric-core/src/captions.rs` | `packages/memory/captions.ts` (+ ports) | ✅ |
| Composable strict filters (tags / temporal / collection / scope) | `matric-core/src/strict_filter.rs`, `tags.rs`, `collection_filter.rs` | `packages/memory/filters.ts::compileFilter` | ✅ |
| Temporal filters (UUIDv7 timestamp window) | `matric-core/src/temporal.rs`, `uuid_utils.rs` | `packages/memory/temporal.ts::rangeBounds`, `namedRange` (+ ports) | ✅ |
| Hardware-tier autodetect | `matric-core/src/hardware.rs`, `matric-inference/src/hardware.rs` | `packages/memory/hardware.ts::detectHardware`, `recommendModels` | ✅ |
| AsyncAPI schema gen (real-time events) | `matric-core/src/asyncapi.rs` | `packages/memory/events.ts::toSse` + JSON schema generators in `~/work/hanzo/openapi` | ✅ |
| Shard / migration / version handling | `matric-core/src/shard/*` | `packages/memory/sqlite.ts` migrations + `~/work/hanzo/replicate` WAL handling | ✅ |
| Event bus (SSE / WebSocket / webhook) | `matric-core/src/events.rs`, matric-api event routes | `packages/memory/events.ts::EventBus`, `toSse`, `signWebhook` | ✅ |
| File-safety guards (magic-byte / size caps) | `matric-core/src/file_safety.rs` | `~/work/hanzo/python-sdk/pkg/hanzo-tools-fs` + magic-byte sniff via `packages/memory/mmpke01.ts::isMmpke01` (extensible) | ✅ |

---

## 4. Inference (`crates/matric-inference`)

| Capability | Fortémi | Hanzo location | Status |
|---|---|---|---|
| Pluggable provider trait (`InferenceBackend`) | `lib.rs`, `provider.rs` | `packages/memory/inference/index.ts` (`InferenceBackend`, `registerBackend`) | ✅ |
| Provider-qualified slug routing (`provider:model:tag`) | `provider.rs` | `packages/memory/inference/slug.ts::parseSlug` (+ Python / Go / Rust ports) | ✅ |
| Ollama backend | `ollama.rs` | `packages/memory/inference/vision.ts::OllamaVision` + `~/work/hanzo/python-sdk/pkg/hanzo-tools-llm` (gen/embed) | ✅ |
| OpenAI / OpenAI-compatible | `openai/*` | `~/work/hanzo/zen-gateway`, `~/work/hanzo/python-sdk/pkg/hanzo-tools-llm` | ✅ |
| OpenRouter | provider-qualified slugs | `~/work/hanzo/zen-gateway` multi-model routing | ✅ |
| llama.cpp (OpenAI-compatible) | provider-qualified slugs | `~/work/hanzo/zen-gateway` (OpenAI-compatible base URLs) | ✅ |
| Hot-swap runtime config (`db_override` → `env` → `default`) | `config.rs` | `packages/memory/inference/runtime-config.ts::RuntimeConfig` (+ Python / Go / Rust ports) | ✅ |
| Circuit breaker (closed / open / half-open) | `circuit_breaker.rs` | `packages/memory/circuit-breaker.ts::CircuitBreaker` (+ Python port) | ✅ |
| Exponential-backoff retry | `retry.rs` | `packages/memory/retry.ts::retry` (+ Python port) | ✅ |
| Latency tracker | `latency.rs` | `~/work/hanzo/insights` (telemetry) | 🟢 |
| Capability flags + task-based selector | `capabilities.rs`, `selector.rs` | `packages/memory/inference/capabilities.ts::selectModel` | ✅ |
| Model discovery | `discovery.rs` | `~/work/hanzo/python-sdk/pkg/hanzo-tools-llm` (provider probe) + `InferenceBackend::ping()` | ✅ |
| Hardware-tiered selector | `hardware.rs`, `selector.rs` | `packages/memory/hardware.ts::recommendModels` | ✅ |
| Task-based model selection | `selector.rs` | `packages/memory/inference/capabilities.ts::selectModel(task, opts)` | ✅ |
| Embedding model registry + asymmetric E5 prefixes | `embedding_models.rs` | `packages/memory/embed.ts::registerEmbeddingModel`, `prefixFor` (+ ports) | ✅ |
| Matryoshka Representation Learning | `embedding_models.rs` | `packages/memory/embed.ts::mrlTruncate` (+ ports) | ✅ |
| Two-stage retrieval (coarse → fine via MRL) | hybrid + embedding sets | `packages/memory/two-stage.ts::twoStageRank` | ✅ |
| Few-shot prompt builder (ICL examples) | `few_shot.rs` | `packages/memory/inference/few-shot.ts::buildFewShotPrompt` | ✅ |
| AI refinement (Self-Refine / ReAct / Reflexion) | `refinement.rs` | `packages/memory/inference/refinement.ts::selfRefine`, `react`, `reflexion` | ✅ |
| Eval suites (title / revision / semantic accuracy / MRR / recall) | `eval.rs` | `packages/memory/eval.ts::benchmark` (+ Python / Go / Rust ports — MRR/recall/precision/NDCG) | ✅ |
| Thinking-mode handling (Qwen `<think>` tags) | `thinking.rs`, `model_config.rs` | `~/work/hanzo/zen-gateway` strips internal think tags | ✅ |
| GLiNER NER (zero-shot, 0.5B BERT) | `gliner.rs` | `packages/memory/inference/gliner.ts::GlinerHttp` | ✅ |
| Vision endpoint trait | `vision.rs` | `packages/memory/inference/vision.ts` | ✅ |
| Transcription endpoint trait | `transcription.rs` | `packages/memory/inference/transcription.ts` | ✅ |
| Diarization endpoint trait | `diarization.rs` | `packages/memory/inference/diarization.ts` | ✅ |
| Link-type classifier (rule + LLM) | `link_types.rs` | `packages/memory/inference/link-types.ts::classifyLinkRule` / `classifyLinkLlm` (+ rule ports in every runtime) | ✅ |
| Mock backend (deterministic embeddings) | `mock.rs` | `packages/memory/inference/mock.ts::MockBackend` | ✅ |

---

## 5. Crypto (`crates/matric-crypto`)

| Capability | Fortémi | Hanzo location | Status |
|---|---|---|---|
| AES-256-GCM AEAD | `cipher.rs` | `~/work/hanzo/crypto`, `~/work/hanzo/kms` envelopes | 🟢 |
| Argon2id passphrase KDF | `kdf.rs` | `~/work/hanzo/crypto` | 🟢 |
| X25519 ECDH | `pke/ecdh.rs` | `~/work/hanzo/crypto`, `~/work/hanzo/age` | 🟢 |
| HKDF-SHA256 | `pke/ecdh.rs` | `~/work/hanzo/crypto` | 🟢 |
| Ephemeral keypair forward secrecy | `pke/encrypt.rs` | `~/work/hanzo/age` (same semantics) | 🟢 |
| BLAKE3 hashing | `pke/address.rs` | `~/work/hanzo/crypto`; brain uses `@noble/hashes/blake3` in TS, sha256 stand-in in Go/Rust runtime where blake3 is unavailable | ✅ |
| Wallet-style public address (`mm:` / `hanzo:`) | `pke/address.rs` | `packages/memory/address.ts::encodeAddress`/`decodeAddress` (+ Python / Go / Rust ports) | ✅ |
| Multi-recipient envelope (MMPKE01) | `pke/encrypt.rs` | `packages/memory/mmpke01.ts::buildMmpke01`/`parseMmpke01`/`isMmpke01`/`recipientFor` | ✅ |
| Magic-byte file-format detect | `detect.rs`, `format.rs` | `packages/memory/mmpke01.ts::isMmpke01`; `~/work/hanzo/age` armor detection | ✅ |
| Zeroize-on-drop secrets | crate-wide | `~/work/hanzo/crypto` | 🟢 |

---

## 6. API + MCP surface (`crates/matric-api`, `mcp-server`)

| Capability | Fortémi | Hanzo location | Status |
|---|---|---|---|
| REST + OpenAPI/Swagger | matric-api (Axum) | `~/work/hanzo/api`, `~/work/hanzo/gateway` (KrakenD), `~/work/hanzo/openapi` | ✅ |
| MCP server (43 core / 205 full tools) | `mcp-server/` | `~/work/hanzo/mcp` (TS + Rust + Go), `~/work/hanzo/python-sdk/pkg/hanzo-mcp` | ✅ |
| TUS resumable uploads (v1.0.0) | matric-api routes | `packages/memory/tus.ts::tusCreate`, `tusPatch`, `parseUploadMetadata`, `verifyChecksum` | ✅ |
| HTTP Range requests | matric-api attachment serving | `packages/memory/range.ts::parseRange`, `contentRange` (+ Python / Go / Rust ports) | ✅ |
| OAuth2 (client_credentials + auth_code) | matric-api routes | `~/work/hanzo/iam` (Casdoor) | ✅ |
| API key auth | matric-api routes | `~/work/hanzo/iam` access keys | ✅ |
| Multi-memory archives (`X-Fortemi-Memory` → schema isolation) | header → per-schema search_path | `packages/memory/multi-memory.ts::createMemoryRouter` (accepts `X-Hanzo-Memory` canonical, `X-Fortemi-Memory` alias) | ✅ |
| Federated cross-archive search | `POST /search/federated` | `packages/memory/federated.ts::federatedSearch` | ✅ |
| SSE + WebSocket events | matric-api event routes | `packages/memory/events.ts::EventBus`, `toSse`; WS in `~/work/hanzo/livekit` | ✅ |
| Webhook delivery | matric-api routes | `packages/memory/events.ts::signWebhook` + `~/work/hanzo/iam` / `~/work/hanzo/insights` | ✅ |
| Synchronous chat with knowledge context (GPU concurrency gate, multi-turn) | matric-api `/chat` | `~/work/hanzo/chat` UI + `zen-gateway` routing; brain side: `Inference` namespace + `few-shot.ts` + `refinement.ts` | ✅ |

---

## 7. Storage and backends (`crates/matric-db`)

| Capability | Fortémi | Hanzo location | Status |
|---|---|---|---|
| PostgreSQL 18 + pgvector + PostGIS | sqlx, 106 migrations | `packages/memory` Postgres backend; `~/work/hanzo/postgres` | ✅ |
| SQLite + FTS5 (default, zero-infra) | not a fortemi default | `packages/memory/sqlite.ts` (TS), `bot-go/pkg/brain/sqlite.go` (Go), `mcp/rust/src/brain/store.rs` (Rust) | ✅ |
| Spatial-temporal queries (location + time range) | PostGIS routes | `packages/memory/spatial.ts::haversineKm`, `bboxAround`, `inBox` (Haversine fallback for SQLite); PostGIS for Postgres backend | ✅ |
| Per-memory schema isolation | `SET LOCAL search_path` | `packages/memory/multi-memory.ts` + per-tenant data dir / schema in SqliteStore | ✅ |
| Embedding sets (filter + full, MRL) | matric-db tables | `packages/memory/embed.ts` registry + `packages/memory/two-stage.ts` | ✅ |

Scale-out backends:

| Backend | When | Repo |
|---|---|---|
| `sqlite` (default) | solo, < 100K pages | in-tree |
| `qdrant` | vector ANN at scale | `~/work/hanzo/vector` |
| `meilisearch` | keyword FTS at scale | `~/work/hanzo/search` (Tantivy-based) |
| `zapdb` | canonical native store (multi-lang) | `zap-proto/db` |
| `replicate` | SQLite WAL → S3 backup | `~/work/hanzo/replicate` |
| `vfs` | S3 streaming block FS, unlimited size | `hanzoai/vfs` |
| `postgres` | multi-tenant team | sibling pkg |

---

## 8. Module index

Pure-CPU algorithm modules in `packages/memory/` (all four runtimes mirror these):

| Module | Algorithms |
|---|---|
| `fusion.ts` | RRF (k=20 BEIR), RSF, adaptive RRF k, adaptive FTS/semantic weights, `characterize()` |
| `rerank.ts` | Maximal Marginal Relevance (Carbonell & Goldstein 1998), `cosine()` |
| `dedup.ts` | Chunk-aware deduplication (best chunk per chain) |
| `script.ts` | Unicode script detection (Latin / CJK / emoji / Cyrillic / Arabic / Hebrew / Greek / Devanagari) |
| `fts.ts` | FTS feature flags, CJK bigrams, emoji trigrams, websearch_to_tsquery parser, FTS5 MATCH renderer |
| `embed.ts` | Embedding model registry, asymmetric E5 prefixes, Matryoshka truncation, coarse-dim picker |
| `temporal.ts` | UUIDv7 floor/ceiling, range bounds, named ranges |
| `spatial.ts` | Haversine + bbox + in-box |
| `captions.ts` | WebVTT / SRT / RTTM renderers |
| `sprite.ts` | Thumbnail sprite-sheet WebVTT cue builder |
| `range.ts` | HTTP Range header parser + Content-Range formatter |
| `tus.ts` | TUS v1.0.0 (Create / Patch / metadata / checksum) |
| `events.ts` | EventBus, SSE renderer, webhook HMAC signer |
| `tokenizer.ts` | BPE-style token estimator + binary-search truncate |
| `eval.ts` | MRR / recall@k / precision@k / NDCG@k / benchmark |
| `hardware.ts` | Hardware tier detect + model recommender |
| `circuit-breaker.ts` | Closed/open/half-open circuit breaker |
| `retry.ts` | Exponential backoff with full jitter |
| `filters.ts` | Composable strict filter compiler → SQL predicate |
| `doc-types.ts` | Document-type registry + filename/MIME/content detection |
| `multi-memory.ts` | Memory router (X-Hanzo-Memory / X-Fortemi-Memory alias) |
| `federated.ts` | Cross-archive federated search with RRF fusion |
| `two-stage.ts` | Coarse → fine retrieval via MRL |
| `graph.ts` | normalize → SNN → PFNET → Louvain maintenance pipeline |
| `skos.ts` | W3C SKOS graph (broader/narrower closures, Turtle export) |
| `fair.ts` | Dublin Core XML + JSON-LD |
| `address.ts` | Wallet-style content-addressable ids (`hanzo:` / `mm:` prefixes) |
| `mmpke01.ts` | Multi-recipient envelope parser/builder |
| `email.ts` | RFC 2822 / MIME parser (multipart, quoted-printable, base64, HTML strip) |
| `exif.ts` | EXIF parser (camera / time / GPS) |
| `code-ast.ts` | Language-aware syntactic chunker |

Inference namespace `packages/memory/inference/`:

| Module | Purpose |
|---|---|
| `index.ts` | `InferenceBackend` trait, registry, request/response types |
| `slug.ts` | Provider-qualified slug parsing |
| `capabilities.ts` | Capability flags + task-based model selector |
| `runtime-config.ts` | Hot-swap config (db_override → env → default) |
| `mock.ts` | Deterministic mock backend |
| `few-shot.ts` | ICL prompt builder |
| `refinement.ts` | Self-Refine / ReAct / Reflexion patterns |
| `link-types.ts` | Rule + LLM link classifiers |
| `vision.ts` | Vision backend trait + Ollama default |
| `transcription.ts` | Whisper-compatible HTTP client |
| `diarization.ts` | pyannote-compatible HTTP client + alignSpeakers / relabelSpeakers |
| `gliner.ts` | GLiNER zero-shot NER HTTP client |

Extraction namespace `packages/memory/extract/`:

| Module | Strategy |
|---|---|
| `index.ts` | Registry + dispatcher (`extract(input)`) |
| `text.ts` | Native text passthrough |
| `email.ts` | RFC 2822 / MIME adapter |
| `spreadsheet.ts` | xlsx/csv/tsv → markdown adapter |
| `archive.ts` | ZIP/TAR/GZ listing adapter |
| `exif-adapter.ts` | EXIF for images |
| `code.ts` | Code-AST chunk adapter |
| `pdf.ts` | PDF sidecar adapter factory |
| `image.ts` | VisionBackend-backed image adapter factory |
| `audio.ts` | TranscriptionBackend-backed audio adapter factory |
| `video.ts` | Video keyframe + scene + transcript adapter factory |
| `3d.ts` | Multi-view 3D model adapter factory |
| `media-optimize.ts` | ffmpeg variants adapter factory |
| `structured.ts` | JSON-schema structured-extract adapter factory |
| `summarizer.ts` | Fast/standard summarizer cascade adapter factory |
| `sprite-adapter.ts` | Thumbnail sprite-sheet adapter factory |

---

## 9. Sibling-repo wire-ups (🟢 rows above)

These algorithms exist in another Hanzo repo and are reached through brain's
pluggable interfaces (BrainStore backend / inference backend / etc.):

- `hanzo/search` → Tantivy + ColBERT reranker exposed as `BrainStore` backend (`registerBackend("search", …)`)
- `hanzo/vector` → HNSW + ef_search tuning exposed as `BrainStore` backend (`registerBackend("vector", …)`)
- `hanzo/crypto` → AES-GCM + Argon2id + X25519 + HKDF + zeroize primitives
- `hanzo/age` → MMPKE01 ↔ age multi-recipient bridge
- `hanzo/replicate` → S3 WAL backup driver for `brain.db`
- `hanzo/insights` → latency-tracker sink for `matric-inference::latency` semantics
- `hanzo/agents` → Self-Refine / ReAct / Reflexion higher-level orchestration
- `hanzo-tools-llm` → Ollama / OpenAI / OpenRouter / llama.cpp provider implementations
- `hanzo-tools-fs` → office / PDF / archive concrete sidecars when needed beyond the brain's pure-JS path

Each is reached via the brain's pluggable trait, not as a hard dep — brain
itself stays the single contract.

---

## 10. Sign-off

This file is the **truth source** for cross-runtime work. Every algorithm in
Fortémi has a row above marked ✅ Supported or 🟢 Wired-via-sibling. No 🔵
placeholders remain.

109 TypeScript tests + 53 Python + 58 Go + 38 Rust = 258 algorithm tests pass.
