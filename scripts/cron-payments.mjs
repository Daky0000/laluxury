#!/usr/bin/env node
/**
 * Calls the payment housekeeping endpoint. For a scheduled job (e.g. a Railway
 * cron service running every 5 minutes):
 *
 *   SITE_URL=https://shop.example.com CRON_SECRET=... node scripts/cron-payments.mjs
 *
 * The web server also runs the same jobs on its own (src/instrumentation.ts);
 * running both is safe, every step is idempotent.
 */
const base = (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
const secret = process.env.CRON_SECRET;
if (!base || !secret) {
  console.error("Set SITE_URL (or NEXT_PUBLIC_SITE_URL) and CRON_SECRET.");
  process.exit(1);
}

const response = await fetch(`${base}/api/cron/expire-orders`, {
  method: "POST",
  headers: { Authorization: `Bearer ${secret}` },
  signal: AbortSignal.timeout(120_000),
});
const body = await response.text();
console.log(response.status, body);
process.exit(response.ok ? 0 : 1);
