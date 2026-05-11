/**
 * GLiNER zero-shot NER backend.
 *
 * GLiNER (Zaratiana et al. NAACL 2024) — 0.5B BERT-based model that
 * outperforms GPT-4 on zero-shot NER at 100–200x the speed. We talk to
 * a sidecar over HTTP.
 */

export interface GlinerRequest {
  text: string;
  /** Entity types to extract. Free-form strings — GLiNER is zero-shot. */
  labels: string[];
  threshold?: number;
}

export interface GlinerEntity {
  text: string;
  label: string;
  startChar: number;
  endChar: number;
  score: number;
}

export interface GlinerBackend {
  extract(req: GlinerRequest): Promise<GlinerEntity[]>;
}

export interface GlinerHttpOpts {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class GlinerHttp implements GlinerBackend {
  private baseUrl: string;
  private fetchImpl: typeof fetch;

  constructor(opts: GlinerHttpOpts = {}) {
    this.baseUrl = opts.baseUrl ?? "http://gliner:8090";
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  }

  async extract(req: GlinerRequest): Promise<GlinerEntity[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: req.text,
        labels: req.labels,
        threshold: req.threshold ?? 0.5,
      }),
    });
    if (!res.ok) throw new Error(`gliner: ${res.status} ${res.statusText}`);
    const data = (await res.json()) as { entities: Array<{ text: string; label: string; start: number; end: number; score: number }> };
    return data.entities.map((e) => ({
      text: e.text,
      label: e.label,
      startChar: e.start,
      endChar: e.end,
      score: e.score,
    }));
  }
}
