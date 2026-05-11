/**
 * Search-result deduplication for chunked documents.
 *
 * When documents are chunked for embedding, multiple chunks from the same
 * source page can land in the result set. Default behavior: keep the
 * highest-scoring chunk per chain.
 *
 * A "chain" is identified by either:
 *   - an explicit `chainId` on the hit, or
 *   - the slug's parent (everything before the last `#chunk-N` suffix)
 */
import type { SearchHit } from "./index.js";

export interface DedupOptions {
  /** Custom extractor; default falls back to chain-id then slug-prefix. */
  chainOf?: (hit: SearchHit) => string;
  /** Keep top-N chunks per chain (default 1). */
  perChain?: number;
}

export function dedupHits(hits: SearchHit[], opts: DedupOptions = {}): SearchHit[] {
  const perChain = opts.perChain ?? 1;
  const chainOf = opts.chainOf ?? defaultChainOf;
  const buckets = new Map<string, SearchHit[]>();

  for (const h of hits) {
    const c = chainOf(h);
    if (!buckets.has(c)) buckets.set(c, []);
    buckets.get(c)!.push(h);
  }

  const out: SearchHit[] = [];
  for (const list of buckets.values()) {
    list.sort((a, b) => b.score - a.score);
    out.push(...list.slice(0, perChain));
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

function defaultChainOf(hit: SearchHit & { chainId?: string }): string {
  if (hit.chainId) return hit.chainId;
  // strip "#chunk-N" / "::N" suffixes
  return hit.slug.replace(/#chunk-\d+$/, "").replace(/::\d+$/, "");
}
