/**
 * Graph quality maintenance pipeline.
 *
 *   normalize → SNN scoring → PFNET sparsification → Louvain communities
 *
 * Used to refine the auto-linked knowledge graph: bring edge weights into
 * the same scale, replace raw similarity with shared-nearest-neighbor
 * agreement, drop edges that don't carry topology-preserving information,
 * and partition the result into communities.
 */

export interface WeightedEdge {
  source: string;
  target: string;
  weight: number;
}

// ── Normalize ──────────────────────────────────────────────────────────

/** Min-max normalize edge weights into [0,1]. */
export function normalizeEdges(edges: WeightedEdge[]): WeightedEdge[] {
  if (edges.length === 0) return [];
  let lo = Infinity, hi = -Infinity;
  for (const e of edges) {
    if (e.weight < lo) lo = e.weight;
    if (e.weight > hi) hi = e.weight;
  }
  const span = hi - lo;
  return edges.map((e) => ({
    ...e,
    weight: span > 0 ? (e.weight - lo) / span : 1,
  }));
}

// ── SNN (Shared Nearest Neighbor) ──────────────────────────────────────

/**
 * SNN(u,v) = |N(u) ∩ N(v)| / |N(u) ∪ N(v)|, where N(x) is x's top-k
 * neighborhood in the input graph. Replaces a raw similarity edge with
 * how much its endpoints' broader neighborhoods agree.
 */
export function snnScore(edges: WeightedEdge[], k: number = 10): WeightedEdge[] {
  // Build top-k neighborhoods per node.
  const neighbors = new Map<string, Set<string>>();
  const adj = new Map<string, WeightedEdge[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source)!.push(e);
    // treat as undirected for SNN
    adj.get(e.target)!.push({ source: e.target, target: e.source, weight: e.weight });
  }
  for (const [node, list] of adj) {
    list.sort((a, b) => b.weight - a.weight);
    neighbors.set(node, new Set(list.slice(0, k).map((e) => e.target)));
  }
  return edges.map((e) => {
    const a = neighbors.get(e.source) ?? new Set<string>();
    const b = neighbors.get(e.target) ?? new Set<string>();
    let inter = 0;
    for (const n of a) if (b.has(n)) inter++;
    const union = a.size + b.size - inter;
    return { ...e, weight: union > 0 ? inter / union : 0 };
  });
}

// ── PFNET (Pathfinder Network) sparsification ──────────────────────────

/**
 * Keep only edges where w(u,v) ≥ max(w(u,x) + w(x,v) for any intermediate x)
 * under the Minkowski-r metric. Implementing the r=∞ / q=∞ Pathfinder
 * (PFNET-∞) which is well-defined and topology-preserving.
 *
 * Reference: Schvaneveldt (1990).
 */
export function pfnetInfinity(edges: WeightedEdge[]): WeightedEdge[] {
  const adj = new Map<string, Map<string, number>>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, new Map());
    if (!adj.has(e.target)) adj.set(e.target, new Map());
    adj.get(e.source)!.set(e.target, Math.max(adj.get(e.source)!.get(e.target) ?? 0, e.weight));
  }
  // For each (u,v) check if there's a 2-hop path with higher min weight.
  const keep: WeightedEdge[] = [];
  for (const e of edges) {
    const direct = e.weight;
    let dominated = false;
    const uNbrs = adj.get(e.source);
    if (uNbrs) {
      for (const [x, wux] of uNbrs) {
        if (x === e.target) continue;
        const wxv = adj.get(x)?.get(e.target);
        if (wxv === undefined) continue;
        // For weights interpreted as "stronger = larger", PFNET-∞ keeps the
        // edge if direct >= min(path). Drop if a path dominates.
        const pathStrength = Math.min(wux, wxv);
        if (pathStrength > direct) {
          dominated = true;
          break;
        }
      }
    }
    if (!dominated) keep.push(e);
  }
  return keep;
}

// ── Louvain community detection ────────────────────────────────────────

/**
 * Greedy modularity optimization (Blondel et al. 2008). Returns a Map of
 * node → community id. Tiny graph implementation — fine up to ~10k nodes
 * for the brain's auto-linked use case; backends that need scale call
 * out to a sidecar.
 */
export function louvain(edges: WeightedEdge[], passes: number = 10): Map<string, number> {
  const nodes = new Set<string>();
  for (const e of edges) { nodes.add(e.source); nodes.add(e.target); }
  const community = new Map<string, number>();
  let next = 0;
  for (const n of nodes) community.set(n, next++);

  const adj = new Map<string, Array<{ to: string; w: number }>>();
  let totalW = 0;
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source)!.push({ to: e.target, w: e.weight });
    adj.get(e.target)!.push({ to: e.source, w: e.weight });
    totalW += e.weight;
  }
  const m = totalW; // sum of weights in undirected view
  const deg = new Map<string, number>();
  for (const [n, list] of adj) {
    let d = 0;
    for (const ne of list) d += ne.w;
    deg.set(n, d);
  }

  let improved = true;
  for (let pass = 0; pass < passes && improved; pass++) {
    improved = false;
    for (const n of nodes) {
      const cur = community.get(n)!;
      const nbrs = adj.get(n) ?? [];
      // candidate communities + edge weight to them
      const wTo = new Map<number, number>();
      for (const ne of nbrs) {
        const c = community.get(ne.to)!;
        wTo.set(c, (wTo.get(c) ?? 0) + ne.w);
      }
      let best = cur;
      let bestGain = 0;
      const kn = deg.get(n) ?? 0;
      for (const [c, wnc] of wTo) {
        if (c === cur) continue;
        // ΔQ approximation = w(n→c) − kn·Σtot(c) / (2m)
        let sigmaTot = 0;
        for (const [other, comm] of community) {
          if (comm === c && other !== n) sigmaTot += deg.get(other) ?? 0;
        }
        const gain = wnc - (kn * sigmaTot) / Math.max(2 * m, 1e-9);
        if (gain > bestGain) { bestGain = gain; best = c; }
      }
      if (best !== cur) {
        community.set(n, best);
        improved = true;
      }
    }
  }

  // Compact community ids to 0..N-1.
  const idMap = new Map<number, number>();
  let id = 0;
  for (const c of community.values()) {
    if (!idMap.has(c)) idMap.set(c, id++);
  }
  for (const [n, c] of community) community.set(n, idMap.get(c)!);
  return community;
}

// ── Full pipeline ──────────────────────────────────────────────────────

export interface GraphMaintenanceResult {
  normalized: WeightedEdge[];
  snn: WeightedEdge[];
  sparse: WeightedEdge[];
  communities: Map<string, number>;
}

export function graphMaintenance(edges: WeightedEdge[], k: number = 10): GraphMaintenanceResult {
  const normalized = normalizeEdges(edges);
  const snn = snnScore(normalized, k);
  const sparse = pfnetInfinity(snn);
  const communities = louvain(sparse);
  return { normalized, snn, sparse, communities };
}
