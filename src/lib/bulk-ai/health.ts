/**
 * Per-process circuit breaker and concurrency limits for Bulk Product AI.
 *
 * 10 retryable failures inside 5 minutes marks a model DEGRADED for 10 minutes.
 * While degraded the router skips it; once the window passes, the next call is
 * the probe — a success restores it, a failure re-opens the breaker.
 */

const FAILURE_WINDOW_MS = 5 * 60_000;
const FAILURE_THRESHOLD = 10;
const DEGRADED_FOR_MS = 10 * 60_000;

type Health = { failures: number[]; degradedUntil: number };

const g = globalThis as unknown as {
  bulkAiHealth?: Map<string, Health>;
  bulkAiSlots?: Map<string, { active: number; queue: (() => void)[] }>;
};
const health = (g.bulkAiHealth ??= new Map());
const slots = (g.bulkAiSlots ??= new Map());

function entry(model: string): Health {
  let h = health.get(model);
  if (!h) {
    h = { failures: [], degradedUntil: 0 };
    health.set(model, h);
  }
  return h;
}

export function isDegraded(model: string): boolean {
  return entry(model).degradedUntil > Date.now();
}

export function recordFailure(model: string): void {
  const h = entry(model);
  const now = Date.now();
  h.failures = h.failures.filter((t) => now - t < FAILURE_WINDOW_MS);
  h.failures.push(now);
  if (h.failures.length >= FAILURE_THRESHOLD) {
    h.degradedUntil = now + DEGRADED_FOR_MS;
    h.failures = [];
  }
}

export function recordSuccess(model: string): void {
  const h = entry(model);
  h.failures = [];
  h.degradedUntil = 0;
}

export function healthSnapshot(): { model: string; degraded: boolean; recentFailures: number }[] {
  return [...health.entries()].map(([model, h]) => ({
    model,
    degraded: h.degradedUntil > Date.now(),
    recentFailures: h.failures.length,
  }));
}

/** Runs `fn` once fewer than `limit` calls for `key` are in flight. */
export async function withSlot<T>(key: string, limit: number, fn: () => Promise<T>): Promise<T> {
  let s = slots.get(key);
  if (!s) {
    s = { active: 0, queue: [] };
    slots.set(key, s);
  }
  const slot = s;
  if (slot.active >= limit) {
    await new Promise<void>((resolve) => slot.queue.push(resolve));
  }
  slot.active += 1;
  try {
    return await fn();
  } finally {
    slot.active -= 1;
    slot.queue.shift()?.();
  }
}
