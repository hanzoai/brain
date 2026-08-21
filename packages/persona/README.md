# @hanzo/bot-persona

The agent's **persona**, attached to the brain.

A persona is *who* an agent is — its name, its OCEAN traits, its technical
preferences, the way it talks. [`@hanzo/persona`](https://github.com/hanzoai/persona)
owns that shape: the JSON Schema and the `PERSONA.md` frontmatter convention.
This package does not restate it. It loads the profile, checks it against
**that** schema, and files it in the brain store.

Filing it in the store is the point. `brain.db` is read by every Hanzo runtime —
TS, Python, Rust, Go — so a persona written once is the same persona in all of
them. The alternative is each runtime loading its own copy of a file and
drifting, which is what the brain exists to end.

## Use

It comes with the meta-pack; you do not register it separately.

```ts
import registerBrain from "@hanzo/bot-brain";

const { persona } = await registerBrain(api, {
  persona: { path: "~/.hanzo/workspace/PERSONA.md" },  // the default
});

persona?.profile;        // the loaded profile, or null
await persona?.reload(); // re-read after an edit
```

`persona: false` disables it.

## What it writes

The profile is stored **twice**, because they answer different questions:

| as | where | answers |
|---|---|---|
| a page | `persona/<id>` | the document — for search, and for a human to read |
| facts | one row per trait | "who am I", without parsing markdown |

Nested traits become dotted predicates, so a runtime can ask for one without
knowing the document's shape:

```ts
await store.recall("persona/ada");
// → { predicate: "ocean.openness", object: "0.9", … }
// → { predicate: "tags", object: "math, engines", … }
```

An array is joined rather than exploded: a persona's `tags` is one answer, not
five rows.

## A PERSONA.md

```markdown
---
id: ada
name: Ada
ocean:
  openness: 0.9
tags: [math, engines]
---

I build things, and I check them before I say they work.
```

## Behaviour worth knowing

- **No `PERSONA.md` is normal**, not a failure — the pack returns `profile: null`
  and stays inert.
- **A half-written profile still loads.** A missing required field is *named* in
  a warning, never thrown: a persona you are still writing should not stop a
  brain from opening.
- **A body with no frontmatter is a persona written as prose**, and is kept.
- Everything is a soft contract: where the host exposes no store or no tool
  registry, the pack is inert for that surface rather than throwing.

## Tool

Registers `brain.persona` — reads the profile — so an MCP-native agent can ask
who it is.
