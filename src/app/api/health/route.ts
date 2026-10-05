import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimitResponse, requestAddress } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Railway's healthcheck target, and the build fingerprint.
 *
 * Touches NO database by default. Railway polls this path continuously; running
 * database queries on every poll would prevent Railway Postgres from sleeping
 * and could fail cold deployments with 503s into an endless restart loop.
 *
 * For deep diagnostics (e.g. admin or manual checks), pass ?db=1.
 */
export async function GET(request: Request) {
  const base = {
    status: "ok",
    service: "Noble Enclave Commerce",
    uptimeSeconds: Math.round(process.uptime()),
    stamp: process.env.BUILD_STAMP ?? "unknown",
    commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
    timestamp: new Date().toISOString(),
  };

  const url = new URL(request.url);
  if (url.searchParams.get("db") !== "1") {
    return NextResponse.json(base, { status: 200 });
  }

  // Deep checks hit the database, so they are throttled per address.
  const limited = rateLimitResponse([
    { key: `health-db:${await requestAddress()}`, limit: 6, windowMs: 60 * 1000 },
  ]);
  if (limited) return limited;

  const start = Date.now();
  try {
    const [revSetting, productCount] = await Promise.all([
      db.setting.findUnique({
        where: { key: "catalog.revision" },
      }),
      db.product.count({ where: { status: "ACTIVE" } }),
    ]);

    const latencyMs = Date.now() - start;

    return NextResponse.json(
      {
        ...base,
        database: "connected",
        activeProducts: productCount,
        catalogRevision: revSetting?.value ?? null,
        latencyMs,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[health] database check failed", error);
    return NextResponse.json(
      {
        ...base,
        status: "degraded",
        database: "unreachable",
        // Raw driver errors can name hosts and users; they go to the log only.
      },
      { status: 503 },
    );
  }
}

