import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma";
import { env } from "./env";

/**
 * Prisma 7 requires a driver adapter for the connection. A single client is
 * cached on globalThis so Next.js dev hot-reloads do not exhaust the pool.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createClient> | undefined;
};

function createClient() {
  const adapter = new PrismaPg({ connectionString: env.databaseUrl() });
  return new PrismaClient({
    adapter,
    log: env.isProduction() ? ["error"] : ["error", "warn"],
    // Image bytes are megabytes each and are only ever wanted by the route
    // that serves them, which asks for them explicitly.
    omit: { mediaAsset: { data: true } },
  });
}

export const db = globalForPrisma.prisma ?? createClient();

if (!env.isProduction()) globalForPrisma.prisma = db;
