/**
 * Exponential backoff with full jitter.
 *
 *   delay(n) = min(maxMs, baseMs * 2^n) * jitter,  jitter ∈ [0, 1]
 *
 * Retries on transient network/5xx; never on 4xx (caller decides via the
 * `isTransient` predicate).
 */

export interface RetryOpts {
  /** Max attempts (including the first). */
  attempts?: number;
  /** Initial delay (ms). */
  baseMs?: number;
  /** Cap delay (ms). */
  maxMs?: number;
  /** Predicate: should this error be retried? Defaults to "always". */
  isTransient?: (err: unknown) => boolean;
  /** Optional sleep (mock-able in tests). */
  sleep?: (ms: number) => Promise<void>;
}

export async function retry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseMs = opts.baseMs ?? 100;
  const maxMs = opts.maxMs ?? 30_000;
  const ok = opts.isTransient ?? (() => true);
  const sleep = opts.sleep ?? defaultSleep;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i === attempts - 1) break;
      if (!ok(e)) break;
      const delay = Math.min(maxMs, baseMs * 2 ** i) * Math.random();
      await sleep(delay);
    }
  }
  throw lastErr;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
