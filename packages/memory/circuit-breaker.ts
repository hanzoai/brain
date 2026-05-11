/**
 * Circuit breaker for sidecar HTTP clients.
 *
 * States:
 *   - closed:    requests pass; failures increment counter
 *   - open:      requests short-circuit with `CircuitOpenError`
 *   - half-open: a single probe is allowed; success → closed, failure → open
 */

export class CircuitOpenError extends Error {
  constructor() { super("circuit open"); }
}

export interface CircuitBreakerOpts {
  /** Open after this many consecutive failures. */
  failureThreshold?: number;
  /** Cooldown before half-open probe (ms). */
  cooldownMs?: number;
}

export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private halfOpenInFlight = false;
  private readonly threshold: number;
  private readonly cooldown: number;

  constructor(opts: CircuitBreakerOpts = {}) {
    this.threshold = opts.failureThreshold ?? 5;
    this.cooldown = opts.cooldownMs ?? 30_000;
  }

  state(): "closed" | "open" | "half-open" {
    if (this.failures < this.threshold) return "closed";
    if (Date.now() - this.openedAt >= this.cooldown) return "half-open";
    return "open";
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const s = this.state();
    if (s === "open") throw new CircuitOpenError();
    if (s === "half-open") {
      if (this.halfOpenInFlight) throw new CircuitOpenError();
      this.halfOpenInFlight = true;
      try {
        const r = await fn();
        this.reset();
        return r;
      } catch (e) {
        this.fail();
        throw e;
      } finally {
        this.halfOpenInFlight = false;
      }
    }
    try {
      const r = await fn();
      this.reset();
      return r;
    } catch (e) {
      this.fail();
      throw e;
    }
  }

  fail(): void {
    this.failures += 1;
    if (this.failures >= this.threshold && this.openedAt === 0) {
      this.openedAt = Date.now();
    }
  }

  reset(): void {
    this.failures = 0;
    this.openedAt = 0;
  }
}
