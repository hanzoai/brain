/**
 * Spreadsheet adapter.
 *
 * For CSV/TSV the brain handles parsing directly. For xlsx/xls/ods the
 * adapter expects an external decoder (caller provides via
 * `registerXlsxDecoder`). Default behavior: extract the bytes as a CSV
 * if heuristics succeed; otherwise return a stub note.
 */
import type { ExtractionAdapter } from "./index.js";

type XlsxDecoder = (bytes: Uint8Array) => Promise<Record<string, string[][]>>;

let xlsxDecoder: XlsxDecoder | undefined;

export function registerXlsxDecoder(d: XlsxDecoder): void {
  xlsxDecoder = d;
}

export const spreadsheetAdapter: ExtractionAdapter = {
  strategy: "spreadsheet",
  async extract({ bytes, filename, mimeType }) {
    if (filename.toLowerCase().endsWith(".csv") || mimeType === "text/csv") {
      const text = new TextDecoder().decode(bytes);
      const rows = parseDelimited(text, ",");
      return { text: toMarkdownTable(rows), metadata: { rowCount: rows.length } };
    }
    if (filename.toLowerCase().endsWith(".tsv") || mimeType === "text/tab-separated-values") {
      const text = new TextDecoder().decode(bytes);
      const rows = parseDelimited(text, "\t");
      return { text: toMarkdownTable(rows), metadata: { rowCount: rows.length } };
    }
    if (xlsxDecoder) {
      const sheets = await xlsxDecoder(bytes);
      const parts: string[] = [];
      for (const [name, rows] of Object.entries(sheets)) {
        parts.push(`## ${name}\n\n${toMarkdownTable(rows)}`);
      }
      return { text: parts.join("\n\n") };
    }
    return {
      text: `(spreadsheet: ${filename}; install an xlsx decoder via registerXlsxDecoder)`,
    };
  },
};

function parseDelimited(text: string, sep: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c === "\r") {
      if (text[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; }
    } else cell += c;
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

function toMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) return "";
  const cols = Math.max(...rows.map((r) => r.length));
  const norm = rows.map((r) => [...r, ...Array(cols - r.length).fill("")]);
  const header = norm[0].map((c) => c.replace(/\|/g, "\\|")).join(" | ");
  const sep = norm[0].map(() => "---").join(" | ");
  const body = norm.slice(1).map((r) => r.map((c) => c.replace(/\|/g, "\\|")).join(" | ")).join("\n");
  return `| ${header} |\n| ${sep} |\n${body ? "| " + body + " |" : ""}`;
}
