import type { Instrumentation } from "next";

/**
 * Runs once when the Next.js server starts. Starts the payment housekeeping
 * schedule (`src/lib/payment-jobs.ts`) on the Node.js server in production,
 * so late payments and expired checkouts are handled on time even when nobody
 * is browsing. Set PAYMENT_JOBS=off to disable it (for example when an
 * external cron calls /api/cron/expire-orders instead), or PAYMENT_JOBS=on to
 * run it in development.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  // Prevent unexpected client errors or unhandled promise rejections from killing the process
  if (typeof globalThis.process !== "undefined" && typeof globalThis.process.on === "function") {
    globalThis.process.on("unhandledRejection", (reason) => {
      console.error("[unhandledRejection]", reason);
    });
  }

  const setting = process.env.PAYMENT_JOBS;
  if (setting === "off") return;
  if (process.env.NODE_ENV !== "production" && setting !== "on") return;

  const { startPaymentJobs } = await import("./lib/payment-jobs");
  startPaymentJobs();
}

/**
 * Intercept server errors and handle deployment skew gracefully.
 * When users invoke actions from an older build, Next.js throws
 * "The Server Reference ID did not match the expected format" or "Failed to find Server Action".
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request) => {
  const message = err instanceof Error ? err.message : String(err);
  if (
    message.includes("Server Reference ID") ||
    message.includes("Failed to find Server Action")
  ) {
    console.warn(`[ServerActionSkew] ${message} for ${request.method} ${request.path}`);
    return;
  }
};
