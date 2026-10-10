import "dotenv/config";
import { runNotificationWorker } from "../src/lib/notifications/worker";
import { db } from "../src/lib/db";

let stopped = false;
process.on("SIGINT", () => { stopped = true; });
process.on("SIGTERM", () => { stopped = true; });

async function main() {
  while (!stopped) {
    try { await runNotificationWorker(20_000); }
    catch { console.error("[notifications] Worker failed; inspect database availability."); }
    if (!stopped) await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  await db.$disconnect();
}

main().catch(() => { process.exitCode = 1; });
