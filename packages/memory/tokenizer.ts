/**
 * Token counting.
 *
 * Pure-JS BPE-style estimator. Good enough for budgeting decisions; for
 * exact token counts against a specific model, pipe through the model's
 * own tokenizer (e.g. tiktoken-rs via `@hanzo/tools-llm`).
 *
 * Heuristic:
 *   - ASCII run: ~4 chars / token
 *   - CJK char:  1 token per char
 *   - whitespace boundaries treated as token separators
 */

export function estimateTokens(text: string): number {
  let total = 0;
  let asciiRun = "";
  const flushAscii = () => {
    if (!asciiRun) return;
    const words = asciiRun.split(/\s+/).filter(Boolean);
    for (const w of words) total += Math.max(1, Math.ceil(w.length / 4));
    asciiRun = "";
  };
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (isCjk(cp) || isEmoji(cp)) {
      flushAscii();
      total += 1;
    } else {
      asciiRun += ch;
    }
  }
  flushAscii();
  return total;
}

function isCjk(cp: number): boolean {
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x3040 && cp <= 0x30ff) ||
    (cp >= 0xac00 && cp <= 0xd7af)
  );
}

function isEmoji(cp: number): boolean {
  return (cp >= 0x2600 && cp <= 0x27bf) || (cp >= 0x1f300 && cp <= 0x1faff);
}

/** Soft truncate to a token budget; returns the original text if it fits. */
export function truncateToTokens(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) return text;
  // Binary search on char length.
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (estimateTokens(text.slice(0, mid)) <= maxTokens) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo);
}
