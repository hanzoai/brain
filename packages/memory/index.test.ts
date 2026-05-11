import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SqliteStore } from "./sqlite.js";

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
