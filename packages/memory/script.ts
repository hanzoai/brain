/**
 * Unicode script detection.
 *
 * Single O(n) pass over the input. Routes FTS strategy:
 *   - Latin       → stemming + BM25
 *   - CJK         → bigram/trigram character matching
 *   - Emoji/Sym   → trigram substring matching
 *   - RTL         → basic tokenization (Arabic / Hebrew)
 */

export type Script = "latin" | "cjk" | "emoji" | "cyrillic" | "arabic" | "hebrew" | "greek" | "devanagari" | "other";

export interface ScriptReport {
  primary: Script;
  /** Fraction of classified characters per script. */
  fractions: Record<Script, number>;
  /** Whether any CJK was seen (cheap shortcut). */
  hasCjk: boolean;
  /** Whether any emoji or pictographic was seen. */
  hasEmoji: boolean;
}

export function detectScript(text: string): ScriptReport {
  const counts: Record<Script, number> = {
    latin: 0, cjk: 0, emoji: 0, cyrillic: 0, arabic: 0, hebrew: 0, greek: 0, devanagari: 0, other: 0,
  };
  let total = 0;

  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x0030 || (cp >= 0x0030 && cp <= 0x0039)) {
      // digits — don't count toward script signal
      continue;
    }
    const s = classify(cp);
    if (s === null) continue;
    counts[s] += 1;
    total += 1;
  }

  const fractions: Record<Script, number> = {
    latin: 0, cjk: 0, emoji: 0, cyrillic: 0, arabic: 0, hebrew: 0, greek: 0, devanagari: 0, other: 0,
  };
  if (total > 0) {
    for (const k of Object.keys(counts) as Script[]) {
      fractions[k] = counts[k] / total;
    }
  }

  let primary: Script = "other";
  let max = 0;
  for (const k of Object.keys(counts) as Script[]) {
    if (counts[k] > max) {
      max = counts[k];
      primary = k;
    }
  }

  return {
    primary,
    fractions,
    hasCjk: counts.cjk > 0,
    hasEmoji: counts.emoji > 0,
  };
}

export function hasCjk(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (isCjk(cp)) return true;
  }
  return false;
}

export function hasEmoji(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (isEmoji(cp)) return true;
  }
  return false;
}

function classify(cp: number): Script | null {
  if (isCjk(cp)) return "cjk";
  if (isEmoji(cp)) return "emoji";
  if ((cp >= 0x0041 && cp <= 0x005a) || (cp >= 0x0061 && cp <= 0x007a)) return "latin";
  if (cp >= 0x00c0 && cp <= 0x024f) return "latin"; // Latin-1 supplement + extended
  if (cp >= 0x0370 && cp <= 0x03ff) return "greek";
  if (cp >= 0x0400 && cp <= 0x04ff) return "cyrillic";
  if (cp >= 0x0590 && cp <= 0x05ff) return "hebrew";
  if (cp >= 0x0600 && cp <= 0x06ff) return "arabic";
  if (cp >= 0x0900 && cp <= 0x097f) return "devanagari";
  if (cp <= 0x002f || (cp >= 0x003a && cp <= 0x0040) || (cp >= 0x005b && cp <= 0x0060) || (cp >= 0x007b && cp <= 0x007e)) {
    return null; // ASCII punctuation/whitespace — uninformative
  }
  return "other";
}

function isCjk(cp: number): boolean {
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Ext A
    (cp >= 0x20000 && cp <= 0x2a6df) || // CJK Ext B
    (cp >= 0x3040 && cp <= 0x309f) || // Hiragana
    (cp >= 0x30a0 && cp <= 0x30ff) || // Katakana
    (cp >= 0xac00 && cp <= 0xd7af) // Hangul Syllables
  );
}

function isEmoji(cp: number): boolean {
  return (
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x2600 && cp <= 0x27bf) ||
    (cp >= 0x1f000 && cp <= 0x1f0ff) ||
    cp === 0x2705 || cp === 0x2728 || cp === 0x274c || cp === 0x2049
  );
}
