/**
 * PDF text adapter. Pure-JS extraction is incomplete by design (PDF
 * needs CMaps + fonts); the brain ships an HTTP client to a sidecar.
 *
 * Concrete impl: any service that accepts a `multipart/form-data` upload
 * with `file` and returns `{ text, pages }`.
 */
import type { ExtractionAdapter, ExtractionResult } from "./index.js";

export interface PdfSidecarOpts {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class PdfSidecar {
  private baseUrl: string;
  private fetchImpl: typeof fetch;

  constructor(opts: PdfSidecarOpts = {}) {
    this.baseUrl = opts.baseUrl ?? "http://pdf:8002";
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  }

  async extract(bytes: Uint8Array, filename: string): Promise<ExtractionResult> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)]), filename);
    const res = await this.fetchImpl(`${this.baseUrl}/extract`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`pdf-sidecar: ${res.status}`);
    const data = (await res.json()) as { text: string; pages?: number };
    return { text: data.text, metadata: { pages: data.pages } };
  }
}

export function makePdfAdapter(sidecar: PdfSidecar): ExtractionAdapter {
  return {
    strategy: "pdf",
    extract: ({ bytes, filename }) => sidecar.extract(bytes, filename),
  };
}
