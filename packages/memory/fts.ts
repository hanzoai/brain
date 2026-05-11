/**
 * Full-text-search helpers — feature-flag matrix, CJK bigrams, emoji
 * trigrams, and websearch_to_tsquery semantics for backends that don't
 * have it natively (SQLite FTS5).
 */

export interface FtsFeatureFlags {
  scriptDetection: boolean;
  trigramFallback: boolean;
  bigramCjk: boolean;
  multilingualConfigs: boolean;
  websearchToTsquery: boolean;
}

const TRUE_VALUES = new Set(["1", "true", "TRUE", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "FALSE", "no", "off"]);

function envFlag(name: string, fallback: boolean): boolean {
  const v = typeof process !== "undefined" ? process.env?.[name] : undefined;
  if (!v) return fallback;
  if (TRUE_VALUES.has(v)) return true;
  if (FALSE_VALUES.has(v)) return false;
  return fallback;
}

/** Read all flags from env. Defaults match Fortémi Phase-3 (all-on). */
export function ftsFlags(): FtsFeatureFlags {
  return {
    scriptDetection: envFlag("FTS_SCRIPT_DETECTION", true),
    trigramFallback: envFlag("FTS_TRIGRAM_FALLBACK", true),
    bigramCjk: envFlag("FTS_BIGRAM_CJK", true),
    multilingualConfigs: envFlag("FTS_MULTILINGUAL_CONFIGS", true),
    websearchToTsquery: envFlag("FTS_WEBSEARCH_TO_TSQUERY", true),
  };
}

// ── Tokenizers ────────────────────────────────────────────────────────

/** Split CJK runs into 2-character grams; preserve Latin words intact. */
export function cjkBigrams(text: string): string[] {
  const out: string[] = [];
  let cjkBuf = "";
  let latinBuf = "";
  const flushCjk = () => {
    if (!cjkBuf) return;
    if (cjkBuf.length === 1) out.push(cjkBuf);
    else for (let i = 0; i < cjkBuf.length - 1; i++) out.push(cjkBuf.slice(i, i + 2));
    cjkBuf = "";
  };
  const flushLatin = () => {
    if (!latinBuf) return;
    out.push(latinBuf);
    latinBuf = "";
  };
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (isCjkCodepoint(cp)) {
      flushLatin();
      cjkBuf += ch;
    } else if (/\s/.test(ch)) {
      flushCjk();
      flushLatin();
    } else {
      flushCjk();
      latinBuf += ch;
    }
  }
  flushCjk();
  flushLatin();
  return out.filter((t) => t.length > 0);
}

/** Emit length-3 grams over emoji + symbol runs (Unicode codepoint stream). */
export function emojiTrigrams(text: string): string[] {
  const out: string[] = [];
  const chars = [...text]; // codepoint-aware
  for (let i = 0; i < chars.length; i++) {
    const cp = chars[i].codePointAt(0)!;
    if (!isSymbolish(cp)) continue;
    const a = chars[i];
    const b = chars[i + 1] ?? "";
    const c = chars[i + 2] ?? "";
    out.push(a + b + c);
  }
  return out;
}

function isCjkCodepoint(cp: number): boolean {
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x3040 && cp <= 0x30ff) ||
    (cp >= 0xac00 && cp <= 0xd7af)
  );
}

function isSymbolish(cp: number): boolean {
  return (
    (cp >= 0x2600 && cp <= 0x27bf) ||
    (cp >= 0x1f300 && cp <= 0x1faff)
  );
}

// ── websearch_to_tsquery semantics (portable to SQLite FTS5) ──────────

export interface ParsedQuery {
  /** Required terms (AND-joined). */
  required: string[];
  /** Excluded terms (NOT). */
  excluded: string[];
  /** Optional alternates (OR groups). Each group is OR'd internally. */
  optional: string[][];
  /** Phrase matches (exact ordered runs). */
  phrases: string[];
}

/**
 * Parse a query into the same intent matrix Postgres's
 * `websearch_to_tsquery` produces. Backends that don't have it can map
 * this shape directly to their native query DSL.
 *
 * Supported: AND (default whitespace), `OR` (case-sensitive keyword),
 * `-term` (exclude), `"exact phrase"`.
 */
export function parseWebSearch(query: string): ParsedQuery {
  const required: string[] = [];
  const excluded: string[] = [];
  const optional: string[][] = [];
  const phrases: string[] = [];

  const tokens = tokenizeWithPhrases(query);
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.kind === "phrase") {
      phrases.push(t.value);
      required.push(t.value);
      i++;
      continue;
    }
    const next = tokens[i + 1];
    if (next?.kind === "word" && next.value === "OR") {
      const group: string[] = [t.value];
      let j = i + 1;
      while (
        tokens[j]?.kind === "word" && tokens[j].value === "OR" && tokens[j + 1]
      ) {
        group.push(tokens[j + 1].value);
        j += 2;
      }
      optional.push(group);
      i = j;
      continue;
    }
    if (t.value.startsWith("-") && t.value.length > 1) {
      excluded.push(t.value.slice(1));
      i++;
      continue;
    }
    required.push(t.value);
    i++;
  }

  return { required, excluded, optional, phrases };
}

function tokenizeWithPhrases(q: string): Array<{ kind: "word" | "phrase"; value: string }> {
  const out: Array<{ kind: "word" | "phrase"; value: string }> = [];
  const re = /"([^"]+)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q)) !== null) {
    if (m[1] !== undefined) out.push({ kind: "phrase", value: m[1] });
    else out.push({ kind: "word", value: m[2] });
  }
  return out;
}

/** Render a ParsedQuery as SQLite FTS5 MATCH expression. */
export function toFts5Match(p: ParsedQuery): string {
  const parts: string[] = [];
  for (const r of p.required) parts.push(quoteFts5(r));
  for (const group of p.optional) {
    const alts = group.map(quoteFts5).join(" OR ");
    parts.push(`(${alts})`);
  }
  let q = parts.join(" AND ");
  for (const e of p.excluded) q += ` NOT ${quoteFts5(e)}`;
  return q.trim();
}

function quoteFts5(term: string): string {
  if (term.includes(" ")) return `"${term.replace(/"/g, '""')}"`;
  if (/^[\wÀ-￿]+$/.test(term)) return term;
  return `"${term.replace(/"/g, '""')}"`;
}
