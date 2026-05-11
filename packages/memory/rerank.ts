/**
 * Maximal Marginal Relevance reranker.
 *
 * Carbonell & Goldstein (1998):
 *   MMR = argmax_{d ∈ R\S} [ λ·Sim(d, q) − (1−λ)·max_{d' ∈ S} Sim(d, d') ]
 *
 * Use after fusion to diversify the top-k. λ=1.0 collapses to pure
 * relevance; λ=0.0 maximizes diversity.
 */
import type { SearchHit } from "./index.js";

/** Cosine similarity for unit-or-non-unit vectors. */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

export interface MmrInput extends SearchHit {
  /** Hit-level embedding; if absent the hit is treated as maximally diverse. */
  embedding?: number[];
}

export interface MmrOptions {
  /** Diversity tradeoff. 1.0 = pure relevance, 0.0 = pure diversity. */
  lambda?: number;
  /** Top-k after rerank. */
  limit?: number;
}

/**
 * Greedy MMR. Returns up to `limit` hits ordered by MMR score.
 * Items without `embedding` are appended after all embedded items in
 * original order.
 */
export function mmrRerank(hits: MmrInput[], opts: MmrOptions = {}): MmrInput[] {
  const lambda = opts.lambda ?? 0.5;
  const limit = opts.limit ?? hits.length;

  const embedded = hits.filter((h) => h.embedding && h.embedding.length > 0);
  const orphan = hits.filter((h) => !h.embedding || h.embedding.length === 0);

  const selected: MmrInput[] = [];
  const candidates = [...embedded];

  while (selected.length < limit && candidates.length > 0) {
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const rel = c.score;
      let maxSim = 0;
      for (const s of selected) {
        const sim = cosine(c.embedding!, s.embedding!);
        if (sim > maxSim) maxSim = sim;
      }
      const mmr = lambda * rel - (1 - lambda) * maxSim;
      if (mmr > bestScore) {
        bestScore = mmr;
        bestIdx = i;
      }
    }

    if (bestIdx < 0) break;
    selected.push(candidates.splice(bestIdx, 1)[0]);
  }

  for (const o of orphan) {
    if (selected.length >= limit) break;
    selected.push(o);
  }

  return selected;
}
