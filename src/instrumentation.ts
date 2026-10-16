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
  const setting = process.env.PAYMENT_JOBS;
  if (setting === "off") return;
  if (process.env.NODE_ENV !== "production" && setting !== "on") return;

  const { startPaymentJobs } = await import("./lib/payment-jobs");
  startPaymentJobs();
}
