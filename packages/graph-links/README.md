# @hanzo/bot-graph-links

> Zero-LLM typed-link extractor. Self-wiring knowledge graph for the Hanzo Brain.

Walks markdown content on every page write. Emits typed edges (`attended/works_at/invested_in/founded/advises/mentions`) via regex + role inference. No LLM calls, no embeddings, no I/O on the hot path. Suitable for >10K pages/sec throughput.

## Why zero-LLM

- **Cost** — extraction runs on every write. LLM-per-write is unaffordable past a few hundred pages a day.
- **Latency** — regex returns in microseconds. The graph is fresh before the user can navigate to a backlink.
- **Determinism** — same input → same edges → same search ranking. Reproducible without nondeterminism in the loop.
- **Privacy** — runs entirely local. No content leaves the device.

## Edge types

| Type          | Trigger patterns                                                     |
| ------------- | -------------------------------------------------------------------- |
| `mentions`    | Any markdown link `[…](slug)` or bare slug ref `people/alice`        |
| `attended`    | Same as mentions, but emitted when `pageType: "meeting"`             |
| `founded`     | `founded X`, `co-founded X`, `founder of X`                          |
| `invested_in` | `invested in X`, `led X's seed/series/round`, `wrote a check into X` |
| `advises`     | `advises X`, `advisor to/at/for X`                                   |
| `works_at`    | `CEO/CTO/COO/CFO/VP/head of/director of X`, `joined X`, `works at X` |

Code fences (` ``` … ``` `) are stripped before extraction, so slugs inside code blocks don't pollute the graph.

## Usage

```ts
import { extractEdges } from "@hanzo/bot-graph-links";

const edges = extractEdges({
  slug: "people/alice",
  pageType: "person", // optional; "meeting" → emits `attended`
  content: "Alice is the CEO of Acme. She founded Beta Co. She invested in Foobar.",
});

// edges:
// [
//   { source: 'people/alice', target: 'companies/acme',    type: 'works_at',    evidence: 'CEO of Acme.' },
//   { source: 'people/alice', target: 'companies/beta-co', type: 'founded',     evidence: 'founded Beta Co.' },
//   { source: 'people/alice', target: 'companies/foobar',  type: 'invested_in', evidence: 'invested in Foobar.' },
// ]
```

`reconcile(prior, next)` returns `{ add, remove }` so the persistence layer can stale-delete dropped refs when a page is edited.

## Plugin contract

Registers an `onPageWrite` hook into the bot's memory plane. When `api.memory.upsertEdges` exists (it does in the canonical `@hanzo/bot-memory`), edges are persisted automatically:

```ts
import registerGraph from "@hanzo/bot-graph-links";
registerGraph(api);
// → page writes now auto-emit typed edges, no further wiring needed
```

## Tests

```bash
cd ~/work/hanzo/bot && bun test extensions/graph-links
```

12 unit tests cover: slugify, markdown links, meeting-page → `attended`, FOUNDED, INVESTED_IN (`invested in`, `led X's seed`), ADVISES (`advisor to`), WORKS_AT (`CEO of`, `joined Y`), code-fence stripping, dedup, bare slug refs, reconcile add/remove.
