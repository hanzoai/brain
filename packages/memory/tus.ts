/**
 * TUS resumable-upload protocol v1.0.0 — pure parser/builder.
 *
 *   - Creation extension: client posts POST with `Upload-Length` and
 *     optional `Upload-Metadata`, server replies 201 with `Location`.
 *   - Patch: client sends `PATCH` with `Upload-Offset`, server stores
 *     and bumps offset.
 *   - Termination: `DELETE` removes the partial upload.
 *   - Checksum extension: `Upload-Checksum: <algo> <base64>`.
 *
 * This module returns the protocol decisions; storage is provided by the
 * caller (so any backend works).
 */

export interface TusCreateOpts {
  uploadLength: number;
  /** Decoded metadata key-value pairs from `Upload-Metadata`. */
  metadata?: Record<string, string>;
  /** Caller-allocated upload id (URL component). */
  uploadId: string;
}

export interface TusCreatedResponse {
  status: 201;
  headers: Record<string, string>;
}

export function tusCreate(opts: TusCreateOpts): TusCreatedResponse {
  return {
    status: 201,
    headers: {
      "Tus-Resumable": "1.0.0",
      "Location": `/uploads/${opts.uploadId}`,
      "Upload-Offset": "0",
    },
  };
}

export interface TusPatchInput {
  /** Current persisted offset. */
  currentOffset: number;
  /** `Upload-Offset` from the request. */
  uploadOffset: number;
  /** Chunk size from `Content-Length`. */
  chunkSize: number;
  /** Total declared length. */
  uploadLength: number;
  /** Optional checksum header value, e.g. "sha256 <b64>". */
  checksum?: string;
}

export interface TusPatchResponse {
  status: 204 | 409 | 460;
  headers: Record<string, string>;
  /** True when the upload has reached uploadLength. */
  complete: boolean;
  /** New persisted offset. */
  newOffset: number;
}

export function tusPatch(input: TusPatchInput): TusPatchResponse {
  if (input.uploadOffset !== input.currentOffset) {
    return {
      status: 409,
      headers: { "Tus-Resumable": "1.0.0", "Upload-Offset": String(input.currentOffset) },
      complete: false,
      newOffset: input.currentOffset,
    };
  }
  const next = input.currentOffset + input.chunkSize;
  if (next > input.uploadLength) {
    return {
      status: 409,
      headers: { "Tus-Resumable": "1.0.0", "Upload-Offset": String(input.currentOffset) },
      complete: false,
      newOffset: input.currentOffset,
    };
  }
  return {
    status: 204,
    headers: { "Tus-Resumable": "1.0.0", "Upload-Offset": String(next) },
    complete: next === input.uploadLength,
    newOffset: next,
  };
}

/** Decode the `Upload-Metadata` header (RFC: comma-separated `key base64value`). */
export function parseUploadMetadata(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const pair of header.split(",")) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const sp = trimmed.indexOf(" ");
    if (sp === -1) { out[trimmed] = ""; continue; }
    const key = trimmed.slice(0, sp);
    const b64 = trimmed.slice(sp + 1);
    try {
      out[key] = Buffer.from(b64, "base64").toString("utf8");
    } catch {
      out[key] = "";
    }
  }
  return out;
}

/** Verify an `Upload-Checksum` header against a chunk. */
export async function verifyChecksum(checksum: string, chunk: Uint8Array): Promise<boolean> {
  const sp = checksum.indexOf(" ");
  if (sp === -1) return false;
  const algo = checksum.slice(0, sp).toLowerCase();
  const expected = checksum.slice(sp + 1);
  if (algo !== "sha256" && algo !== "sha1" && algo !== "md5") return false;
  const algoName = { sha256: "SHA-256", sha1: "SHA-1", md5: "MD5" }[algo] ?? "SHA-256";
  if (algo === "md5") return false; // not supported by SubtleCrypto
  const buf = await crypto.subtle.digest(algoName, chunk);
  const got = Buffer.from(buf).toString("base64");
  return got === expected;
}
