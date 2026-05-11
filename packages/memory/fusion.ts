/**
 * Result-list fusion strategies. Four pieces, each swappable independently:
 *
 *   - rrfFuse        — Reciprocal Rank Fusion (Cormack et al. 2009)
 *   - rsfFuse        — Relative Score Fusion (Weaviate v1.24, +6% over RRF
 *                      on FIQA when scores carry information beyond rank)
 *   - selectRrfK     — adaptive RRF k from query characteristics
 *   - selectWeights  — adaptive FTS/semantic weights from query type
 *
 * Each is pure CPU, no I/O. Same shape in every Hanzo runtime.
 */
import type { SearchHit } from "./index.js";

// ── Reciprocal Rank Fusion ─────────────────────────────────────────────

/**
 * Default RRF k. Elasticsearch's 2024 BEIR grid search found k=20 optimal
 * across diverse retrieval benchmarks; k=60 (the Cormack original) over-
 * smooths in small/medium corpora. Override via selectRrfK() per query.
 */
export const RRF_K_DEFAULT = 20;

export function rrfFuse(lists: SearchHit[][], limit: number, k: number = RRF_K_DEFAULT): SearchHit[] {
  const scores = new Map<string, number>();
  const meta = new Map<string, SearchHit>();
  const numLists = lists.length;

  for (const list of lists) {
    list.forEach((hit, rank) => {
      const inc = 1 / (k + rank + 1);
      scores.set(hit.slug, (scores.get(hit.slug) ?? 0) + inc);
      if (!meta.has(hit.slug)) meta.set(hit.slug, hit);
    });
  }

  if (scores.size === 0) return [];

  // Normalize to [0,1] using the theoretical maximum (rank 0 in every list).
  const max = numLists / (k + 1);
  const out: SearchHit[] = [];
  for (const [slug, raw] of scores) {
    const m = meta.get(slug)!;
    out.push({ ...m, score: max > 0 ? Math.min(raw / max, 1) : 0, source: "fused" });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

// ── Relative Score Fusion ──────────────────────────────────────────────

/**
 * RSF preserves score magnitude (min-max normalize each list, then weighted
 * sum). Outperforms RRF when scores are informative (BM25 with TF-IDF
 * distribution, calibrated embedding similarity).
 */
export function rsfFuse(
  lists: SearchHit[][],
  limit: number,
  weights?: number[],
): SearchHit[] {
  const w = weights ?? lists.map(() => 1 / Math.max(lists.length, 1));
  if (w.length !== lists.length) {
    throw new Error(`rsfFuse: weights.length (${w.length}) != lists.length (${lists.length})`);
  }

  const scores = new Map<string, number>();
  const meta = new Map<string, SearchHit>();

  lists.forEach((list, listIdx) => {
    if (list.length === 0) return;
    let lo = Infinity, hi = -Infinity;
    for (const h of list) {
      if (h.score < lo) lo = h.score;
      if (h.score > hi) hi = h.score;
    }
    const span = hi - lo;
    for (const h of list) {
      const norm = span > 0 ? (h.score - lo) / span : 1;
      scores.set(h.slug, (scores.get(h.slug) ?? 0) + w[listIdx] * norm);
      if (!meta.has(h.slug)) meta.set(h.slug, h);
    }
  });

  const out: SearchHit[] = [];
  for (const [slug, s] of scores) {
    const m = meta.get(slug)!;
    out.push({ ...m, score: s, source: "fused" });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

// ── Adaptive RRF k ─────────────────────────────────────────────────────

export interface QueryCharacteristics {
  tokenCount: number;
  /** true when the query looks like a phrase / quoted match. */
  isPhrase: boolean;
  /** true when the query has boolean operators (AND/OR/NOT). */
  isBoolean: boolean;
  /** average score gap across top result distribution (0 if unknown). */
  scoreGap?: number;
}

/**
 * Pick an RRF k per query. Short keyword queries → lower k (sharper
 * emphasis on top results); long conceptual queries → higher k (let more
 * semantic-rank candidates contribute).
 */
export function selectRrfK(q: QueryCharacteristics): number {
  if (q.isPhrase) return 10;
  if (q.isBoolean) return 15;
  if (q.tokenCount <= 2) return 15;
  if (q.tokenCount >= 10) return 40;
  return RRF_K_DEFAULT; // 20 — BEIR-tuned default
}

// ── Adaptive FTS / semantic weights ────────────────────────────────────

export interface FusionWeights {
  fts: number;
  semantic: number;
}

/**
 * Pick FTS vs dense weights. Short keyword queries lean FTS; long
 * conceptual queries lean semantic. Weights always sum to 1.0.
 */
export function selectWeights(q: QueryCharacteristics): FusionWeights {
  if (q.isPhrase) return { fts: 0.8, semantic: 0.2 };
  if (q.isBoolean) return { fts: 0.7, semantic: 0.3 };
  if (q.tokenCount <= 2) return { fts: 0.65, semantic: 0.35 };
  if (q.tokenCount >= 10) return { fts: 0.3, semantic: 0.7 };
  return { fts: 0.5, semantic: 0.5 };
}

/** Cheap classifier from raw query string — works without external NLP. */
export function characterize(query: string): QueryCharacteristics {
  const trimmed = query.trim();
  const isPhrase = /^".+"$/.test(trimmed) || /^'.+'$/.test(trimmed);
  const isBoolean = /\b(AND|OR|NOT)\b/.test(trimmed) || /\s-\S/.test(trimmed);
  const tokenCount = trimmed.split(/\s+/).filter(Boolean).length;
  return { tokenCount, isPhrase, isBoolean };
}
