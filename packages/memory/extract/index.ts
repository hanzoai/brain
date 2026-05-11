/**
 * Extraction registry — strategy dispatcher.
 *
 * Each adapter takes a `(filename, mime, bytes)` triple and produces an
 * `ExtractionResult` (canonical text + structured metadata + derived
 * children attachments). Heavy adapters (vision / audio / video / 3D)
 * delegate to sidecars defined under `../inference/`.
 */

export type Strategy =
  | "text"
  | "email"
  | "spreadsheet"
  | "archive"
  | "pdf"
  | "image"
  | "audio"
  | "video"
  | "3d"
  | "media-optimize"
  | "structured"
  | "summarizer"
  | "exif"
  | "code"
  | "sprite";

export interface ExtractionInput {
  filename: string;
  mimeType?: string;
  bytes: Uint8Array;
  /** Hints from the doc-type detector. */
  strategy?: Strategy;
}

export interface ExtractionResult {
  text: string;
  metadata?: Record<string, unknown>;
  /** Derived child attachments — thumbnails, transcripts, captions. */
  derived?: Array<{
    filename: string;
    mimeType: string;
    bytes: Uint8Array;
    role: string;
  }>;
}

export interface ExtractionAdapter {
  strategy: Strategy;
  extract(input: ExtractionInput): Promise<ExtractionResult>;
}

const ADAPTERS = new Map<Strategy, ExtractionAdapter>();

export function registerAdapter(a: ExtractionAdapter): void {
  ADAPTERS.set(a.strategy, a);
}

export function getAdapter(s: Strategy): ExtractionAdapter | undefined {
  return ADAPTERS.get(s);
}

export function listAdapters(): Strategy[] {
  return Array.from(ADAPTERS.keys());
}

export async function extract(input: ExtractionInput): Promise<ExtractionResult> {
  const strat = input.strategy ?? pickStrategy(input);
  const a = ADAPTERS.get(strat);
  if (!a) {
    // Fallback to text adapter.
    const text = ADAPTERS.get("text");
    if (text) return text.extract(input);
    return { text: "" };
  }
  return a.extract(input);
}

function pickStrategy(input: ExtractionInput): Strategy {
  const mt = input.mimeType?.toLowerCase() ?? "";
  if (mt.startsWith("image/")) return "image";
  if (mt.startsWith("audio/")) return "audio";
  if (mt.startsWith("video/")) return "video";
  if (mt === "message/rfc822") return "email";
  if (mt === "application/pdf") return "pdf";
  if (mt === "application/zip" || mt === "application/x-tar" || mt === "application/gzip") return "archive";
  if (mt.includes("spreadsheet") || mt === "text/csv" || mt === "text/tab-separated-values") return "spreadsheet";
  return "text";
}

// ── Built-in adapter registrations ────────────────────────────────────
import { textAdapter } from "./text.js";
import { emailAdapter } from "./email.js";
import { spreadsheetAdapter } from "./spreadsheet.js";
import { archiveAdapter } from "./archive.js";
import { exifAdapter } from "./exif-adapter.js";
import { codeAdapter } from "./code.js";

registerAdapter(textAdapter);
registerAdapter(emailAdapter);
registerAdapter(spreadsheetAdapter);
registerAdapter(archiveAdapter);
registerAdapter(exifAdapter);
registerAdapter(codeAdapter);

// Heavy adapters that need sidecars — call site registers them once a
// VisionBackend / TranscriptionBackend / etc. is available.
export * from "./pdf.js";
export * from "./image.js";
export * from "./audio.js";
export * from "./video.js";
export * from "./3d.js";
export * from "./media-optimize.js";
export * from "./structured.js";
export * from "./summarizer.js";
export * from "./sprite-adapter.js";
