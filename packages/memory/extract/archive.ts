/**
 * Archive listing — ZIP/TAR/GZ.
 *
 * Pure-JS minimal parser: emits the file manifest. Full extraction
 * lives in `hanzo-tools-fs`; the brain just needs file names + sizes
 * for indexing.
 */
import type { ExtractionAdapter } from "./index.js";

export const archiveAdapter: ExtractionAdapter = {
  strategy: "archive",
  async extract({ bytes, filename }) {
    if (isZip(bytes)) {
      const entries = listZip(bytes);
      const text = entries.map((e) => `- ${e.name} (${e.size} bytes)`).join("\n");
      return { text: `# ${filename}\n\n${text}`, metadata: { entries } };
    }
    return { text: `(archive: ${filename}; unsupported format)` };
  },
};

interface ZipEntry { name: string; size: number; offset: number; }

function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/**
 * Walk the End-of-Central-Directory record and yield central-directory
 * entries (name + size).
 */
function listZip(bytes: Uint8Array): ZipEntry[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // EOCD signature = 0x06054b50, scan from the end.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 65557; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) return [];
  const cdEntries = dv.getUint16(eocd + 10, true);
  const cdStart = dv.getUint32(eocd + 16, true);
  let p = cdStart;
  const out: ZipEntry[] = [];
  for (let i = 0; i < cdEntries && p + 46 < bytes.length; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const compressedSize = dv.getUint32(p + 20, true);
    const uncompressedSize = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localHeaderOff = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    out.push({ name, size: uncompressedSize, offset: localHeaderOff });
    p += 46 + nameLen + extraLen + commentLen;
    void compressedSize;
  }
  return out;
}
