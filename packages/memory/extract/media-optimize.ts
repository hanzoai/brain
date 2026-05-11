/**
 * Media optimizer — produces the derived streamable variants Fortémi
 * names: `faststart`, `web_compatible`, `audio_only`, `preview_720p`,
 * `web_audio`. The actual ffmpeg invocation is pluggable.
 */
import type { ExtractionAdapter, ExtractionResult } from "./index.js";

export interface MediaVariant {
  role: "faststart" | "web_compatible" | "audio_only" | "preview_720p" | "web_audio";
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface MediaOptimizer {
  optimize(bytes: Uint8Array, filename: string, mimeType?: string): Promise<MediaVariant[]>;
}

export function makeMediaOptimizeAdapter(opt: MediaOptimizer): ExtractionAdapter {
  return {
    strategy: "media-optimize",
    async extract({ bytes, filename, mimeType }): Promise<ExtractionResult> {
      const variants = await opt.optimize(bytes, filename, mimeType);
      return {
        text: `# ${filename}\n\nDerived variants:\n` + variants.map((v) => `- ${v.role}`).join("\n"),
        metadata: { variants: variants.map((v) => v.role) },
        derived: variants.map((v) => ({
          filename: v.filename,
          mimeType: v.mimeType,
          bytes: v.bytes,
          role: v.role,
        })),
      };
    },
  };
}
