import { describe, expect, it } from "vitest";

import { dedupHits } from "./dedup.js";
import { coarseDim, getEmbeddingModel, l2Normalize, mrlTruncate, prefixFor } from "./embed.js";
import { characterize, rrfFuse, rsfFuse, selectRrfK, selectWeights } from "./fusion.js";
import { cosine, mmrRerank } from "./rerank.js";
import { renderRttm, renderSrt, renderVtt } from "./captions.js";
import { detectScript, hasCjk, hasEmoji } from "./script.js";
import { namedRange, rangeBounds, v7Ceiling, v7Floor } from "./temporal.js";
import type { SearchHit } from "./index.js";

const hit = (slug: string, score: number, source: SearchHit["source"] = "keyword"): SearchHit => ({
  slug, score, source, excerpt: slug,
});

describe("fusion", () => {
  it("rrfFuse normalizes top result to ~1", () => {
    const r = rrfFuse([[hit("a", 1), hit("b", 0.5)]], 10);
    expect(r[0].slug).toBe("a");
    expect(Math.abs(r[0].score - 1)).toBeLessThan(0.01);
  });

  it("rrfFuse rewards multi-list consensus", () => {
    const both = [[hit("a", 1)], [hit("a", 1), hit("b", 0.5)]];
    const r = rrfFuse(both, 10);
    expect(r[0].slug).toBe("a");
  });

  it("rsfFuse preserves score magnitude across lists", () => {
    const r = rsfFuse([[hit("a", 100), hit("b", 50)], [hit("a", 1), hit("c", 0.5)]], 10);
    expect(r[0].slug).toBe("a");
    expect(r.length).toBe(3);
  });

  it("characterize + selectRrfK route phrase/boolean/short/long", () => {
    expect(selectRrfK(characterize('"hello world"'))).toBe(10);
    expect(selectRrfK(characterize("foo AND bar"))).toBe(15);
    expect(selectRrfK(characterize("rust"))).toBe(15);
    expect(selectRrfK(characterize("a b c d e f g h i j"))).toBe(40);
  });

  it("selectWeights leans FTS for short / semantic for long", () => {
    const sw = selectWeights(characterize("rust"));
    expect(sw.fts).toBeGreaterThan(sw.semantic);
    const lw = selectWeights(characterize("how do retrieval augmented generation systems typically work in production scale"));
    expect(lw.semantic).toBeGreaterThan(lw.fts);
  });
});

describe("rerank (MMR)", () => {
  it("cosine returns 1 for identical, 0 for orthogonal", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("MMR picks diverse second hit at low lambda", () => {
    const hits = [
      { ...hit("a", 0.9), embedding: [1, 0] },
      { ...hit("b", 0.85), embedding: [1, 0.01] }, // near-duplicate of a
      { ...hit("c", 0.6), embedding: [0, 1] }, // diverse
    ];
    const out = mmrRerank(hits, { lambda: 0.2, limit: 2 });
    expect(out[0].slug).toBe("a");
    expect(out[1].slug).toBe("c");
  });
});

describe("dedup", () => {
  it("keeps best chunk per chain", () => {
    const hits = [
      hit("page/foo#chunk-0", 0.5),
      hit("page/foo#chunk-1", 0.8),
      hit("page/bar", 0.6),
    ];
    const d = dedupHits(hits);
    expect(d.map((h) => h.slug).sort()).toEqual(["page/bar", "page/foo#chunk-1"]);
  });
});

describe("script detection", () => {
  it("classifies CJK and emoji", () => {
    expect(hasCjk("こんにちは")).toBe(true);
    expect(hasCjk("hello")).toBe(false);
    expect(hasEmoji("hello 🚀")).toBe(true);
  });

  it("reports primary script", () => {
    expect(detectScript("こんにちは世界").primary).toBe("cjk");
    expect(detectScript("Hello world").primary).toBe("latin");
    expect(detectScript("Привет").primary).toBe("cyrillic");
  });
});

describe("embedding registry + MRL", () => {
  it("knows nomic-embed-text and openai 3-small", () => {
    expect(getEmbeddingModel("ollama:nomic-embed-text")?.dim).toBe(768);
    expect(getEmbeddingModel("openai:text-embedding-3-small")?.dim).toBe(1536);
  });

  it("E5 prefix is asymmetric, nomic is symmetric", () => {
    const e5 = getEmbeddingModel("intfloat/e5-large-v2")!;
    expect(prefixFor(e5, "query", "x")).toBe("query: x");
    expect(prefixFor(e5, "passage", "x")).toBe("passage: x");
    const nomic = getEmbeddingModel("ollama:nomic-embed-text")!;
    expect(prefixFor(nomic, "query", "x")).toBe("x");
  });

  it("mrlTruncate shortens + re-normalizes", () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8];
    const t = mrlTruncate(v, 4);
    expect(t.length).toBe(4);
    const norm = Math.sqrt(t.reduce((a, b) => a + b * b, 0));
    expect(Math.abs(norm - 1)).toBeLessThan(1e-6);
  });

  it("coarseDim picks ~1/8 size", () => {
    const e3 = getEmbeddingModel("openai:text-embedding-3-large")!;
    expect(coarseDim(e3)).toBeGreaterThanOrEqual(256);
    expect(coarseDim(e3)).toBeLessThanOrEqual(512);
  });

  it("l2Normalize on zero vector is no-op", () => {
    expect(l2Normalize([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe("temporal UUIDv7 bounds", () => {
  it("v7Floor < v7Ceiling for same instant", () => {
    const t = Date.UTC(2026, 4, 11);
    expect(v7Floor(t) < v7Ceiling(t)).toBe(true);
  });

  it("rangeBounds expands to [floor, ceiling]", () => {
    const r = rangeBounds({ from: "2026-01-01T00:00:00Z", to: "2026-12-31T23:59:59Z" });
    expect(r.floor < r.ceiling).toBe(true);
  });

  it("namedRange today has a from boundary", () => {
    const t = namedRange("today");
    expect(t.from).toBeDefined();
  });
});

describe("captions rendering", () => {
  const segs = [
    { startSecs: 0, endSecs: 1.5, text: "hi", speaker: "S0" },
    { startSecs: 1.5, endSecs: 3, text: "world", speaker: "S1" },
  ];

  it("VTT has WEBVTT header", () => {
    expect(renderVtt(segs)).toMatch(/^WEBVTT/);
  });

  it("SRT has --> arrow with comma", () => {
    expect(renderSrt(segs)).toMatch(/00:00:00,000 --> 00:00:01,500/);
  });

  it("RTTM emits SPEAKER lines", () => {
    expect(renderRttm(segs).split("\n")[0].startsWith("SPEAKER")).toBe(true);
  });
});
