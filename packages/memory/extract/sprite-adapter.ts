/**
 * Sprite-sheet adapter — wraps the brain's pure WebVTT builder with the
 * extraction registry. The actual sprite generation is platform code
 * (ffmpeg + ImageMagick); the caller supplies a SpriteBuilder.
 */
import { renderSpriteVtt } from "../sprite.js";
import type { SpriteGrid } from "../sprite.js";
import type { ExtractionAdapter, ExtractionResult } from "./index.js";

export interface SpriteBuilder {
  build(video: Uint8Array, filename: string): Promise<{
    sprite: Uint8Array;
    grid: SpriteGrid;
  }>;
}

export function makeSpriteAdapter(builder: SpriteBuilder): ExtractionAdapter {
  return {
    strategy: "sprite",
    async extract({ bytes, filename }): Promise<ExtractionResult> {
      const built = await builder.build(bytes, filename);
      const vtt = renderSpriteVtt(built.grid);
      return {
        text: `# ${filename}\n\nSprite sheet generated (${built.grid.cols}×${built.grid.rows}).`,
        derived: [
          { filename: `${filename}.sprite.jpg`, mimeType: "image/jpeg", bytes: built.sprite, role: "sprite-sheet" },
          { filename: `${filename}.sprite.vtt`, mimeType: "text/vtt", bytes: new TextEncoder().encode(vtt), role: "sprite-vtt" },
        ],
      };
    },
  };
}
