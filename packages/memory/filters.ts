/**
 * Composable strict filters — tags, temporal, collections.
 *
 * Mirrors Fortémi's StrictFilter: each dimension is independent, and
 * combining them yields one SQL predicate per call.
 */
import type { TemporalRange } from "./temporal.js";
import { rangeBounds } from "./temporal.js";

export interface TagFilter {
  /** Notes must include ALL of these tag slugs. */
  all?: string[];
  /** Notes must include AT LEAST ONE of these. */
  any?: string[];
  /** Notes must include NONE of these. */
  none?: string[];
}

export interface CollectionFilter {
  /** Slug of the collection (folder). */
  slug: string;
  /** Include descendants of the collection (default true). */
  recursive?: boolean;
}

export interface StrictFilter {
  tags?: TagFilter;
  temporal?: TemporalRange;
  collection?: CollectionFilter;
  /** Optional security/embedding-scope tags. */
  scope?: string[];
}

export interface SqlPredicate {
  /** Parameterized WHERE clause (no leading WHERE). */
  sql: string;
  params: unknown[];
}

/**
 * Compile a strict filter into a parameterized SQL predicate. The output
 * is portable across SQLite (uses `?`) and Postgres (caller can swap to
 * `$1..$n` by counting params). We default to `?` placeholders since
 * SQLite is the canonical default.
 */
export function compileFilter(f: StrictFilter, placeholder: "?" | "$" = "?"): SqlPredicate {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const p = () => (placeholder === "?" ? "?" : `$${params.length}`);

  if (f.tags?.all && f.tags.all.length > 0) {
    for (const t of f.tags.all) {
      params.push(t);
      clauses.push(`EXISTS (SELECT 1 FROM page_tags pt WHERE pt.page = pages.slug AND pt.tag = ${p()})`);
    }
  }
  if (f.tags?.any && f.tags.any.length > 0) {
    const placeholders: string[] = [];
    for (const t of f.tags.any) { params.push(t); placeholders.push(p()); }
    clauses.push(`EXISTS (SELECT 1 FROM page_tags pt WHERE pt.page = pages.slug AND pt.tag IN (${placeholders.join(", ")}))`);
  }
  if (f.tags?.none && f.tags.none.length > 0) {
    const placeholders: string[] = [];
    for (const t of f.tags.none) { params.push(t); placeholders.push(p()); }
    clauses.push(`NOT EXISTS (SELECT 1 FROM page_tags pt WHERE pt.page = pages.slug AND pt.tag IN (${placeholders.join(", ")}))`);
  }
  if (f.temporal) {
    const b = rangeBounds(f.temporal);
    params.push(b.floor);
    const floorP = p();
    params.push(b.ceiling);
    const ceilP = p();
    clauses.push(`(pages.id >= ${floorP} AND pages.id < ${ceilP})`);
  }
  if (f.collection) {
    const recursive = f.collection.recursive ?? true;
    params.push(f.collection.slug);
    if (recursive) {
      clauses.push(`pages.collection_path LIKE (${p()} || '%')`);
    } else {
      clauses.push(`pages.collection = ${p()}`);
    }
  }
  if (f.scope && f.scope.length > 0) {
    const placeholders: string[] = [];
    for (const s of f.scope) { params.push(s); placeholders.push(p()); }
    clauses.push(`pages.scope IN (${placeholders.join(", ")})`);
  }

  return { sql: clauses.length > 0 ? clauses.join(" AND ") : "1=1", params };
}
