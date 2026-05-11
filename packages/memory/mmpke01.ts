/**
 * MMPKE01 multi-recipient envelope format detector + magic-byte sniff.
 *
 * Wire format:
 *   ┌─────────────────────────────────────────────────┐
 *   │ Magic: "MMPKE01\n" (8 bytes)                    │
 *   ├─────────────────────────────────────────────────┤
 *   │ Header length: u32 little-endian (4 bytes)      │
 *   ├─────────────────────────────────────────────────┤
 *   │ Header: JSON { ephemeralPub, recipients: [...] }│
 *   ├─────────────────────────────────────────────────┤
 *   │ AES-256-GCM ciphertext of body                  │
 *   └─────────────────────────────────────────────────┘
 *
 * Cryptographic ops (X25519 ECDH + HKDF-SHA256 + AES-256-GCM) are
 * delegated to `@hanzo/crypto` (Rust via WASM or Node native) so the
 * brain stays runtime-agnostic.
 */

export const MAGIC = new Uint8Array([0x4d, 0x4d, 0x50, 0x4b, 0x45, 0x30, 0x31, 0x0a]);

export interface MmpkeRecipient {
  /** Wallet-style address — e.g. `hanzo:1A1zP1eP5...` or `mm:...`. */
  address: string;
  /** Base64-encoded encrypted DEK (wrapped with this recipient's KEK). */
  encryptedDek: string;
  /** Base64-encoded GCM nonce used for the DEK wrap. */
  nonce: string;
}

export interface MmpkeHeader {
  version: 1;
  /** Base64-encoded ephemeral X25519 public key. */
  ephemeralPub: string;
  recipients: MmpkeRecipient[];
  /** Optional metadata — propagated to consumers but not authenticated by GCM. */
  metadata?: Record<string, unknown>;
}

export interface MmpkeParsed {
  header: MmpkeHeader;
  ciphertext: Uint8Array;
}

/** True if `buf` begins with the MMPKE01 magic bytes. */
export function isMmpke01(buf: Uint8Array): boolean {
  if (buf.length < MAGIC.length) return false;
  for (let i = 0; i < MAGIC.length; i++) if (buf[i] !== MAGIC[i]) return false;
  return true;
}

/** Parse the on-disk MMPKE01 envelope structure (no decryption). */
export function parseMmpke01(buf: Uint8Array): MmpkeParsed {
  if (!isMmpke01(buf)) throw new Error("mmpke01: bad magic");
  if (buf.length < MAGIC.length + 4) throw new Error("mmpke01: truncated header length");
  const hl =
    buf[MAGIC.length] |
    (buf[MAGIC.length + 1] << 8) |
    (buf[MAGIC.length + 2] << 16) |
    (buf[MAGIC.length + 3] << 24);
  const headerStart = MAGIC.length + 4;
  if (headerStart + hl > buf.length) throw new Error("mmpke01: truncated header body");
  const headerJson = new TextDecoder().decode(buf.subarray(headerStart, headerStart + hl));
  const header = JSON.parse(headerJson) as MmpkeHeader;
  const ciphertext = buf.subarray(headerStart + hl);
  return { header, ciphertext };
}

/** Build the on-disk MMPKE01 envelope from header + ciphertext. */
export function buildMmpke01(header: MmpkeHeader, ciphertext: Uint8Array): Uint8Array {
  const headerJson = new TextEncoder().encode(JSON.stringify(header));
  const out = new Uint8Array(MAGIC.length + 4 + headerJson.length + ciphertext.length);
  out.set(MAGIC, 0);
  const hl = headerJson.length;
  out[MAGIC.length + 0] = hl & 0xff;
  out[MAGIC.length + 1] = (hl >> 8) & 0xff;
  out[MAGIC.length + 2] = (hl >> 16) & 0xff;
  out[MAGIC.length + 3] = (hl >> 24) & 0xff;
  out.set(headerJson, MAGIC.length + 4);
  out.set(ciphertext, MAGIC.length + 4 + headerJson.length);
  return out;
}

/** Find a recipient block for the given address. */
export function recipientFor(header: MmpkeHeader, address: string): MmpkeRecipient | undefined {
  return header.recipients.find((r) => r.address === address);
}
