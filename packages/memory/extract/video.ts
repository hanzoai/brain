/**
 * Video adapter — orchestrates keyframe extraction, scene detection,
 * per-keyframe vision description, and transcript alignment.
 *
 * The keyframe extractor itself is platform-specific (ffmpeg/opencv);
 * we keep it as a pluggable trait.
 */
import type { VisionBackend } from "../inference/vision.js";
import type { TranscriptionBackend } from "../inference/transcription.js";
import type { ExtractionAdapter } from "./index.js";

export interface Keyframe {
  index: number;
  /** Time in seconds. */
  ts: number;
  /** JPEG/PNG bytes. */
  image: Uint8Array;
}

export interface KeyframeExtractor {
  extract(video: Uint8Array): Promise<Keyframe[]>;
}

export interface VideoAdapterOpts {
  keyframes: KeyframeExtractor;
  vision: VisionBackend;
  visionModel: string;
  transcription?: TranscriptionBackend;
}

export function makeVideoAdapter(opts: VideoAdapterOpts): ExtractionAdapter {
  return {
    strategy: "video",
    async extract({ bytes, filename }) {
      const keys = await opts.keyframes.extract(bytes);
      const descriptions = await Promise.all(keys.map((k) =>
        opts.vision.describe({
          model: opts.visionModel,
          prompt: `Describe this keyframe in 1-2 sentences. Time: ${k.ts.toFixed(1)}s`,
          image: k.image,
        }).then((r) => ({ ts: k.ts, text: r.description })),
      ));
      let transcript = "";
      if (opts.transcription) {
        const t = await opts.transcription.transcribe({ audio: bytes });
        transcript = t.segments.map((s) => `[${s.startSecs.toFixed(1)}s] ${s.text}`).join("\n");
      }
      const text = [
        `# ${filename}`,
        "",
        "## Keyframes",
        ...descriptions.map((d) => `- [${d.ts.toFixed(1)}s] ${d.text}`),
        transcript ? "\n## Transcript\n" + transcript : "",
      ].join("\n");
      return { text, metadata: { keyframes: descriptions.length } };
    },
  };
}
