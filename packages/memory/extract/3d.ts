/**
 * 3D model adapter — renders multi-view images and asks a VisionBackend
 * to describe them. Render pipeline (Open3D / Blender / three.js
 * headless) is pluggable.
 */
import type { VisionBackend } from "../inference/vision.js";
import type { ExtractionAdapter } from "./index.js";

export interface View {
  /** Camera angle hint, e.g. "front", "back-left-iso". */
  pose: string;
  /** Rendered PNG/JPEG. */
  image: Uint8Array;
}

export interface MultiViewRenderer {
  render(model: Uint8Array, format: "glb" | "gltf" | "obj" | "fbx" | "stl" | "usdz"): Promise<View[]>;
}

export interface ThreeDAdapterOpts {
  renderer: MultiViewRenderer;
  vision: VisionBackend;
  visionModel: string;
}

export function makeThreeDAdapter(opts: ThreeDAdapterOpts): ExtractionAdapter {
  return {
    strategy: "3d",
    async extract({ bytes, filename }) {
      const fmt = (filename.split(".").pop() ?? "glb").toLowerCase() as
        "glb" | "gltf" | "obj" | "fbx" | "stl" | "usdz";
      const views = await opts.renderer.render(bytes, fmt);
      const descriptions = await Promise.all(views.map((v) =>
        opts.vision.describe({
          model: opts.visionModel,
          image: v.image,
          prompt: `Describe the 3D model from this ${v.pose} view in 1-2 sentences.`,
        }).then((r) => ({ pose: v.pose, text: r.description })),
      ));
      return {
        text: `# ${filename}\n\n` + descriptions.map((d) => `- (${d.pose}) ${d.text}`).join("\n"),
        metadata: { views: views.length },
        derived: views.map((v, i) => ({
          filename: `${filename}.view-${i}-${v.pose}.png`,
          mimeType: "image/png",
          bytes: v.image,
          role: "3d-view",
        })),
      };
    },
  };
}
