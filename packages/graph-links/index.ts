/**
 * Hanzo Brain — Graph Links extractor
 *
 * Zero-LLM typed-link extraction. Runs on every page write.
 * Walks markdown content, finds entity references, and emits typed edges
 * (attended / works_at / invested_in / founded / advises / mentions).
 *
 * Pure regex + role inference. No LLM calls, no embeddings, no I/O on
 * the hot path. Suitable for >10K pages/sec throughput.
 *
 * Pairs with @hanzo/bot-memory-postgres (or LanceDB) which persists the
 * edges. Together they implement gbrain-style self-wiring knowledge
 * graph on top of the Hanzo memory plane.
 */

export type EdgeType = "mentions" | "attended" | "works_at" | "invested_in" | "founded" | "advises";

export interface Edge {
  source: string; // page slug
  target: string; // referenced entity slug
  type: EdgeType;
  evidence?: string; // verbatim phrase that triggered the inference
}

export interface ExtractInput {
  slug: string; // source page slug (e.g. "meetings/2026-05-10")
  pageType?: string; // frontmatter `type` if present (e.g. "meeting", "person")
  content: string; // raw markdown body
}

// Markdown link: [Display](slug) — capture the slug. Excludes code fences.
const MD_LINK = /\[([^\]]+)\]\(([^)#\s]+)\)/g;

// Bare slug refs: `people/alice`, `companies/acme-ai`, optionally preceded by @
const BARE_SLUG =
  /(?<![\/\w])@?((?:people|companies|deals|projects|investors|firms)\/[a-z0-9][a-z0-9-]*)/gi;

// Code-fence stripping so slugs inside ```...``` don't pollute extraction.
function stripCodeFences(md: string): string {
  return md.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]+`/g, "");
}

// Role-inference patterns. Order matters — first match wins per (source, target).
const ROLE_PATTERNS: Array<{ pattern: RegExp; type: EdgeType }> = [
  // FOUNDED ⇒ "founded X" / "co-founded X" / "founder of X"
  { pattern: /\b(?:co-?)?founded\s+([^.\n]+?)(?:[\.\n]|$)/i, type: "founded" },
  { pattern: /\bfounder\s+(?:and\s+\w+\s+)?of\s+([^.\n]+?)(?:[\.\n]|$)/i, type: "founded" },

  // INVESTED_IN ⇒ "invested in X" / "led X's seed" / "wrote a check into X"
  { pattern: /\binvested\s+in\s+([^.\n]+?)(?:[\.\n]|$)/i, type: "invested_in" },
  { pattern: /\bled\s+([^.\n]+?)['']s\s+(?:seed|series|round)/i, type: "invested_in" },
  { pattern: /\bwrote\s+(?:a\s+)?check\s+into\s+([^.\n]+?)(?:[\.\n]|$)/i, type: "invested_in" },

  // ADVISES ⇒ "advises X" / "advisor to X" / "X advisor"
  { pattern: /\badvises\s+([^.\n]+?)(?:[\.\n]|$)/i, type: "advises" },
  { pattern: /\badvisor\s+(?:to|at|for)\s+([^.\n]+?)(?:[\.\n]|$)/i, type: "advises" },

  // WORKS_AT ⇒ "X at Y" / "Y's CEO" / "CTO of Y" / "joined Y"
  {
    pattern: /\b(?:CEO|CTO|COO|CFO|VP|head\s+of\s+\w+|director)\s+of\s+([^.\n]+?)(?:[\.\n]|$)/i,
    type: "works_at",
  },
  {
    pattern: /\bjoined\s+([A-Z][^\s.]*(?:\s+[A-Z][^\s.]*)*)(?=\s+(?:as|in)\b|[\s.,;:!?\n]|$)/,
    type: "works_at",
  },
  { pattern: /\bworks\s+at\s+([^.\n]+?)(?:[\.\n]|$)/i, type: "works_at" },
];

// Slug-ifier matching gbrain's convention: lowercase, ascii, dashes, no leading slash.
export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Infer category prefix from context — companies are likely targets of
// founded/invested_in/works_at; people are likely targets of advises.
function inferCategory(type: EdgeType): string {
  switch (type) {
    case "founded":
    case "invested_in":
    case "works_at":
      return "companies";
    case "advises":
      return "people";
    default:
      return "entities";
  }
}

/** Extract typed edges from one page. Pure function, no I/O. */
export function extractEdges(input: ExtractInput): Edge[] {
  const { slug, pageType, content } = input;
  const cleaned = stripCodeFences(content);
  const edges = new Map<string, Edge>(); // key: `${target}::${type}` for dedup

  const add = (e: Edge) => {
    const key = `${e.target}::${e.type}`;
    if (!edges.has(key)) edges.set(key, e);
  };

  // 1. Explicit markdown links — emit `mentions` (or `attended` for meeting pages).
  for (const m of cleaned.matchAll(MD_LINK)) {
    const target = m[2].trim();
    if (target.startsWith("http")) continue;
    if (target.startsWith("/")) continue;
    if (!target.includes("/")) continue; // skip "title" anchors
    const type: EdgeType = pageType === "meeting" ? "attended" : "mentions";
    add({ source: slug, target, type, evidence: m[0] });
  }

  // 2. Bare slug refs (e.g. `people/alice`, `companies/acme`).
  for (const m of cleaned.matchAll(BARE_SLUG)) {
    const target = m[1].toLowerCase();
    const type: EdgeType = pageType === "meeting" ? "attended" : "mentions";
    add({ source: slug, target, type, evidence: m[0] });
  }

  // 3. Role inference — each pattern's capture group becomes the target.
  for (const { pattern, type } of ROLE_PATTERNS) {
    const m = cleaned.match(pattern);
    if (!m) continue;
    const raw = m[1].trim().replace(/[.,;:!?]+$/, "");
    const targetSlug = `${inferCategory(type)}/${slugify(raw)}`;
    if (targetSlug.endsWith("/")) continue; // no name → skip
    add({ source: slug, target: targetSlug, type, evidence: m[0] });
  }

  return Array.from(edges.values());
}

/**
 * Reconcile edges for a page — given the prior edge set and the new
 * extraction, return additions and removals so the persistence layer
 * can stale-delete dropped refs (per gbrain pattern).
 */
export function reconcile(prior: Edge[], next: Edge[]): { add: Edge[]; remove: Edge[] } {
  const keyOf = (e: Edge) => `${e.source}::${e.target}::${e.type}`;
  const priorKeys = new Set(prior.map(keyOf));
  const nextKeys = new Set(next.map(keyOf));
  return {
    add: next.filter((e) => !priorKeys.has(keyOf(e))),
    remove: prior.filter((e) => !nextKeys.has(keyOf(e))),
  };
}

// ── OpenClaw plugin contract ────────────────────────────────────────

export interface GraphLinksApi {
  hooks: {
    onPageWrite(slug: string, content: string, pageType?: string): Promise<Edge[]>;
  };
}

export default function register(api: any): GraphLinksApi {
  // Wire into bot's page-write lifecycle. `api.memory.onWrite` is the
  // canonical hook; if absent (older bot core), this plugin is inert.
  if (typeof api?.memory?.onWrite === "function") {
    api.memory.onWrite(async (slug: string, content: string, pageType?: string) => {
      const edges = extractEdges({ slug, content, pageType });
      if (edges.length && typeof api.memory.upsertEdges === "function") {
        await api.memory.upsertEdges(slug, edges);
      }
      return edges;
    });
  }

  return {
    hooks: {
      onPageWrite: async (slug, content, pageType) => extractEdges({ slug, content, pageType }),
    },
  };
}
