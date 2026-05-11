/**
 * Embedding model registry + Matryoshka Representation Learning helpers.
 *
 * MRL (Kusupati et al. 2022) lets a single embedding be truncated to a
 * shorter prefix and still preserve search quality — a 768-dim vector can
 * be stored at 128 or 64 dim for coarse retrieval, then reranked at full
 * 768 (two-stage retrieval). Up to ~12× storage savings.
 *
 * E5 family (Wang et al. 2022) requires task-specific prefixes:
 *   - "query: <text>" for queries
 *   - "passage: <text>" for documents
 * Asymmetric prefixes are model-specific; the registry tracks per-model.
 */

export type EmbedTask = "query" | "passage" | "symmetric";

export interface EmbeddingModel {
  /** Provider-qualified slug, e.g. "ollama:nomic-embed-text". */
  slug: string;
  /** Native output dimension. */
  dim: number;
  /** Allowed MRL truncation sizes (sorted ascending). Includes `dim`. */
  mrlDims?: number[];
  /** Asymmetric models put a prefix on queries vs passages. */
  prefix?: {
    query: string;
    passage: string;
  };
  /** Family / origin — informational only. */
  family?: string;
}

const REGISTRY = new Map<string, EmbeddingModel>();

export function registerEmbeddingModel(m: EmbeddingModel): void {
  REGISTRY.set(m.slug, m);
}

export function getEmbeddingModel(slug: string): EmbeddingModel | undefined {
  return REGISTRY.get(slug);
}

export function listEmbeddingModels(): EmbeddingModel[] {
  return Array.from(REGISTRY.values());
}

// ── Built-in models ────────────────────────────────────────────────────

// nomic-embed-text — 768d, symmetric. Default Ollama embed.
registerEmbeddingModel({
  slug: "ollama:nomic-embed-text",
  dim: 768,
  mrlDims: [128, 256, 512, 768],
  family: "nomic",
});

// intfloat/e5-large-v2 — 1024d, asymmetric.
registerEmbeddingModel({
  slug: "intfloat/e5-large-v2",
  dim: 1024,
  prefix: { query: "query: ", passage: "passage: " },
  family: "e5",
});

// OpenAI text-embedding-3-small — 1536d, native MRL.
registerEmbeddingModel({
  slug: "openai:text-embedding-3-small",
  dim: 1536,
  mrlDims: [256, 512, 768, 1024, 1536],
  family: "openai",
});

// OpenAI text-embedding-3-large — 3072d, native MRL.
registerEmbeddingModel({
  slug: "openai:text-embedding-3-large",
  dim: 3072,
  mrlDims: [256, 512, 1024, 2048, 3072],
  family: "openai",
});

// ── Prefix helpers ─────────────────────────────────────────────────────

export function prefixFor(model: EmbeddingModel, task: EmbedTask, text: string): string {
  if (task === "symmetric" || !model.prefix) return text;
  return task === "query" ? `${model.prefix.query}${text}` : `${model.prefix.passage}${text}`;
}

// ── MRL truncation ─────────────────────────────────────────────────────

/** L2-normalize an embedding in place; returns the same array. */
export function l2Normalize(v: number[]): number[] {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s);
  if (n === 0) return v;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

/**
 * MRL truncate. Returns a copy truncated to `targetDim` and L2-normalized
 * (re-normalization is required after truncation — the truncated vector
 * is no longer unit-length).
 */
export function mrlTruncate(embedding: number[], targetDim: number): number[] {
  if (targetDim <= 0) throw new Error("mrlTruncate: targetDim must be positive");
  if (targetDim >= embedding.length) return l2Normalize([...embedding]);
  return l2Normalize(embedding.slice(0, targetDim));
}

/**
 * Pick the coarse dimension for two-stage retrieval. We default to the
 * smallest MRL dim that's >= 1/8 of the native dim (a sane recall/cost
 * tradeoff backed by Kusupati et al. — ~128× compute reduction with
 * <1% recall loss on typical benchmarks).
 */
export function coarseDim(model: EmbeddingModel): number {
  if (!model.mrlDims || model.mrlDims.length === 0) return model.dim;
  const target = model.dim / 8;
  for (const d of model.mrlDims) {
    if (d >= target) return d;
  }
  return model.mrlDims[model.mrlDims.length - 1];
}
