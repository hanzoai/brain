/** Image adapter — calls a VisionBackend to get a textual description. */
import type { VisionBackend } from "../inference/vision.js";
import type { ExtractionAdapter } from "./index.js";

export interface ImageAdapterOpts {
  backend: VisionBackend;
  model: string;
  prompt?: string;
}

export function makeImageAdapter(opts: ImageAdapterOpts): ExtractionAdapter {
  return {
    strategy: "image",
    async extract({ bytes, filename }) {
      const description = await opts.backend.describe({
        image: bytes,
        model: opts.model,
        prompt: opts.prompt ?? "Describe this image in 2-4 sentences. Include any visible text.",
      });
      return {
        text: `# ${filename}\n\n${description.description}`,
        metadata: { tags: description.tags },
      };
    },
  };
}
