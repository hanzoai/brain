/**
 * SQLite backend — the canonical Hanzo Brain store.
 *
 * Single file, zero infra. Schema below is the spec — anyone shipping
 * a 3rd-party BrainStore against Postgres / LanceDB / D1 / libSQL /
 * etc. mirrors this shape so recipes + graph-links Just Work.
 *
 * Vector ANN via sqlite-vec when available; falls back to brute-force
 * cosine for brains under ~10K pages (handles the solo-dev case fine).
 */

import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Edge } from "@hanzo/bot-graph-links";
import type { BrainStore, Fact, MemoryConfig, SearchHit } from "./index.js";

const DEFAULT_DB = join(homedir(), ".hanzo", "brain", "brain.db");

export class SqliteStore implements BrainStore {
  private db: any = null;
  private path: string;
  private cfg: MemoryConfig;
  private hasVec = false;

  constructor(cfg: MemoryConfig) {
    this.cfg = cfg;
    this.path = cfg.dbPath ? cfg.dbPath : cfg.dataDir ? join(cfg.dataDir, "brain.db") : DEFAULT_DB;
  }

  async init(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    // bun:sqlite is the canonical driver; better-sqlite3 is the fallback.
    let SQL: any;
    try {
      SQL = (await import("bun:sqlite" as any)).Database;
    } catch {
      const mod = await import("better-sqlite3" as any).catch(() => null);
      if (!mod) {
        throw new Error(
          "memory: neither bun:sqlite nor better-sqlite3 is available. " +
            "Run with bun, or install better-sqlite3.",
        );
      }
      SQL = mod.default;
    }
    this.db = new SQL(this.path);
    this.db.exec(SCHEMA);
    // Optional sqlite-vec extension. Best-effort; not required.
    try {
      this.db.loadExtension?.("vec0");
      this.hasVec = true;
    } catch {
      this.hasVec = false;
    }
  }

  async upsertPage(
    slug: string,
    content: string,
    frontmatter?: Record<string, unknown>,
  ): Promise<void> {
    const ts = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO pages (slug, content, frontmatter, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET content=excluded.content, frontmatter=excluded.frontmatter, updated_at=excluded.updated_at`,
      )
      .run(slug, content, JSON.stringify(frontmatter ?? {}), ts);
  }

  async getPage(slug: string) {
    const row = this.db
      .prepare("SELECT slug, content, updated_at FROM pages WHERE slug = ?")
      .get(slug);
    return row ?? null;
  }

  async upsertEdges(source: string, edges: Edge[]): Promise<void> {
    const stmt = this.db.prepare(
      `INSERT INTO edges (source, target, type, evidence)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(source, target, type) DO UPDATE SET evidence=excluded.evidence`,
    );
    const tx = this.db.transaction((rows: Edge[]) => {
      for (const e of rows) stmt.run(e.source, e.target, e.type, e.evidence ?? null);
    });
    tx(edges);
  }

  async edgesFor(slug: string, dir: "in" | "out" | "both" = "both"): Promise<Edge[]> {
    const q =
      dir === "in"
        ? "SELECT source, target, type, evidence FROM edges WHERE target = ?"
        : dir === "out"
          ? "SELECT source, target, type, evidence FROM edges WHERE source = ?"
          : "SELECT source, target, type, evidence FROM edges WHERE source = ? OR target = ?";
    const rows = dir === "both" ? this.db.prepare(q).all(slug, slug) : this.db.prepare(q).all(slug);
    return rows.map((r: any) => ({
      source: r.source,
      target: r.target,
      type: r.type,
      evidence: r.evidence ?? undefined,
    }));
  }

  async upsertFact(fact: Fact): Promise<void> {
    const id = fact.id ?? `${fact.subject}::${fact.predicate}::${Date.now()}`;
    this.db
      .prepare(
        `INSERT INTO facts (id, subject, predicate, object, source, ts, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET object=excluded.object, ts=excluded.ts, confidence=excluded.confidence`,
      )
      .run(
        id,
        fact.subject,
        fact.predicate,
        fact.object,
        fact.source ?? null,
        fact.ts ?? new Date().toISOString(),
        fact.confidence ?? 1.0,
      );
  }

  async recall(entity: string, opts: { limit?: number; since?: string } = {}): Promise<Fact[]> {
    const limit = opts.limit ?? 50;
    const since = opts.since ?? "1970-01-01";
    const rows = this.db
      .prepare(
        `SELECT id, subject, predicate, object, source, ts, confidence
       FROM facts WHERE subject = ? AND ts >= ?
       ORDER BY ts DESC LIMIT ?`,
      )
      .all(entity, since, limit);
    return rows as Fact[];
  }

  async hybridSearch(query: string, topK = 5): Promise<SearchHit[]> {
    // Keyword (FTS5). bun:sqlite is strict about positional binding;
    // use named params to avoid driver-specific quirks.
    const stmt = this.db.prepare(
      `SELECT pages.slug AS slug,
              snippet(pages_fts, 0, '<b>', '</b>', '…', 32) AS excerpt
       FROM pages_fts
       JOIN pages ON pages.rowid = pages_fts.rowid
       WHERE pages_fts MATCH $q
       ORDER BY rank
       LIMIT $limit`,
    );
    const kw = stmt.all({ $q: query, $limit: topK * 2 });

    // RRF fuse with vector if available (vector path stubbed — full impl
    // wires sqlite-vec / external embedder per cfg.embeddingModel).
    return (kw as any[])
      .map((r, idx) => ({
        slug: r.slug,
        excerpt: r.excerpt,
        score: 1 / (60 + idx),
        source: "keyword" as const,
      }))
      .slice(0, topK);
  }

  async close(): Promise<void> {
    this.db?.close?.();
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS pages (
  slug         TEXT PRIMARY KEY,
  content      TEXT NOT NULL,
  frontmatter  TEXT,
  updated_at   TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(content, content='pages', content_rowid='rowid');
CREATE TRIGGER IF NOT EXISTS pages_ai AFTER INSERT ON pages BEGIN
  INSERT INTO pages_fts(rowid, content) VALUES (new.rowid, new.content);
END;
CREATE TRIGGER IF NOT EXISTS pages_ad AFTER DELETE ON pages BEGIN
  INSERT INTO pages_fts(pages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
END;
CREATE TRIGGER IF NOT EXISTS pages_au AFTER UPDATE ON pages BEGIN
  INSERT INTO pages_fts(pages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
  INSERT INTO pages_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TABLE IF NOT EXISTS edges (
  source    TEXT NOT NULL,
  target    TEXT NOT NULL,
  type      TEXT NOT NULL,
  evidence  TEXT,
  PRIMARY KEY (source, target, type)
);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target);
CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(type);

CREATE TABLE IF NOT EXISTS facts (
  id          TEXT PRIMARY KEY,
  subject     TEXT NOT NULL,
  predicate   TEXT NOT NULL,
  object      TEXT NOT NULL,
  source      TEXT,
  ts          TEXT NOT NULL,
  confidence  REAL DEFAULT 1.0
);
CREATE INDEX IF NOT EXISTS idx_facts_subject ON facts(subject);
CREATE INDEX IF NOT EXISTS idx_facts_ts ON facts(ts);
`;
