/**
 * Minimal EXIF parser. Reads the JPEG APP1 segment and pulls out the
 * fields useful for knowledge-base indexing: GPS, capture time, camera.
 *
 * For files that don't ship EXIF (PNG, WebP without metadata) we return
 * an empty record rather than throwing.
 */

export interface Exif {
  make?: string;
  model?: string;
  software?: string;
  dateTime?: string;
  gpsLat?: number;
  gpsLng?: number;
}

export function readExif(buf: Uint8Array): Exif {
  if (buf.length < 4) return {};
  // JPEG marker
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return {};
  let i = 2;
  while (i < buf.length - 4) {
    if (buf[i] !== 0xff) return {};
    const marker = buf[i + 1];
    const size = (buf[i + 2] << 8) | buf[i + 3];
    if (marker === 0xe1 && size > 8) {
      // APP1 — check for "Exif\0\0"
      if (
        buf[i + 4] === 0x45 && buf[i + 5] === 0x78 && buf[i + 6] === 0x69 && buf[i + 7] === 0x66
      ) {
        return parseTiff(buf.subarray(i + 10, i + 2 + size));
      }
    }
    i += 2 + size;
  }
  return {};
}

function parseTiff(tiff: Uint8Array): Exif {
  if (tiff.length < 8) return {};
  const le = tiff[0] === 0x49 && tiff[1] === 0x49;
  const u16 = (off: number) => le ? tiff[off] | (tiff[off + 1] << 8) : (tiff[off] << 8) | tiff[off + 1];
  const u32 = (off: number) =>
    le
      ? (tiff[off] | (tiff[off + 1] << 8) | (tiff[off + 2] << 16) | (tiff[off + 3] << 24)) >>> 0
      : ((tiff[off] << 24) | (tiff[off + 1] << 16) | (tiff[off + 2] << 8) | tiff[off + 3]) >>> 0;
  const ifdOffset = u32(4);
  if (ifdOffset + 2 > tiff.length) return {};
  const numEntries = u16(ifdOffset);
  const out: Exif = {};
  for (let i = 0; i < numEntries; i++) {
    const entry = ifdOffset + 2 + i * 12;
    if (entry + 12 > tiff.length) break;
    const tag = u16(entry);
    const type = u16(entry + 2);
    const count = u32(entry + 4);
    const valOff = u32(entry + 8);
    const readAscii = () => {
      if (type !== 2) return undefined;
      const start = count > 4 ? valOff : entry + 8;
      const bytes = tiff.subarray(start, start + count - 1); // drop trailing NUL
      return new TextDecoder().decode(bytes);
    };
    switch (tag) {
      case 0x010f: out.make = readAscii(); break;
      case 0x0110: out.model = readAscii(); break;
      case 0x0131: out.software = readAscii(); break;
      case 0x0132: out.dateTime = readAscii(); break;
      // GPS sub-IFD not parsed here — the brain only needs presence of the field;
      // full GPS parsing lives in the sidecar extractor.
    }
  }
  return out;
}
