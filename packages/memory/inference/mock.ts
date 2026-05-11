/**
 * Deterministic mock inference backend — same shape as Ollama, no network.
 *
 * Embeddings: hash text → deterministic seed → seeded PRNG produces a
 * vector. Cosine similarity stays meaningful for tests because identical
 * inputs produce identical vectors and L2-normalization is applied.
 *
 * Generation: returns a templated string that includes the last user
 * message — tests can assert on it.
 */
import type { EmbedRequest, EmbedResponse, GenerateRequest, GenerateResponse, InferenceBackend } from "./index.js";

export interface MockOpts {
  /** Embedding dim. */
  dim?: number;
}

export class MockBackend implements InferenceBackend {
  private dim: number;

  constructor(opts: MockOpts = {}) {
    this.dim = opts.dim ?? 384;
  }

  name(): string { return "mock"; }

  async ping(): Promise<boolean> { return true; }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    const last = req.messages[req.messages.length - 1];
    const content = `[mock:${req.model}] ${last?.content ?? ""}`;
    return {
      content,
      model: req.model,
      promptTokens: req.messages.reduce((a, m) => a + m.content.length, 0) / 4,
      completionTokens: content.length / 4,
    };
  }

  async embed(req: EmbedRequest): Promise<EmbedResponse> {
    const vectors = req.inputs.map((text) => this.embedOne(text, req.task ?? "symmetric"));
    return { vectors, model: req.model };
  }

  private embedOne(text: string, task: "query" | "passage" | "symmetric"): number[] {
    const seed = hashSeed(`${task}:${text}`);
    const rng = mulberry32(seed);
    const v = new Array(this.dim);
    let sumSq = 0;
    for (let i = 0; i < this.dim; i++) {
      v[i] = rng() * 2 - 1;
      sumSq += v[i] * v[i];
    }
    const norm = Math.sqrt(sumSq);
    if (norm > 0) for (let i = 0; i < this.dim; i++) v[i] /= norm;
    return v;
  }
}

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
