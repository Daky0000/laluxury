/**
 * Runs the seed from `npm start`, before the server listens.
 *
 * Railway Cost Optimization:
 * Instead of unconditionally spawning `tsx prisma/seed.ts` (which boots the
 * TypeScript compiler and Prisma Client in a child process and consumes ~350MB
 * of extra RAM on every container restart), we first compute the catalog
 * revision hash in plain Node and query the `Setting` table directly over a
 * lightweight `pg` connection. If `catalog.revision` already matches and
 * `RUN_SEED !== "1"`, we skip spawning `tsx` altogether!
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CATALOG_SCHEMA_VERSION = 3;
const REVISION_KEY = "catalog.revision";

function computeSeedRevision() {
  try {
    const seedPath = resolve(process.cwd(), "prisma/seed.ts");
    return createHash("sha256")
      .update(`v${CATALOG_SCHEMA_VERSION}\n`)
      .update(readFileSync(seedPath, "utf8"))
      .digest("hex")
      .slice(0, 12);
  } catch {
    return null;
  }
}

async function checkStateAndVerify() {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const { rows } = await client.query(
      'SELECT current_database() AS db, ' +
        '(SELECT value FROM "Setting" WHERE key = $1) AS rev_setting, ' +
        '(SELECT count(*) FROM "Product" WHERE status = \'ACTIVE\')::int AS live_products, ' +
        '(SELECT count(*) FROM "Product")::int AS products, ' +
        '(SELECT count(*) FROM "Category" WHERE "isActive")::int AS categories',
      [REVISION_KEY],
    );
    const row = rows[0] ?? {};
    const appliedRevision = row.rev_setting?.revision ?? null;
    console.log(
      `[seed-once] status: db=${row.db}, live_products=${row.live_products}, categories=${row.categories}, revision=${appliedRevision ?? "none"}`,
    );
    return { appliedRevision, liveProducts: row.live_products ?? 0 };
  } catch (error) {
    console.error(`[seed-once] check failed: ${error.message}`);
    return { appliedRevision: null, liveProducts: 0 };
  } finally {
    await client.end().catch(() => {});
  }
}

function run(task) {
  return new Promise((resolveCode) => {
    console.log(`[seed-once] running ${task}...`);
    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawn(npmCmd, ["run", task], {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => resolveCode(code ?? 1));
    child.on("error", (error) => {
      console.error(`[seed-once] ${task} COULD NOT START: ${error.message}.`);
      resolveCode(1);
    });
  });
}

const expectedRevision = computeSeedRevision();
const initial = await checkStateAndVerify();
const forced = process.env.RUN_SEED === "1";

const tasks = [];
if (forced || !expectedRevision || initial.appliedRevision !== expectedRevision || initial.liveProducts === 0) {
  tasks.push("db:seed");
} else {
  console.log(`[seed-once] catalog already at revision ${expectedRevision} — skipping heavy tsx seed on boot (Railway RAM/CPU saver).`);
}

if (process.env.RUN_DEMO_ORDERS === "1") {
  tasks.push("db:demo");
}

const failed = [];
for (const task of tasks) {
  const code = await run(task);
  if (code !== 0) failed.push(`${task} (exit ${code})`);
}

if (tasks.length > 0) {
  await checkStateAndVerify();
}

if (failed.length === 0) {
  console.log(`[seed-once] boot check complete.`);
} else {
  console.error(
    `[seed-once] FAILED: ${failed.join(", ")}. Booting anyway — the store will come up, ` +
      "but the catalog may be stale or partial.",
  );
}

process.exit(0);
