/**
 * Runs the seed from `npm start`, before the server listens.
 *
 * The production database only accepts connections from inside Railway's
 * network, so a seed cannot be run from a laptop — it has to happen during a
 * release. This is that hook, and it now fires on every boot, so a catalog
 * change reaches the shop by being pushed like anything else.
 *
 * What makes running it every time safe is in `prisma/seed.ts`: the catalog is
 * fingerprinted, and a boot whose fingerprint already matches skips the catalog
 * writes entirely. So the ordinary restart costs one query and changes nothing,
 * while a deploy that actually edited the catalog applies it.
 *
 * RUN_SEED=1 still exists, and now means "apply the catalog even though the
 * fingerprint matches" — the escape hatch for putting a hand-edited row back to
 * what this file says it should be.
 *
 * Two deliberate properties:
 *
 *   - Never fatal. A failed seed logs loudly but still exits 0, because a bad
 *     seed must not stop the storefront from booting — that would turn a data
 *     problem into an outage, and the healthcheck would roll the release back
 *     with nothing in the build log to explain why.
 *   - Sequential. RUN_DEMO_ORDERS runs after the seed rather than instead of
 *     it, since demo orders reference the catalog the seed just wrote.
 */
import { spawn } from "node:child_process";

const tasks = ["db:seed"];

// Demo customers and orders, so the console has something to show before real
// trade starts. Opt-in, and never wanted twice.
if (process.env.RUN_DEMO_ORDERS === "1") tasks.push("db:demo");

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
      'SELECT current_database() AS db, inet_server_addr()::text AS host, ' +
        '(SELECT count(*) FROM "Product" WHERE status = \'ACTIVE\')::int AS live_products, ' +
        '(SELECT count(*) FROM "Product")::int AS products, ' +
        '(SELECT count(*) FROM "Category" WHERE "isActive")::int AS categories',
    );
    console.log(`[seed-once] verify: ${JSON.stringify(rows[0])}`);
  } catch (error) {
    console.error(`[seed-once] verify failed: ${error.message}`);
  } finally {
    await client.end().catch(() => {});
  }
}

/** Resolves to the exit code rather than rejecting, so one failure is survivable. */
function run(task) {
  return new Promise((resolve) => {
    console.log(`[seed-once] running ${task}.`);
    const child = spawn("npm", ["run", task], {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", (error) => {
      console.error(`[seed-once] ${task} COULD NOT START: ${error.message}.`);
      resolve(1);
    });
  });
}

const failed = [];
for (const task of tasks) {
  const code = await run(task);
  if (code !== 0) failed.push(`${task} (exit ${code})`);
}

await verify();

if (failed.length === 0) {
  console.log(`[seed-once] ${tasks.join(", ")} finished.`);
} else {
  console.error(
    `[seed-once] FAILED: ${failed.join(", ")}. Booting anyway — the store will come up, ` +
      "but the catalog may be stale or partial.",
  );
}

process.exit(0);
