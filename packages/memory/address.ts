/**
 * Wallet-style content-addressable identifiers.
 *
 *   hanzo:<version-byte><blake3-20><checksum-4>     base58 encoded
 *
 * Matches Fortémi's `mm:` format exactly, only the prefix differs. Bridges
 * both directions so MMPKE01 files keyed to a fortemi `mm:` address can
 * be read by Hanzo and vice versa.
 */
import { blake3 } from "@noble/hashes/blake3.js";

const VERSION_V1 = 0x01;
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export interface AddressOpts {
  prefix?: "hanzo" | "mm";
}

/** Encode a 32-byte public key as a wallet-style address. */
export function encodeAddress(publicKey: Uint8Array, opts: AddressOpts = {}): string {
  if (publicKey.length !== 32) throw new Error("public key must be 32 bytes");
  const prefix = opts.prefix ?? "hanzo";
  const hash = blake3(publicKey).subarray(0, 20);
  const versioned = new Uint8Array(1 + hash.length);
  versioned[0] = VERSION_V1;
  versioned.set(hash, 1);
  const checksum = blake3(versioned).subarray(0, 4);
  const payload = new Uint8Array(versioned.length + checksum.length);
  payload.set(versioned, 0);
  payload.set(checksum, versioned.length);
  return `${prefix}:${base58Encode(payload)}`;
}

/** Parse a wallet-style address. Throws on malformed input. */
export function decodeAddress(address: string): { prefix: string; version: number; hash: Uint8Array } {
  const colon = address.indexOf(":");
  if (colon === -1) throw new Error("address: missing prefix");
  const prefix = address.slice(0, colon);
  const decoded = base58Decode(address.slice(colon + 1));
  if (decoded.length !== 25) throw new Error("address: wrong length");
  const version = decoded[0];
  const hash = decoded.subarray(1, 21);
  const checksum = decoded.subarray(21, 25);
  const versioned = decoded.subarray(0, 21);
  const expected = blake3(versioned).subarray(0, 4);
  if (!bytesEqual(checksum, expected)) throw new Error("address: bad checksum");
  return { prefix, version, hash: new Uint8Array(hash) };
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits: number[] = [0];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let out = "";
  for (let i = 0; i < zeros; i++) out += BASE58_ALPHABET[0];
  for (let i = digits.length - 1; i >= 0; i--) out += BASE58_ALPHABET[digits[i]];
  return out;
}

function base58Decode(s: string): Uint8Array {
  if (s.length === 0) return new Uint8Array(0);
  let zeros = 0;
  while (zeros < s.length && s[zeros] === BASE58_ALPHABET[0]) zeros++;
  const bytes: number[] = [0];
  for (let i = zeros; i < s.length; i++) {
    const v = BASE58_ALPHABET.indexOf(s[i]);
    if (v < 0) throw new Error(`base58: invalid char ${s[i]}`);
    let carry = v;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  const out = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < zeros; i++) out[i] = 0;
  for (let i = 0; i < bytes.length; i++) out[zeros + i] = bytes[bytes.length - 1 - i];
  return out;
}
