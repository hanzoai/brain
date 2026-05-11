/**
 * Code-aware chunking. Pure-JS line-level chunker that respects
 * top-level function / class boundaries for common languages. Heavy-duty
 * tree-sitter parsing lives in `hanzo-ast`; this module is the brain
 * fast path so chunks are immediately ingestible without a sidecar.
 */

export interface CodeChunk {
  language: string;
  startLine: number;
  endLine: number;
  content: string;
  /** Detected top-level symbol if any (function/class/etc.). */
  symbol?: string;
}

export interface CodeChunkOpts {
  maxLines?: number;
}

interface BoundaryRule {
  language: string;
  /** Regex matched against a single line — group 1 captures the symbol name. */
  boundary: RegExp;
  filenameMatch: RegExp;
}

const RULES: BoundaryRule[] = [
  { language: "rust",       filenameMatch: /\.rs$/i,   boundary: /^\s*(?:pub\s+)?(?:async\s+)?(?:unsafe\s+)?(?:fn|struct|enum|trait|impl|mod)\s+([A-Za-z0-9_]+)/ },
  { language: "go",         filenameMatch: /\.go$/i,   boundary: /^\s*func\s+(?:\([^)]+\)\s+)?([A-Za-z0-9_]+)/ },
  { language: "typescript", filenameMatch: /\.(ts|tsx)$/i, boundary: /^\s*(?:export\s+)?(?:async\s+)?(?:function|class|interface|enum)\s+([A-Za-z0-9_]+)/ },
  { language: "javascript", filenameMatch: /\.(js|jsx|mjs|cjs)$/i, boundary: /^\s*(?:export\s+)?(?:async\s+)?(?:function|class)\s+([A-Za-z0-9_]+)/ },
  { language: "python",     filenameMatch: /\.py$/i,   boundary: /^\s*(?:async\s+)?(?:def|class)\s+([A-Za-z0-9_]+)/ },
  { language: "java",       filenameMatch: /\.java$/i, boundary: /^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:class|interface|enum)\s+([A-Za-z0-9_]+)/ },
  { language: "ruby",       filenameMatch: /\.rb$/i,   boundary: /^\s*(?:def|class|module)\s+([A-Za-z0-9_:?!]+)/ },
];

export function detectCodeLanguage(filename: string): string | undefined {
  for (const r of RULES) if (r.filenameMatch.test(filename)) return r.language;
  return undefined;
}

export function chunkCode(source: string, filename: string, opts: CodeChunkOpts = {}): CodeChunk[] {
  const maxLines = opts.maxLines ?? 80;
  const language = detectCodeLanguage(filename) ?? "plain";
  const rule = RULES.find((r) => r.language === language);
  const lines = source.split("\n");
  if (!rule) return splitFixed(lines, language, maxLines);

  const chunks: CodeChunk[] = [];
  let curStart = 0;
  let curSymbol: string | undefined;
  const flush = (endLine: number) => {
    if (endLine - curStart < 1) return;
    chunks.push({
      language,
      startLine: curStart + 1,
      endLine,
      symbol: curSymbol,
      content: lines.slice(curStart, endLine).join("\n"),
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(rule.boundary);
    if (m && i > curStart) {
      flush(i);
      curStart = i;
      curSymbol = m[1];
    } else if (m && i === curStart) {
      curSymbol = m[1];
    }
    if (i - curStart + 1 >= maxLines) {
      flush(i + 1);
      curStart = i + 1;
      curSymbol = undefined;
    }
  }
  flush(lines.length);
  return chunks;
}

function splitFixed(lines: string[], language: string, maxLines: number): CodeChunk[] {
  const out: CodeChunk[] = [];
  for (let i = 0; i < lines.length; i += maxLines) {
    out.push({
      language,
      startLine: i + 1,
      endLine: Math.min(i + maxLines, lines.length),
      content: lines.slice(i, i + maxLines).join("\n"),
    });
  }
  return out;
}
