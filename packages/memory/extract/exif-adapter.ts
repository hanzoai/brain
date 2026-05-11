/** EXIF metadata adapter for images. */
import { readExif } from "../exif.js";
import type { ExtractionAdapter } from "./index.js";

export const exifAdapter: ExtractionAdapter = {
  strategy: "exif",
  async extract({ bytes, filename }) {
    const exif = readExif(bytes);
    const parts: string[] = [`# ${filename}`];
    if (exif.make || exif.model) parts.push(`Camera: ${[exif.make, exif.model].filter(Boolean).join(" ")}`);
    if (exif.software) parts.push(`Software: ${exif.software}`);
    if (exif.dateTime) parts.push(`Captured: ${exif.dateTime}`);
    if (exif.gpsLat !== undefined && exif.gpsLng !== undefined) {
      parts.push(`GPS: ${exif.gpsLat}, ${exif.gpsLng}`);
    }
    return { text: parts.join("\n"), metadata: exif as unknown as Record<string, unknown> };
  },
};
