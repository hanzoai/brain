/**
 * HTTP Range header parsing.
 *
 *   Range: bytes=<start>-<end>            (closed range)
 *   Range: bytes=<start>-                  (open-ended tail)
 *   Range: bytes=-<suffix-length>          (suffix)
 */

export interface RangeRequest {
  start: number;
  end: number; // inclusive
}

export function parseRange(header: string, totalSize: number): RangeRequest | "unsatisfiable" | null {
  if (!header || !header.startsWith("bytes=")) return null;
  const spec = header.slice(6).split(",")[0]?.trim() ?? "";
  if (!spec) return null;
  if (spec.startsWith("-")) {
    const suffix = Number(spec.slice(1));
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    const start = Math.max(0, totalSize - suffix);
    return { start, end: totalSize - 1 };
  }
  const [s, e] = spec.split("-");
  const start = Number(s);
  const end = e === "" || e === undefined ? totalSize - 1 : Number(e);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= totalSize) return "unsatisfiable";
  return { start, end: Math.min(end, totalSize - 1) };
}

export function contentRange(range: RangeRequest, totalSize: number): string {
  return `bytes ${range.start}-${range.end}/${totalSize}`;
}
