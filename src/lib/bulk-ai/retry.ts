/**
 * Failure classification for the Bulk Product AI router.
 *
 * Retryable failures spend the current model's attempts and then move on to the
 * next model. Fatal ones (bad key, a request we built wrong) stop the whole
 * task at once — three more calls with an invalid key would only waste time.
 */

export type AiFailureKind = "RETRYABLE" | "SKIP_MODEL" | "FATAL";

export class BulkAiError extends Error {
  constructor(
    message: string,
    readonly kind: AiFailureKind,
    readonly status?: number,
  ) {
    super(message);
    this.name = "BulkAiError";
  }
}

/** All models in the chain failed (or none were usable). The item is kept for retry. */
export class BulkAiExhaustedError extends Error {
  constructor(message = "AI could not complete this task. The item was kept so it can be retried.") {
    super(message);
    this.name = "BulkAiExhaustedError";
  }
}

export class BulkAiDisabledError extends Error {
  constructor(message = "AI assistance is switched off.") {
    super(message);
    this.name = "BulkAiDisabledError";
  }
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/** Errors about one model (restricted, withdrawn, not free) — try the next model, don't stop. */
const MODEL_UNAVAILABLE = /only available|not available|no endpoints|not a valid model|model not found|does not exist|not supported|agentic|data policy|guardrail|restricted/i;

export function classifyHttpStatus(status: number, message = ""): AiFailureKind {
  if (RETRYABLE_STATUS.has(status)) return "RETRYABLE";
  if (MODEL_UNAVAILABLE.test(message)) return "SKIP_MODEL";
  if (status === 401) return "FATAL"; // invalid key
  if (status === 403) return /key|auth|credential/i.test(message) ? "FATAL" : "SKIP_MODEL";
  if (status === 402) return "SKIP_MODEL"; // credits needed: never pay silently
  if (status === 404) return "SKIP_MODEL"; // model withdrawn
  if (status === 400 && /model|not a valid model|no endpoints/i.test(message)) return "SKIP_MODEL";
  if (status === 400) return "FATAL"; // we built an invalid request
  return status >= 500 ? "RETRYABLE" : "FATAL";
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof BulkAiError) return error.kind === "RETRYABLE";
  // Network errors, timeouts, JSON/Zod failures — everything we did not classify.
  return true;
}

export function isFatal(error: unknown): boolean {
  return error instanceof BulkAiError && error.kind === "FATAL";
}

/** 1s, 2s, 4s … with jitter, capped at 15s. */
export function backoffMs(attempt: number): number {
  const base = Math.min(15_000, 1000 * 2 ** (attempt - 1));
  return Math.round(base * (0.75 + Math.random() * 0.5));
}

export function waitWithBackoff(attempt: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, backoffMs(attempt));
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error).slice(0, 500);
}
