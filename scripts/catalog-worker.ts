/**
 * Dedicated Catalog Worker for Bulk Product Add.
 *
 * Optional: imports also progress inside the web process (after each request,
 * while the review page is open, and on POST /api/cron/bulk-import). Run this
 * as a separate service for very large catalogs so the queue drains with
 * nobody watching:
 *
 *   npm run catalog:worker
 *
 * Several workers may run at once; jobs are claimed with SKIP LOCKED.
 */
import "dotenv/config";

async function main() {
  const { runCatalogWorker } = await import("../src/lib/bulk-import/pipeline");
  const id = `worker-${process.pid}`;
  let stopping = false;
  process.on("SIGTERM", () => (stopping = true));
  process.on("SIGINT", () => (stopping = true));
  console.log(`[catalog-worker] ${id} started`);
  while (!stopping) {
    const { processed } = await runCatalogWorker(55_000, id).catch((error) => {
      console.error("[catalog-worker]", error);
      return { processed: 0 };
    });
    if (processed) console.log(`[catalog-worker] processed ${processed} job(s)`);
    else await new Promise((r) => setTimeout(r, 5_000));
  }
  console.log("[catalog-worker] stopped");
  process.exit(0);
}

void main();
