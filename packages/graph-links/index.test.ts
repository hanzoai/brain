import { describe, expect, it } from "vitest";
import { extractEdges, reconcile, slugify } from "./index.js";

describe("graph-links: slugify", () => {
  it("lowercases, dashes, ascii-only", () => {
    expect(slugify("Acme AI Inc.")).toBe("acme-ai-inc");
    expect(slugify("José's Pizza")).toBe("jose-s-pizza");
    expect(slugify("Slack & Discord")).toBe("slack-and-discord");
  });
});

describe("graph-links: extractEdges", () => {
  it("emits `mentions` for markdown links", () => {
    const edges = extractEdges({
      slug: "originals/idea-1",
      content: "Inspired by [Alice](people/alice) at Acme.",
    });
    expect(edges).toContainEqual(
      expect.objectContaining({ target: "people/alice", type: "mentions" }),
    );
  });

  it("emits `attended` instead of `mentions` for meeting pages", () => {
    const edges = extractEdges({
      slug: "meetings/2026-05-10",
      pageType: "meeting",
      content: "Met with [Bob](people/bob) and [Carol](people/carol).",
    });
    const types = new Set(edges.map((e) => e.type));
    expect(types).toContain("attended");
    expect(types).not.toContain("mentions");
  });

  it("infers FOUNDED from canonical phrasing", () => {
    const edges = extractEdges({
      slug: "people/alice",
      content: "Alice co-founded Acme AI. She also runs Beta Co.",
    });
    expect(edges).toContainEqual(
      expect.objectContaining({ type: "founded", target: "companies/acme-ai" }),
    );
  });

  it("infers INVESTED_IN from 'invested in' and 'led X's seed'", () => {
    const edges1 = extractEdges({
      slug: "people/dan",
      content: "Dan invested in Foobar.",
    });
    expect(edges1).toContainEqual(
      expect.objectContaining({ type: "invested_in", target: "companies/foobar" }),
    );

    const edges2 = extractEdges({
      slug: "people/erin",
      content: "Erin led Quux's seed round.",
    });
    expect(edges2).toContainEqual(
      expect.objectContaining({ type: "invested_in", target: "companies/quux" }),
    );
  });

  it("infers ADVISES from 'advisor to X'", () => {
    const edges = extractEdges({
      slug: "people/frank",
      content: "Frank is an advisor to Globex.",
    });
    expect(edges).toContainEqual(
      expect.objectContaining({ type: "advises", target: "people/globex" }),
    );
  });

  it("infers WORKS_AT from 'CEO of X' and 'joined Y'", () => {
    const edges1 = extractEdges({
      slug: "people/grace",
      content: "Grace is the CEO of Acme.",
    });
    expect(edges1).toContainEqual(
      expect.objectContaining({ type: "works_at", target: "companies/acme" }),
    );

    const edges2 = extractEdges({
      slug: "people/henry",
      content: "Henry joined Initech in 2024.",
    });
    expect(edges2).toContainEqual(
      expect.objectContaining({ type: "works_at", target: "companies/initech" }),
    );
  });

  it("strips code fences so slugs inside ``` are ignored", () => {
    const edges = extractEdges({
      slug: "concepts/snippet",
      content:
        "Normal: [link](people/real). Code:\n```\nfake = [should-not-match](people/fake)\n```\n",
    });
    const targets = edges.map((e) => e.target);
    expect(targets).toContain("people/real");
    expect(targets).not.toContain("people/fake");
  });

  it("deduplicates same target with same edge type", () => {
    const edges = extractEdges({
      slug: "originals/x",
      content: "[Alice](people/alice) and again [Alice](people/alice).",
    });
    const aliceMentions = edges.filter((e) => e.target === "people/alice" && e.type === "mentions");
    expect(aliceMentions).toHaveLength(1);
  });

  it("captures bare slug refs (`people/alice`) without markdown link syntax", () => {
    const edges = extractEdges({
      slug: "concepts/note",
      content: "See people/alice and companies/acme-ai.",
    });
    const targets = edges.map((e) => e.target);
    expect(targets).toContain("people/alice");
    expect(targets).toContain("companies/acme-ai");
  });
});

describe("graph-links: reconcile", () => {
  it("returns adds for new edges and removals for dropped ones", () => {
    const prior = [
      { source: "a", target: "x", type: "mentions" as const },
      { source: "a", target: "y", type: "mentions" as const },
    ];
    const next = [
      { source: "a", target: "y", type: "mentions" as const },
      { source: "a", target: "z", type: "mentions" as const },
    ];
    const { add, remove } = reconcile(prior, next);
    expect(add).toEqual([{ source: "a", target: "z", type: "mentions" }]);
    expect(remove).toEqual([{ source: "a", target: "x", type: "mentions" }]);
  });

  it("returns empty deltas when prior === next", () => {
    const same = [{ source: "a", target: "x", type: "mentions" as const }];
    const { add, remove } = reconcile(same, same);
    expect(add).toEqual([]);
    expect(remove).toEqual([]);
  });
});
