import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma";
import { env } from "./env";

/**
 * The database client, and the pool behind it.
 *
 * One client is cached on `globalThis` — **in production as well as in
 * development**. The usual "only cache in dev" line comes from serverless, where
 * every invocation is its own isolated process and a global buys nothing. This
 * shop is a long-running Node server behind `next start`, and there the opposite
 * is true: server code is bundled into several chunks, and each chunk that
 * evaluates this module without the cache builds its own `pg` pool. Ten
 * connections a pool, a handful of pools, and Postgres starts refusing new ones
 * with "max number of clients reached" — which is what it did.
 *
 * The pool is also sized deliberately rather than left on the driver's default
 * of ten. A shop this size does not need ten simultaneous queries, and the
 * headroom is worth more on the database's side of the connection.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createClient> | undefined;
};

/**
 * How many connections this process may hold. Deliberately small: raise
 * `DATABASE_POOL_MAX` if the shop ever needs it, having checked what the
 * database's own `max_connections` is and how many instances are running.
 */
function poolMax(): number {
  const configured = Number(process.env.DATABASE_POOL_MAX);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 3;
}

function createClient() {
  const adapter = new PrismaPg({
    connectionString: env.databaseUrl(),
    max: poolMax(),
    // Waiting forever for a free connection turns a busy pool into a hung
    // request, which is indistinguishable from a broken site. Ten seconds and
    // then a real error.
    connectionTimeoutMillis: 10_000,
    // Release idle connections after 5s and allow the pool to go completely idle
    // so Railway Postgres can enter serverless sleep when there is no traffic.
    idleTimeoutMillis: 5_000,
    allowExitOnIdle: true,
    // Names the connections in pg_stat_activity, so "who is holding these?" has
    // an answer next time.
    application_name: "laluxury",
  });

  return new PrismaClient({
    adapter,
    log: env.isProduction() ? ["error"] : ["error", "warn"],
    // Image bytes are megabytes each and are only ever wanted by the route
    // that serves them, which asks for them explicitly.
    omit: { mediaAsset: { data: true } },
  });
}

export const db = globalForPrisma.prisma ?? createClient();

globalForPrisma.prisma = db;
