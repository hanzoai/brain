/**
 * Federated cross-archive search.
 *
 * Run a query against multiple memories in parallel, then fuse the
 * per-memory hits with RRF so the global ranking is consistent.
 */
import type { BrainStore, SearchHit } from "./index.js";
import { rrfFuse } from "./fusion.js";

export interface FederatedHit extends SearchHit {
  memory: string;
}

export async function federatedSearch(
  stores: Record<string, BrainStore>,
  query: string,
  topK: number = 20,
): Promise<FederatedHit[]> {
  const names = Object.keys(stores);
  const results = await Promise.all(
    names.map(async (name) => {
      const hits = await stores[name].hybridSearch(query, topK);
      return hits.map<FederatedHit>((h) => ({ ...h, memory: name }));
    }),
  );
  const fused = rrfFuse(results, topK);
  return fused.map<FederatedHit>((h) => {
    // Recover memory tag from the first source list that contained it.
    let mem = "default";
    for (let i = 0; i < results.length; i++) {
      if (results[i].some((r) => r.slug === h.slug)) {
        mem = names[i];
        break;
      }
    }
    return { ...h, memory: mem };
  });
}
