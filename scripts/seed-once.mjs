/**
 * Seed-on-demand, run from `npm start` before the server listens.
 *
 * The production database only accepts connections from inside Railway's
 * network, so a one-off seed cannot be run from a laptop — it has to happen
 * during a release. This is that hook: set RUN_SEED=1 on the service, deploy,
 * then delete the variable again so the next restart skips it.
 *
 * Two deliberate properties:
 *
 *   - Silent by default. With RUN_SEED unset this prints one line and exits, so
 *     it costs nothing on every ordinary restart.
 *   - Never fatal. A failed seed logs loudly but still exits 0, because a bad
 *     seed must not stop the storefront from booting — that would turn a data
 *     problem into an outage, and the healthcheck would roll the release back
 *     with nothing in the build log to explain why.
 */
import { spawn } from "node:child_process";

if (process.env.RUN_SEED !== "1") {
  console.log("[seed-once] RUN_SEED is not set — skipping.");
  process.exit(0);
}

console.log("[seed-once] RUN_SEED=1 — seeding the database.");

const child = spawn("npm", ["run", "db:seed"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

/**
 * Reads back what the seed claims to have written, over a plain pg connection
 * using the same DATABASE_URL. If the seed reports rows and this reports none,
 * the two are not talking to the same database.
 */
async function verify() {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const { rows } = await client.query(
      'SELECT current_database() AS db, inet_server_addr()::text AS host, (SELECT count(*) FROM "Product")::int AS products, (SELECT count(*) FROM "Category")::int AS categories',
    );
    console.log(`[seed-once] verify: ${JSON.stringify(rows[0])}`);
  } catch (error) {
    console.error(`[seed-once] verify failed: ${error.message}`);
  } finally {
    await client.end().catch(() => {});
  }
}

child.on("exit", async (code) => {
  await verify();
  if (code === 0) {
    console.log("[seed-once] Seed finished. Remove RUN_SEED so it does not run again.");
  } else {
    console.error(
      `[seed-once] SEED FAILED with exit code ${code}. Booting anyway — the store will come up, but the catalog may be empty or partial.`,
    );
  }
  process.exit(0);
});

child.on("error", (error) => {
  console.error(`[seed-once] SEED COULD NOT START: ${error.message}. Booting anyway.`);
  process.exit(0);
});
