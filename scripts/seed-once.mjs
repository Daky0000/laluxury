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

child.on("exit", (code) => {
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
