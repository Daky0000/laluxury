import { headers } from "next/headers";

/**
 * A small in-memory rate limiter for the handful of actions that take a
 * credential: signing in, asking for a reset, typing a code.
 *
 * It lives in process memory rather than the database because the shop runs as
 * one long-lived Node server, and a lock-out that costs a database write on
 * every attempt is a lock-out an attacker can turn into load. The cost of that
 * choice is that a restart forgets every count, which is fine: the point is to
 * make a password guess cost seconds rather than milliseconds, not to keep a
 * permanent record.
 *
 * Keys are chosen by the caller. Sign-in is limited per identifier *and* per
 * address, so one person forgetting their password does not lock out a shared
 * office connection, and one address cannot try every phone number in Accra.
 */

type Window = { hits: number[] };

const windows = new Map<string, Window>();

/** How often the map is swept of keys nobody has touched. */
const SWEEP_EVERY_MS = 5 * 60 * 1000;
let lastSweep = Date.now();

function sweep(now: number, windowMs: number): void {
  if (now - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = now;
  for (const [key, window] of windows) {
    window.hits = window.hits.filter((at) => now - at < windowMs);
    if (window.hits.length === 0) windows.delete(key);
  }
}

export type RateLimitResult =
  | { ok: true }
  | {
      ok: false;
      /** Whole seconds until the oldest hit falls out of the window. */
      retryAfterSeconds: number;
    };

/**
 * Records one attempt against `key` and says whether it was allowed.
 *
 * `limit` attempts are permitted in any rolling `windowMs`. The attempt is
 * counted whether or not it is allowed, so hammering a locked key only makes
 * the lock longer.
 */
export function rateLimit(
  key: string,
  options: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  sweep(now, options.windowMs);

  const window = windows.get(key) ?? { hits: [] };
  window.hits = window.hits.filter((at) => now - at < options.windowMs);

  const allowed = window.hits.length < options.limit;
  window.hits.push(now);
  windows.set(key, window);

  if (allowed) return { ok: true };

  const oldest = window.hits[0] ?? now;
  return {
    ok: false,
    retryAfterSeconds: Math.max(1, Math.ceil((options.windowMs - (now - oldest)) / 1000)),
  };
}

/**
 * The address the request arrived from, as the proxy in front of us reports it.
 *
 * Railway terminates TLS and forwards the client's address in
 * `x-forwarded-for`; the first entry is the client. Without a proxy the header
 * is absent and every request looks the same, which is the honest answer.
 */
export async function requestAddress(): Promise<string> {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return list.get("x-real-ip") ?? "unknown";
}

/** "Try again in a minute", scaled to how long the lock actually lasts. */
export function retryMessage(seconds: number): string {
  if (seconds < 90) return "Too many attempts. Wait a minute and try again.";
  const minutes = Math.ceil(seconds / 60);
  return `Too many attempts. Wait ${minutes} minutes and try again.`;
}
