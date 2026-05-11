/**
 * Two-stage retrieval (coarse → fine via Matryoshka).
 *
 *   1. Coarse stage: vector ANN on a low-dim (coarse) embedding.
 *   2. Fine stage:  rerank the top-N coarse hits using full-dim cosine.
 *
 * Up to 128× compute reduction with <1% recall loss on typical benchmarks
 * (Kusupati et al. 2022).
 */
import type { EmbeddingModel } from "./embed.js";
import { coarseDim, mrlTruncate } from "./embed.js";
import { cosine } from "./rerank.js";

export interface CoarseCandidate {
  slug: string;
  coarseEmbedding: number[];
  fullEmbedding?: number[];
}

export interface TwoStageOptions {
  /** Coarse k: candidates to gather from coarse stage. */
  coarseK: number;
  /** Final k after fine rerank. */
  finalK: number;
}

export interface RankedHit {
  slug: string;
  score: number;
}

/** End-to-end two-stage. Caller provides the candidate set. */
export function twoStageRank(
  query: number[],
  model: EmbeddingModel,
  candidates: CoarseCandidate[],
  opts: TwoStageOptions,
): RankedHit[] {
  const cd = coarseDim(model);
  const qCoarse = mrlTruncate(query, cd);

  const coarse: RankedHit[] = candidates.map((c) => ({
    slug: c.slug,
    score: cosine(qCoarse, c.coarseEmbedding),
  }));
  coarse.sort((a, b) => b.score - a.score);
  const top = coarse.slice(0, opts.coarseK);

  // Fine rerank only on hits that have full embeddings; others stay at coarse score.
  const fine: RankedHit[] = top.map((h) => {
    const c = candidates.find((x) => x.slug === h.slug)!;
    if (!c.fullEmbedding) return h;
    return { slug: h.slug, score: cosine(query, c.fullEmbedding) };
  });
  fine.sort((a, b) => b.score - a.score);
  return fine.slice(0, opts.finalK);
}
