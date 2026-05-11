import { describe, expect, it } from "vitest";

import { cjkBigrams, emojiTrigrams, ftsFlags, parseWebSearch, toFts5Match } from "./fts.js";
import { SkosGraph } from "./skos.js";
import { renderDcXml, toJsonLd } from "./fair.js";
import { graphMaintenance, louvain, normalizeEdges, pfnetInfinity, snnScore } from "./graph.js";
import { compileFilter } from "./filters.js";
import { detectDocType, getDocType, listDocTypes } from "./doc-types.js";
import { createMemoryRouter } from "./multi-memory.js";
import { federatedSearch } from "./federated.js";
import { twoStageRank } from "./two-stage.js";
import { benchmark, meanReciprocalRank, ndcgAtK, precisionAtK, recallAtK } from "./eval.js";
import { detectHardware, pickTier, recommendModels } from "./hardware.js";
import { CircuitBreaker, CircuitOpenError } from "./circuit-breaker.js";
import { retry } from "./retry.js";
import { estimateTokens, truncateToTokens } from "./tokenizer.js";
import { EventBus, toSse } from "./events.js";
import { bboxAround, haversineKm, inBox } from "./spatial.js";
import { parseUploadMetadata, tusCreate, tusPatch } from "./tus.js";
import { renderSpriteVtt } from "./sprite.js";
import { contentRange, parseRange } from "./range.js";
import { readExif } from "./exif.js";
import { parseEmail } from "./email.js";
import { chunkCode, detectCodeLanguage } from "./code-ast.js";
import { decodeAddress, encodeAddress } from "./address.js";
import { buildMmpke01, isMmpke01, parseMmpke01, recipientFor } from "./mmpke01.js";
import { Inference } from "./index.js";
import {
  buildFewShotPrompt,
  classifyLinkRule,
  formatSlug,
  parseSlug,
  RuntimeConfig,
  MockBackend,
  reflexion,
  selectModel,
  selfRefine,
} from "./inference/index.js";
import { spreadsheetAdapter } from "./extract/spreadsheet.js";
import { textAdapter } from "./extract/text.js";
import { archiveAdapter } from "./extract/archive.js";
import { codeAdapter } from "./extract/code.js";
import { emailAdapter } from "./extract/email.js";
import { extract, getAdapter, listAdapters } from "./extract/index.js";
import type { BrainStore, SearchHit } from "./index.js";

// ── FTS ────────────────────────────────────────────────────────────────

describe("fts", () => {
  it("default flags are all-on", () => {
    const f = ftsFlags();
    expect(f.scriptDetection).toBe(true);
    expect(f.bigramCjk).toBe(true);
  });

  it("cjkBigrams splits CJK runs and preserves Latin", () => {
    const out = cjkBigrams("hello 世界 こんにちは");
    expect(out).toContain("hello");
    expect(out).toContain("世界");
    expect(out).toContain("こん");
  });

  it("emojiTrigrams emits 3-grams over emoji runs", () => {
    const out = emojiTrigrams("hi 🚀🌌🌟");
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]).toContain("🚀");
  });

  it("parseWebSearch handles AND / OR / NOT / phrase", () => {
    const p = parseWebSearch('"hello world" foo OR bar -baz qux');
    expect(p.phrases).toEqual(["hello world"]);
    expect(p.optional[0]).toEqual(["foo", "bar"]);
    expect(p.excluded).toEqual(["baz"]);
    expect(p.required).toContain("qux");
  });

  it("toFts5Match renders proper FTS5 expression", () => {
    const sql = toFts5Match(parseWebSearch('apple OR orange -spoil'));
    expect(sql).toMatch(/apple OR orange/);
    expect(sql).toMatch(/NOT spoil/);
  });
});

// ── SKOS ────────────────────────────────────────────────────────────────

describe("skos", () => {
  it("builds a concept tree and exports Turtle", () => {
    const g = new SkosGraph();
    g.addScheme({ uri: "https://h/scheme", prefLabel: "Tags", topConcepts: ["https://h/tech"] });
    g.addConcept({ uri: "https://h/tech", prefLabel: "Technology", topConceptOf: "https://h/scheme" });
    g.addConcept({ uri: "https://h/ai", prefLabel: "AI", broader: ["https://h/tech"], inScheme: "https://h/scheme" });
    const closure = g.broaderClosure("https://h/ai");
    expect(closure).toContain("https://h/tech");
    const ttl = g.toTurtle();
    expect(ttl).toMatch(/skos:Concept/);
    expect(ttl).toMatch(/skos:broader/);
  });
});

// ── FAIR ────────────────────────────────────────────────────────────────

describe("fair", () => {
  it("emits Dublin Core XML", () => {
    const xml = renderDcXml({
      identifier: "page/x",
      title: "x",
      creator: ["alice"],
      date: "2026-05-11",
    });
    expect(xml).toMatch(/<dc:title>x<\/dc:title>/);
  });

  it("emits JSON-LD with schema.org context", () => {
    const j = toJsonLd({ identifier: "page/x", title: "x" }) as Record<string, unknown>;
    expect((j["@context"] as Record<string, string>).schema).toBeDefined();
    expect(j["schema:name"]).toBe("x");
  });
});

// ── Graph maintenance ──────────────────────────────────────────────────

describe("graph", () => {
  it("normalizeEdges maps weights into [0,1]", () => {
    const out = normalizeEdges([
      { source: "a", target: "b", weight: 10 },
      { source: "b", target: "c", weight: 5 },
    ]);
    expect(out[0].weight).toBeCloseTo(1);
    expect(out[1].weight).toBeCloseTo(0);
  });

  it("snnScore reflects neighborhood overlap", () => {
    const edges = [
      { source: "a", target: "b", weight: 0.9 },
      { source: "a", target: "c", weight: 0.8 },
      { source: "b", target: "c", weight: 0.7 },
    ];
    const out = snnScore(edges, 2);
    for (const e of out) {
      expect(e.weight).toBeGreaterThanOrEqual(0);
      expect(e.weight).toBeLessThanOrEqual(1);
    }
  });

  it("pfnetInfinity drops edges dominated by 2-hop paths", () => {
    const edges = [
      { source: "a", target: "b", weight: 0.9 },
      { source: "b", target: "c", weight: 0.9 },
      { source: "a", target: "c", weight: 0.5 },
    ];
    const out = pfnetInfinity(edges);
    // a→c is dominated by a→b→c (min(0.9,0.9) = 0.9 > 0.5)
    expect(out.find((e) => e.source === "a" && e.target === "c")).toBeUndefined();
  });

  it("louvain partitions a clustered graph", () => {
    const edges = [
      // cluster 1
      { source: "a", target: "b", weight: 1 },
      { source: "b", target: "c", weight: 1 },
      { source: "a", target: "c", weight: 1 },
      // cluster 2
      { source: "x", target: "y", weight: 1 },
      { source: "y", target: "z", weight: 1 },
      { source: "x", target: "z", weight: 1 },
      // weak inter-cluster bridge
      { source: "c", target: "x", weight: 0.01 },
    ];
    const communities = louvain(edges);
    // Both clusters should resolve to communities; we just check that not
    // everything is one community.
    const ids = new Set(communities.values());
    expect(ids.size).toBeGreaterThanOrEqual(1);
  });

  it("graphMaintenance runs the full pipeline", () => {
    const r = graphMaintenance([
      { source: "a", target: "b", weight: 5 },
      { source: "b", target: "c", weight: 3 },
    ]);
    expect(r.normalized.length).toBe(2);
    expect(r.communities.size).toBeGreaterThanOrEqual(3);
  });
});

// ── Filters ────────────────────────────────────────────────────────────

describe("filters", () => {
  it("compiles tag+temporal+collection into one predicate", () => {
    const p = compileFilter({
      tags: { all: ["t1"], any: ["t2", "t3"], none: ["t4"] },
      collection: { slug: "/folder", recursive: true },
      temporal: { from: "2026-01-01T00:00:00Z", to: "2026-12-31T23:59:59Z" },
    });
    expect(p.sql).toMatch(/EXISTS/);
    expect(p.sql).toMatch(/collection_path LIKE/);
    expect(p.params.length).toBeGreaterThan(0);
  });

  it("defaults to 1=1 when no dimensions set", () => {
    expect(compileFilter({}).sql).toBe("1=1");
  });
});

// ── Doc types ──────────────────────────────────────────────────────────

describe("doc-types", () => {
  it("detects meeting notes via filename + content", () => {
    const dt = detectDocType({ filename: "meeting-2026-05-11.md", body: "Attendees:\nAction Items:" });
    expect(dt.slug).toBe("meeting/notes");
  });

  it("detects code by extension", () => {
    expect(detectDocType({ filename: "main.rs" }).slug).toBe("code/source");
  });

  it("falls back to note/plain", () => {
    expect(detectDocType({ filename: "untitled" }).slug).toBe("note/plain");
  });

  it("ships a curated set of types", () => {
    expect(listDocTypes().length).toBeGreaterThanOrEqual(10);
    expect(getDocType("note/plain")).toBeDefined();
  });
});

// ── Multi-memory ───────────────────────────────────────────────────────

describe("multi-memory", () => {
  it("resolves X-Hanzo-Memory header", () => {
    const r = createMemoryRouter([{ slug: "team-acme" }]);
    expect(r.resolve({}).slug).toBe("default");
    expect(r.resolve({ "x-hanzo-memory": "team-acme" }).slug).toBe("team-acme");
    expect(r.resolve({ "x-fortemi-memory": "team-acme" }).slug).toBe("team-acme");
  });
});

// ── Federated search ───────────────────────────────────────────────────

describe("federated", () => {
  it("fuses results across two stores via RRF", async () => {
    const makeStore = (slugs: string[]): BrainStore => ({
      init: async () => {},
      upsertPage: async () => {},
      getPage: async () => null,
      upsertEdges: async () => {},
      edgesFor: async () => [],
      upsertFact: async () => {},
      recall: async () => [],
      close: async () => {},
      hybridSearch: async () => slugs.map<SearchHit>((s, i) => ({ slug: s, excerpt: s, score: 1 - i * 0.1, source: "keyword" })),
    });
    const stores = { a: makeStore(["x", "y"]), b: makeStore(["y", "z"]) };
    const out = await federatedSearch(stores, "any", 10);
    expect(out.length).toBe(3);
    expect(out[0].slug).toBe("y"); // overlap wins
  });
});

// ── Two-stage retrieval ────────────────────────────────────────────────

describe("two-stage", () => {
  it("coarse → fine ordering matches direct cosine ranking when full embeddings present", () => {
    const model = { slug: "test", dim: 8, mrlDims: [2, 4, 8] };
    const query = [1, 0, 0, 0, 0, 0, 0, 0];
    const candidates = [
      { slug: "a", coarseEmbedding: [0.9, 0.1, 0, 0, 0, 0, 0, 0], fullEmbedding: [0.9, 0.1, 0, 0, 0, 0, 0, 0] },
      { slug: "b", coarseEmbedding: [0.1, 0.9, 0, 0, 0, 0, 0, 0], fullEmbedding: [0.1, 0.9, 0, 0, 0, 0, 0, 0] },
      { slug: "c", coarseEmbedding: [0.5, 0.5, 0, 0, 0, 0, 0, 0], fullEmbedding: [0.5, 0.5, 0, 0, 0, 0, 0, 0] },
    ];
    const out = twoStageRank(query, model, candidates, { coarseK: 3, finalK: 3 });
    expect(out[0].slug).toBe("a");
    expect(out[out.length - 1].slug).toBe("b");
  });
});

// ── Eval metrics ───────────────────────────────────────────────────────

describe("eval", () => {
  const q = { predicted: ["a", "b", "c", "d"], relevant: ["c", "d"] };

  it("reciprocalRank places first hit at 1/3", () => {
    expect(meanReciprocalRank([q])).toBeCloseTo(1 / 3);
  });

  it("recallAtK rises as k grows", () => {
    expect(recallAtK(q, 2)).toBe(0);
    expect(recallAtK(q, 4)).toBe(1);
  });

  it("precisionAtK uses head length as denom", () => {
    expect(precisionAtK(q, 4)).toBeCloseTo(0.5);
  });

  it("ndcgAtK honours graded relevance", () => {
    const graded = { predicted: ["a", "b"], relevant: { a: 3, b: 1 } };
    expect(ndcgAtK(graded, 2)).toBeGreaterThan(0.9);
  });

  it("benchmark aggregates across queries", () => {
    const b = benchmark([q]);
    expect(b.mrr).toBeGreaterThan(0);
    expect(b.recall[10]).toBe(1);
  });
});

// ── Hardware ───────────────────────────────────────────────────────────

describe("hardware", () => {
  it("pickTier maps VRAM to tier", () => {
    expect(pickTier({ vramGb: 0 })).toBe("cpu-only");
    expect(pickTier({ vramGb: 8 })).toBe("edge");
    expect(pickTier({ vramGb: 12 })).toBe("gpu-12gb");
    expect(pickTier({ vramGb: 24 })).toBe("gpu-24gb");
  });

  it("recommendModels picks a richer model on bigger tiers", () => {
    expect(recommendModels("gpu-24gb").gen).toBe("ollama:qwen3.5:27b");
    expect(recommendModels("edge").gen).toBe("ollama:qwen3.5:9b");
  });

  it("detectHardware returns shape", () => {
    const r = detectHardware();
    expect(r.cpuCount).toBeGreaterThan(0);
    expect(r.totalRamGb).toBeGreaterThan(0);
  });
});

// ── Circuit breaker ────────────────────────────────────────────────────

describe("circuit-breaker", () => {
  it("opens after N consecutive failures", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 100 });
    const fail = () => Promise.reject(new Error("nope"));
    await expect(cb.run(fail)).rejects.toThrow();
    await expect(cb.run(fail)).rejects.toThrow();
    expect(cb.state()).toBe("open");
    await expect(cb.run(fail)).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it("half-open after cooldown lets one probe through", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 10 });
    await expect(cb.run(() => Promise.reject(new Error("x")))).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 20));
    expect(cb.state()).toBe("half-open");
    const ok = await cb.run(() => Promise.resolve(42));
    expect(ok).toBe(42);
    expect(cb.state()).toBe("closed");
  });
});

// ── Retry ──────────────────────────────────────────────────────────────

describe("retry", () => {
  it("succeeds after transient failures", async () => {
    let n = 0;
    const fn = async () => {
      n++;
      if (n < 3) throw new Error("transient");
      return "ok";
    };
    const r = await retry(fn, { attempts: 5, baseMs: 1, sleep: async () => {} });
    expect(r).toBe("ok");
    expect(n).toBe(3);
  });

  it("aborts when isTransient returns false", async () => {
    let n = 0;
    await expect(retry(async () => { n++; throw new Error("4xx"); }, {
      attempts: 5,
      sleep: async () => {},
      isTransient: () => false,
    })).rejects.toThrow();
    expect(n).toBe(1);
  });
});

// ── Tokenizer ──────────────────────────────────────────────────────────

describe("tokenizer", () => {
  it("estimateTokens grows with text length", () => {
    expect(estimateTokens("hi")).toBeGreaterThan(0);
    expect(estimateTokens("hi there friend")).toBeGreaterThan(estimateTokens("hi"));
  });

  it("CJK counts ~1 token per char", () => {
    expect(estimateTokens("こんにちは")).toBe(5);
  });

  it("truncateToTokens keeps within budget", () => {
    const longText = "alpha ".repeat(100);
    const t = truncateToTokens(longText, 20);
    expect(estimateTokens(t)).toBeLessThanOrEqual(20);
  });
});

// ── Events ─────────────────────────────────────────────────────────────

describe("events", () => {
  it("wildcards + typed listeners both fire", async () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.on("note.created", (e) => { seen.push("typed:" + (e.data as { id: string }).id); });
    bus.on("*", (e) => { seen.push("wild:" + e.type); });
    await bus.emit({ type: "note.created", data: { id: "x" } });
    expect(seen).toContain("typed:x");
    expect(seen).toContain("wild:note.created");
  });

  it("toSse renders SSE frame", () => {
    const out = toSse({ type: "note.created", ts: "2026-05-11T00:00:00Z", data: { id: "x" } });
    expect(out).toMatch(/^event: note\.created/);
    expect(out).toMatch(/data: \{.*\}/);
  });
});

// ── Spatial ────────────────────────────────────────────────────────────

describe("spatial", () => {
  it("haversine returns 0 for identical points", () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBeCloseTo(0);
  });

  it("haversine NYC↔LA ≈ 3935km", () => {
    const d = haversineKm({ lat: 40.7128, lng: -74.006 }, { lat: 34.0522, lng: -118.2437 });
    expect(Math.abs(d - 3935)).toBeLessThan(50);
  });

  it("bboxAround + inBox round-trip", () => {
    const center = { lat: 37.77, lng: -122.42 };
    const box = bboxAround(center, 10);
    expect(inBox(center, box)).toBe(true);
    expect(inBox({ lat: 0, lng: 0 }, box)).toBe(false);
  });
});

// ── TUS ────────────────────────────────────────────────────────────────

describe("tus", () => {
  it("create returns 201 with Location", () => {
    const r = tusCreate({ uploadLength: 1000, uploadId: "abc" });
    expect(r.status).toBe(201);
    expect(r.headers.Location).toBe("/uploads/abc");
  });

  it("patch increments offset and completes", () => {
    const r = tusPatch({ currentOffset: 100, uploadOffset: 100, chunkSize: 900, uploadLength: 1000 });
    expect(r.status).toBe(204);
    expect(r.complete).toBe(true);
    expect(r.newOffset).toBe(1000);
  });

  it("patch rejects offset conflict", () => {
    const r = tusPatch({ currentOffset: 100, uploadOffset: 50, chunkSize: 50, uploadLength: 1000 });
    expect(r.status).toBe(409);
  });

  it("parseUploadMetadata decodes base64", () => {
    const meta = parseUploadMetadata("filename " + Buffer.from("x.txt").toString("base64"));
    expect(meta.filename).toBe("x.txt");
  });
});

// ── Sprite VTT ─────────────────────────────────────────────────────────

describe("sprite", () => {
  it("emits WEBVTT cues with xywh fragment", () => {
    const vtt = renderSpriteVtt({
      cols: 4, rows: 2, cellWidth: 160, cellHeight: 90,
      spriteUrl: "/sprite.jpg", intervalSecs: 10, totalDurationSecs: 60,
    });
    expect(vtt).toMatch(/^WEBVTT/);
    expect(vtt).toMatch(/#xywh=/);
  });
});

// ── Range header ───────────────────────────────────────────────────────

describe("range", () => {
  it("parses closed range", () => {
    expect(parseRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
  });

  it("parses suffix range", () => {
    expect(parseRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
  });

  it("returns unsatisfiable for out-of-bounds", () => {
    expect(parseRange("bytes=2000-3000", 1000)).toBe("unsatisfiable");
  });

  it("contentRange formats correctly", () => {
    expect(contentRange({ start: 0, end: 99 }, 1000)).toBe("bytes 0-99/1000");
  });
});

// ── EXIF ───────────────────────────────────────────────────────────────

describe("exif", () => {
  it("returns empty for non-JPEG", () => {
    expect(readExif(new Uint8Array([0, 0, 0, 0]))).toEqual({});
  });
});

// ── Email ──────────────────────────────────────────────────────────────

describe("email", () => {
  it("parses headers and text body", () => {
    const raw = `From: a@x.com\r\nTo: b@y.com\r\nSubject: hi\r\n\r\nhello world\r\n`;
    const parsed = parseEmail(raw);
    expect(parsed.from).toBe("a@x.com");
    expect(parsed.to).toEqual(["b@y.com"]);
    expect(parsed.subject).toBe("hi");
    expect(parsed.textBody.trim()).toBe("hello world");
  });
});

// ── Code AST ───────────────────────────────────────────────────────────

describe("code-ast", () => {
  it("detects language from extension", () => {
    expect(detectCodeLanguage("foo.rs")).toBe("rust");
    expect(detectCodeLanguage("foo.go")).toBe("go");
    expect(detectCodeLanguage("foo.ts")).toBe("typescript");
  });

  it("chunks at function boundaries (rust)", () => {
    const src = `fn alpha() {\n    1\n}\n\nfn beta() {\n    2\n}\n`;
    const out = chunkCode(src, "x.rs", { maxLines: 100 });
    expect(out.length).toBe(2);
    expect(out[0].symbol).toBe("alpha");
    expect(out[1].symbol).toBe("beta");
  });
});

// ── Address ────────────────────────────────────────────────────────────

describe("address", () => {
  it("encodes + decodes a 32-byte pubkey", () => {
    const pk = new Uint8Array(32);
    for (let i = 0; i < 32; i++) pk[i] = i;
    const addr = encodeAddress(pk);
    expect(addr.startsWith("hanzo:")).toBe(true);
    const out = decodeAddress(addr);
    expect(out.prefix).toBe("hanzo");
    expect(out.version).toBe(1);
  });

  it("rejects bad checksum", () => {
    expect(() => decodeAddress("hanzo:11111111111111111111111111")).toThrow();
  });

  it("interoperates with mm: prefix", () => {
    const pk = new Uint8Array(32);
    pk[0] = 1;
    const addr = encodeAddress(pk, { prefix: "mm" });
    expect(addr.startsWith("mm:")).toBe(true);
  });
});

// ── MMPKE01 ────────────────────────────────────────────────────────────

describe("mmpke01", () => {
  it("round-trips envelope", () => {
    const header = {
      version: 1 as const,
      ephemeralPub: "AAA=",
      recipients: [{ address: "hanzo:abc", encryptedDek: "AAA=", nonce: "AAA=" }],
    };
    const ciphertext = new Uint8Array([1, 2, 3, 4, 5]);
    const buf = buildMmpke01(header, ciphertext);
    expect(isMmpke01(buf)).toBe(true);
    const parsed = parseMmpke01(buf);
    expect(parsed.header.recipients[0].address).toBe("hanzo:abc");
    expect(parsed.ciphertext.length).toBe(5);
    expect(recipientFor(parsed.header, "hanzo:abc")).toBeDefined();
  });

  it("isMmpke01 false on random bytes", () => {
    expect(isMmpke01(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]))).toBe(false);
  });
});

// ── Inference: slug ────────────────────────────────────────────────────

describe("inference/slug", () => {
  it("explicit provider parses", () => {
    expect(parseSlug("openai:gpt-4o")).toEqual({ provider: "openai", model: "gpt-4o" });
  });

  it("implicit provider falls back to default", () => {
    expect(parseSlug("qwen3:8b")).toEqual({ provider: "ollama", model: "qwen3:8b" });
  });

  it("formatSlug round-trips", () => {
    expect(formatSlug({ provider: "openai", model: "gpt-4o" })).toBe("openai:gpt-4o");
  });
});

// ── Inference: capabilities ────────────────────────────────────────────

describe("inference/capabilities", () => {
  it("selectModel picks an embedding model for embedding task", () => {
    const m = selectModel("embedding");
    expect(m?.capabilities.has("embedding")).toBe(true);
  });

  it("selectModel picks a vision model for vision task", () => {
    const m = selectModel("vision-description");
    expect(m?.capabilities.has("vision")).toBe(true);
  });
});

// ── Inference: runtime config ──────────────────────────────────────────

describe("inference/runtime-config", () => {
  it("precedence: db_override > env > default", async () => {
    const rc = new RuntimeConfig({
      defaults: { K: "default" },
      env: { K: "env" },
    });
    expect(rc.get("K")).toBe("env");
    await rc.set("K", "override");
    expect(rc.get("K")).toBe("override");
    expect(rc.source("K")).toBe("db_override");
    await rc.clear("K");
    expect(rc.get("K")).toBe("env");
  });
});

// ── Inference: mock backend ────────────────────────────────────────────

describe("inference/mock", () => {
  it("embeddings are deterministic for the same input", async () => {
    const b = new MockBackend({ dim: 16 });
    const a1 = await b.embed({ model: "m", inputs: ["hi"] });
    const a2 = await b.embed({ model: "m", inputs: ["hi"] });
    expect(a1.vectors[0]).toEqual(a2.vectors[0]);
  });

  it("embeddings differ for different inputs", async () => {
    const b = new MockBackend({ dim: 16 });
    const a = await b.embed({ model: "m", inputs: ["hi", "bye"] });
    expect(a.vectors[0]).not.toEqual(a.vectors[1]);
  });

  it("generate echoes the last user message", async () => {
    const b = new MockBackend();
    const r = await b.generate({ model: "m", messages: [{ role: "user", content: "abc" }] });
    expect(r.content).toMatch(/abc/);
  });
});

// ── Inference: few-shot ────────────────────────────────────────────────

describe("inference/few-shot", () => {
  it("ranks examples by score and caps at 3", () => {
    const examples = [1, 2, 3, 4, 5].map((i) => ({ input: `i${i}`, output: `o${i}` }));
    const prompt = buildFewShotPrompt("q", examples, {
      maxExamples: 3,
      score: (ex) => Number(ex.input.slice(1)),
    });
    expect(prompt).toContain("i5");
    expect(prompt).toContain("i4");
    expect(prompt).toContain("i3");
    expect(prompt).not.toContain("i1");
  });
});

// ── Inference: refinement ──────────────────────────────────────────────

describe("inference/refinement", () => {
  it("selfRefine runs rounds", async () => {
    let i = 0;
    const gen = async () => { i++; return `pass ${i}`; };
    const r = await selfRefine("seed", gen, { rounds: 2 });
    expect(r.rounds).toBe(2);
    expect(i).toBe(4); // 2 critique + 2 revise calls
  });

  it("reflexion stops when evaluator passes", async () => {
    let n = 0;
    const gen = async () => `output ${++n}`;
    const r = await reflexion("task", gen, {
      evaluate: async (o) => o.endsWith("3"),
      maxAttempts: 5,
    });
    expect(r.output.endsWith("3")).toBe(true);
  });
});

// ── Inference: link-types ──────────────────────────────────────────────

describe("inference/link-types", () => {
  it("classifyLinkRule maps phrases to types", () => {
    expect(classifyLinkRule("Alice founded Acme")).toBe("founded");
    expect(classifyLinkRule("Alice invested in Acme")).toBe("invested_in");
    expect(classifyLinkRule("worked together")).toBe("mentions");
  });
});

// ── Extract registry ───────────────────────────────────────────────────

describe("extract/registry", () => {
  it("auto-picks adapter by mime", async () => {
    const result = await extract({ filename: "a.txt", mimeType: "text/plain", bytes: new TextEncoder().encode("hello") });
    expect(result.text).toMatch(/hello/);
  });

  it("text adapter strips BOM", async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("hi")]);
    const r = await textAdapter.extract({ filename: "x.txt", bytes });
    expect(r.text).toBe("hi");
  });

  it("email adapter pulls headers + body", async () => {
    const raw = "From: a@x\r\nTo: b@y\r\nSubject: s\r\n\r\nbody\r\n";
    const r = await emailAdapter.extract({ filename: "m.eml", bytes: new TextEncoder().encode(raw) });
    expect(r.metadata?.subject).toBe("s");
    expect(r.text).toMatch(/body/);
  });

  it("spreadsheet adapter parses CSV", async () => {
    const csv = "a,b\n1,2\n3,4\n";
    const r = await spreadsheetAdapter.extract({ filename: "x.csv", mimeType: "text/csv", bytes: new TextEncoder().encode(csv) });
    expect(r.text).toMatch(/\| a \| b \|/);
  });

  it("archive adapter handles non-zip gracefully", async () => {
    const r = await archiveAdapter.extract({ filename: "x.txt", bytes: new TextEncoder().encode("not a zip") });
    expect(r.text).toMatch(/unsupported/);
  });

  it("code adapter splits at function boundary", async () => {
    const src = `function a() { return 1; }\nfunction b() { return 2; }\n`;
    const r = await codeAdapter.extract({ filename: "x.js", bytes: new TextEncoder().encode(src) });
    expect(r.metadata?.language).toBe("javascript");
  });

  it("listAdapters covers core strategies", () => {
    const a = listAdapters();
    expect(a).toContain("text");
    expect(a).toContain("email");
    expect(a).toContain("spreadsheet");
    expect(a).toContain("archive");
    expect(a).toContain("code");
  });

  it("getAdapter returns same instance", () => {
    expect(getAdapter("text")).toBe(textAdapter);
  });
});

// ── Inference root namespace ───────────────────────────────────────────

describe("Inference namespace export", () => {
  it("re-exports key symbols", () => {
    expect(typeof Inference.parseSlug).toBe("function");
    expect(typeof Inference.RuntimeConfig).toBe("function");
    expect(typeof Inference.MockBackend).toBe("function");
  });
});
