import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { BrainIndexMetaMismatchError, SqliteStore } from "./sqlite.js";
import { l2Normalize } from "./embed.js";

describe("memory: SQLite (canonical default)", () => {
  let dir: string;
  let store: SqliteStore;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "hanzo-brain-test-"));
    store = new SqliteStore({ dbPath: join(dir, "brain.db") });
    try {
      await store.init();
    } catch (e: any) {
      // CI runners without bun:sqlite or better-sqlite3 — skip the suite.
      if (String(e.message).includes("neither bun:sqlite nor better-sqlite3")) {
        console.warn("[memory test] SQLite driver unavailable, skipping suite");
        // Mark as skipped by short-circuiting subsequent tests.
        store = null as any;
      } else {
        throw e;
      }
    }
  });

  afterAll(async () => {
    await store?.close?.();
    await rm(dir, { recursive: true, force: true });
  });

  it("upserts and reads a page", async () => {
    if (!store) return;
    await store.upsertPage("people/alice", "Alice is the CEO of Acme.", { type: "person" });
    const got = await store.getPage("people/alice");
    expect(got?.slug).toBe("people/alice");
    expect(got?.content).toContain("Alice");
  });

  it("upserts edges and reads them back", async () => {
    if (!store) return;
    await store.upsertEdges("meetings/m1", [
      { source: "meetings/m1", target: "people/alice", type: "attended" },
      { source: "meetings/m1", target: "people/bob", type: "attended" },
    ]);
    const out = await store.edgesFor("meetings/m1", "out");
    expect(out).toHaveLength(2);
    const inAlice = await store.edgesFor("people/alice", "in");
    expect(inAlice).toHaveLength(1);
  });

  it("upserts and recalls facts", async () => {
    if (!store) return;
    await store.upsertFact({
      subject: "people/alice",
      predicate: "preference",
      object: "Always replies in under 2 hours",
    });
    const facts = await store.recall("people/alice");
    expect(facts.length).toBeGreaterThan(0);
    expect(facts[0].predicate).toBe("preference");
  });

  it("hybrid search returns FTS hits", async () => {
    if (!store) return;
    const hits = await store.hybridSearch("Acme");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].slug).toBe("people/alice");
  });
});

describe("memory: pluggability", () => {
  it("registerBackend exposes new backends to open()", async () => {
    const { open, registerBackend, listBackends } = await import("./index.js");
    // Stub backend that records init() being called.
    let initialized = false;
    registerBackend("test-stub", () => ({
      init: async () => {
        initialized = true;
      },
      upsertPage: async () => {},
      getPage: async () => null,
      upsertEdges: async () => {},
      edgesFor: async () => [],
      upsertFact: async () => {},
      recall: async () => [],
      hybridSearch: async () => [],
      close: async () => {},
    }));
    expect(listBackends()).toContain("test-stub");
    expect(listBackends()).toContain("sqlite");
    await open({ backend: "test-stub" });
    expect(initialized).toBe(true);
  });

  it("unknown backend throws with a helpful message", async () => {
    const { open } = await import("./index.js");
    await expect(open({ backend: "no-such-thing" })).rejects.toThrow(/unknown backend/);
  });
});

describe("memory: immutable brain_index_meta validation", () => {
  const canonicalMeta = {
    model_id: "google/embeddinggemma-2",
    model_revision: "914f7f89142e33e77833254d9c9b90c3cef7303b",
    dimensions: 768,
    normalization: "l2" as const,
    task_prefix: "task: search result | query: ",
  };

  it("persists brain_index_meta from embeddingModel config and rejects mismatches on reopen, insert, and query", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hanzo-brain-meta-"));
    const dbPath = join(dir, "brain.db");
    const store = new SqliteStore({ dbPath, embeddingModel: "google/embeddinggemma-2" });
    try {
      await store.init();
    } catch (e: any) {
      if (String(e.message).includes("neither bun:sqlite nor better-sqlite3")) {
        await rm(dir, { recursive: true, force: true });
        return;
      }
      throw e;
    }

    try {
      const stored = store.getIndexMeta();
      expect(stored).not.toBeNull();
      expect(stored?.model_id).toBe(canonicalMeta.model_id);
      expect(stored?.model_revision).toBe(canonicalMeta.model_revision);
      expect(stored?.dimensions).toBe(768);
      expect(stored?.normalization).toBe("l2");
      expect(stored?.task_prefix).toBe("task: search result | query: ");

      // Valid insert + query with aligned unit vector & metadata succeed.
      const unit768 = l2Normalize(Array.from({ length: 768 }, (_, i) => i + 1));
      await store.upsertPage("docs/gemma", "EmbeddingGemma 2 index test", {}, {
        indexMeta: canonicalMeta,
        embedding: unit768,
      });
      const hits = await store.hybridSearch("EmbeddingGemma", 5, {
        indexMeta: canonicalMeta,
        embedding: unit768,
      });
      expect(hits.length).toBeGreaterThan(0);

      // Mismatched metadata on insert is rejected.
      await expect(
        store.upsertPage("docs/bad-dim", "mismatch", {}, {
          indexMeta: { ...canonicalMeta, dimensions: 256 },
        }),
      ).rejects.toThrow(BrainIndexMetaMismatchError);

      await expect(
        store.upsertFact(
          { subject: "docs/gemma", predicate: "revision", object: "bad" },
          { indexMeta: { ...canonicalMeta, model_revision: "deadbeef" } },
        ),
      ).rejects.toThrow(BrainIndexMetaMismatchError);

      // Mismatched metadata or vector shape/norm on query is rejected.
      await expect(
        store.hybridSearch("EmbeddingGemma", 5, {
          indexMeta: { ...canonicalMeta, task_prefix: "query: " },
        }),
      ).rejects.toThrow(BrainIndexMetaMismatchError);

      await expect(
        store.hybridSearch("EmbeddingGemma", 5, {
          indexMeta: { ...canonicalMeta, normalization: "none" },
        }),
      ).rejects.toThrow(BrainIndexMetaMismatchError);

      await expect(
        store.hybridSearch("EmbeddingGemma", 5, {
          embedding: unit768.slice(0, 256),
        }),
      ).rejects.toThrow(BrainIndexMetaMismatchError);

      await expect(
        store.hybridSearch("EmbeddingGemma", 5, {
          embedding: Array.from({ length: 768 }, () => 1), // unnormalized
        }),
      ).rejects.toThrow(BrainIndexMetaMismatchError);

      // Reopening with mismatched config fails at init().
      const badReopen = new SqliteStore({
        dbPath,
        embeddingModel: "google/embeddinggemma-2",
        embeddingDimensions: 256,
      });
      await expect(badReopen.init()).rejects.toThrow(BrainIndexMetaMismatchError);

      // Reopening with identical config succeeds.
      const goodReopen = new SqliteStore({
        dbPath,
        embeddingModel: "google/embeddinggemma-2",
      });
      await goodReopen.init();
      expect(goodReopen.getIndexMeta()?.model_revision).toBe(canonicalMeta.model_revision);
      await goodReopen.close();
    } finally {
      await store.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
