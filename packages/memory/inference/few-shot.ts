/**
 * Few-shot prompt construction.
 *
 * Builds an in-context learning prompt from curated examples. Research
 * (Dong et al. 2023) finds 3-5 examples optimal across most tasks.
 *
 * Examples are selected by similarity to the query: caller supplies a
 * `score` function (typically cosine over precomputed example
 * embeddings). The builder ranks, dedupes, caps, and renders.
 */

export interface FewShotExample {
  input: string;
  output: string;
  /** Optional explanation that goes between input and output. */
  reasoning?: string;
}

export interface FewShotOpts {
  /** Max examples to include. Capped at 5 by default. */
  maxExamples?: number;
  /** Optional similarity score for ranking. Higher = more similar. */
  score?: (ex: FewShotExample) => number;
  /** Optional task framing prefix. */
  instruction?: string;
  /** Optional input prefix label. */
  inputLabel?: string;
  /** Optional output prefix label. */
  outputLabel?: string;
}

export function buildFewShotPrompt(
  query: string,
  examples: FewShotExample[],
  opts: FewShotOpts = {},
): string {
  const max = Math.min(opts.maxExamples ?? 5, examples.length);
  const inputLabel = opts.inputLabel ?? "Input:";
  const outputLabel = opts.outputLabel ?? "Output:";

  const scored = opts.score
    ? [...examples].map((ex) => ({ ex, s: opts.score!(ex) })).sort((a, b) => b.s - a.s).map((x) => x.ex)
    : examples;
  const top = scored.slice(0, max);

  const parts: string[] = [];
  if (opts.instruction) parts.push(opts.instruction.trim());
  for (const ex of top) {
    parts.push(`${inputLabel} ${ex.input}`);
    if (ex.reasoning) parts.push(`Reasoning: ${ex.reasoning}`);
    parts.push(`${outputLabel} ${ex.output}`);
    parts.push("");
  }
  parts.push(`${inputLabel} ${query}`);
  parts.push(outputLabel);
  return parts.join("\n");
}
