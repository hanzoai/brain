/**
 * Vision backend trait.
 *
 * Any provider that can take an image and a prompt and return a textual
 * description implements `VisionBackend`. Default Ollama-compatible
 * client is provided.
 */

export interface VisionRequest {
  /** Raw image bytes (PNG/JPEG/WebP/etc.). */
  image: Uint8Array;
  /** Prompt — typically asks for a scene description. */
  prompt: string;
  /** Vision-capable model. */
  model: string;
}

export interface VisionResponse {
  description: string;
  /** Optional structured fields if the model supports them. */
  tags?: string[];
  model: string;
}

export interface VisionBackend {
  describe(req: VisionRequest): Promise<VisionResponse>;
}

// ── Ollama-compatible default ─────────────────────────────────────────

export interface OllamaVisionOpts {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class OllamaVision implements VisionBackend {
  private baseUrl: string;
  private fetchImpl: typeof fetch;

  constructor(opts: OllamaVisionOpts = {}) {
    this.baseUrl = opts.baseUrl ?? "http://localhost:11434";
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  }

  async describe(req: VisionRequest): Promise<VisionResponse> {
    const body = JSON.stringify({
      model: req.model,
      prompt: req.prompt,
      images: [toB64(req.image)],
      stream: false,
    });
    const res = await this.fetchImpl(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) throw new Error(`vision: ${res.status} ${res.statusText}`);
    const data = await res.json() as { response?: string };
    return { description: data.response ?? "", model: req.model };
  }
}

function toB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  if (typeof btoa === "function") return btoa(bin);
  return Buffer.from(bytes).toString("base64");
}
