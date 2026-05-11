/**
 * In-process event bus + SSE/webhook emitter shape.
 *
 * Lightweight: brain emits events; transports (SSE / WebSocket / webhook)
 * subscribe via `bus.on()`. Real network plumbing lives in
 * `hanzo-network` and `hanzo-ingress`.
 */

export interface BrainEvent {
  type: string;
  /** ISO timestamp. */
  ts: string;
  /** Payload. */
  data: unknown;
  /** Optional memory slug this event came from. */
  memory?: string;
}

export type Listener = (evt: BrainEvent) => void | Promise<void>;

export class EventBus {
  private listeners = new Map<string, Set<Listener>>();
  private wildcards = new Set<Listener>();

  on(type: string, fn: Listener): () => void {
    if (type === "*") {
      this.wildcards.add(fn);
      return () => this.wildcards.delete(fn);
    }
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
    return () => this.listeners.get(type)?.delete(fn);
  }

  async emit(evt: Omit<BrainEvent, "ts"> & { ts?: string }): Promise<void> {
    const e: BrainEvent = { ts: new Date().toISOString(), ...evt };
    const specific = this.listeners.get(e.type);
    const calls: Array<void | Promise<void>> = [];
    if (specific) for (const l of specific) calls.push(l(e));
    for (const l of this.wildcards) calls.push(l(e));
    await Promise.all(calls);
  }
}

/** Format an event for Server-Sent Events. */
export function toSse(evt: BrainEvent): string {
  return `event: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`;
}

/** Sign a webhook payload with HMAC-SHA256. */
export async function signWebhook(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `sha256=${hex}`;
}
