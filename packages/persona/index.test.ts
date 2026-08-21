import { describe, expect, it } from "bun:test";
import { check, facts, split } from "./index";

describe("split", () => {
  it("separates frontmatter from body", () => {
    const { front, body } = split("---\nname: Ada\n---\nI build things.\n");
    expect(front.trim()).toBe("name: Ada");
    expect(body.trim()).toBe("I build things.");
  });

  // A persona written as prose is a persona, not an error.
  it("treats a body with no frontmatter as all body", () => {
    const { front, body } = split("I build things.\n");
    expect(front).toBe("");
    expect(body.trim()).toBe("I build things.");
  });

  // An unterminated block would otherwise swallow the whole document.
  it("does not eat the document when the block never closes", () => {
    const { front, body } = split("---\nname: Ada\nI build things.\n");
    expect(front).toBe("");
    expect(body).toContain("I build things.");
  });
});

describe("check", () => {
  it("names only what the schema requires and the profile lacks", () => {
    const schema = { required: ["id", "name"] };
    expect(check({ id: "ada" }, schema)).toEqual(["name"]);
    expect(check({ id: "ada", name: "Ada" }, schema)).toEqual([]);
  });

  it("is silent when the schema requires nothing", () => {
    expect(check({}, {})).toEqual([]);
  });
});

describe("facts", () => {
  const rows = facts(
    { id: "ada", ocean: { openness: 0.9 }, tags: ["math", "engines"] },
    "persona/ada",
    "PERSONA.md",
  );
  const by = (p: string) => rows.find((r) => r.predicate === p);

  it("dots a nested trait so one trait is recallable on its own", () => {
    expect(by("ocean.openness")?.object).toBe("0.9");
  });

  // A persona's tags are one answer, not five rows.
  it("joins an array rather than exploding it", () => {
    expect(by("tags")?.object).toBe("math, engines");
  });

  it("files every row under the one subject", () => {
    expect(rows.every((r) => r.subject === "persona/ada")).toBe(true);
  });
});
