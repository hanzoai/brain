/**
 * Retrieval evaluation metrics.
 *
 *   - Reciprocal Rank (RR) and Mean Reciprocal Rank (MRR)
 *   - Recall@k
 *   - Normalized Discounted Cumulative Gain (NDCG@k, binary or graded)
 *   - Precision@k
 *
 * Each takes a per-query golden set and the predicted ranking.
 */

export interface QueryEval {
  /** Predicted slugs in ranked order. */
  predicted: string[];
  /** Ground-truth slugs (binary relevance) or relevance map (graded). */
  relevant: string[] | Record<string, number>;
}

function isGraded(r: QueryEval["relevant"]): r is Record<string, number> {
  return !Array.isArray(r);
}

export function reciprocalRank(q: QueryEval): number {
  const rel = isGraded(q.relevant) ? new Set(Object.keys(q.relevant).filter((k) => q.relevant[k as keyof typeof q.relevant] > 0)) : new Set(q.relevant);
  for (let i = 0; i < q.predicted.length; i++) {
    if (rel.has(q.predicted[i])) return 1 / (i + 1);
  }
  return 0;
}

export function meanReciprocalRank(queries: QueryEval[]): number {
  if (queries.length === 0) return 0;
  let s = 0;
  for (const q of queries) s += reciprocalRank(q);
  return s / queries.length;
}

export function recallAtK(q: QueryEval, k: number): number {
  const rel = isGraded(q.relevant) ? new Set(Object.keys(q.relevant).filter((slug) => (q.relevant as Record<string, number>)[slug] > 0)) : new Set(q.relevant);
  if (rel.size === 0) return 0;
  const head = q.predicted.slice(0, k);
  let hits = 0;
  for (const p of head) if (rel.has(p)) hits++;
  return hits / rel.size;
}

export function precisionAtK(q: QueryEval, k: number): number {
  const rel = isGraded(q.relevant) ? new Set(Object.keys(q.relevant).filter((slug) => (q.relevant as Record<string, number>)[slug] > 0)) : new Set(q.relevant);
  const head = q.predicted.slice(0, k);
  if (head.length === 0) return 0;
  let hits = 0;
  for (const p of head) if (rel.has(p)) hits++;
  return hits / head.length;
}

export function ndcgAtK(q: QueryEval, k: number): number {
  const grades = isGraded(q.relevant)
    ? q.relevant
    : Object.fromEntries(q.relevant.map((s) => [s, 1] as const));
  const dcg = (slugs: string[]): number => {
    let s = 0;
    for (let i = 0; i < slugs.length; i++) {
      const g = grades[slugs[i]] ?? 0;
      s += (Math.pow(2, g) - 1) / Math.log2(i + 2);
    }
    return s;
  };
  const ideal = Object.entries(grades).map(([s, g]) => ({ s, g })).sort((a, b) => b.g - a.g).slice(0, k).map((x) => x.s);
  const idealDcg = dcg(ideal);
  const actual = dcg(q.predicted.slice(0, k));
  return idealDcg > 0 ? actual / idealDcg : 0;
}

export interface BenchmarkResult {
  mrr: number;
  recall: Record<number, number>;
  precision: Record<number, number>;
  ndcg: Record<number, number>;
}

export function benchmark(queries: QueryEval[], ks: number[] = [1, 5, 10, 20]): BenchmarkResult {
  const recall: Record<number, number> = {};
  const precision: Record<number, number> = {};
  const ndcg: Record<number, number> = {};
  for (const k of ks) {
    let r = 0, p = 0, n = 0;
    for (const q of queries) {
      r += recallAtK(q, k);
      p += precisionAtK(q, k);
      n += ndcgAtK(q, k);
    }
    const denom = Math.max(queries.length, 1);
    recall[k] = r / denom;
    precision[k] = p / denom;
    ndcg[k] = n / denom;
  }
  return { mrr: meanReciprocalRank(queries), recall, precision, ndcg };
}
