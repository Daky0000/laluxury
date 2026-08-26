/**
 * Railway's healthcheck target, and the fingerprint that proves which build is
 * actually serving.
 *
 * Two rules keep it useful. It touches nothing — no database, no session, no
 * settings — because the release applies migrations before it listens, and a
 * cold Postgres must not be able to mark a good deployment unhealthy. And it
 * needs no authentication, so `curl` against it is a real answer rather than
 * the 401 every other `/api` route would give.
 *
 * `stamp` changes on every build (see `next.config.ts`), so comparing it before
 * and after a deploy is how you tell a shipped change from a cached one.
 */
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const base = {
    ok: true,
    time: new Date().toISOString(),
    stamp: process.env.BUILD_STAMP ?? "unknown",
    commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
  };

  // Readiness, asked for explicitly with ?db=1. Kept off the default response
  // so the path Railway polls never depends on the database being awake.
  if (new URL(request.url).searchParams.get("db") !== "1") {
    return Response.json(base);
  }

  try {
    const [products, active, categories] = await Promise.all([
      db.product.count(),
      db.product.count({ where: { status: "ACTIVE" } }),
      db.category.count(),
    ]);
    return Response.json({ ...base, db: { products, active, categories } });
  } catch (error) {
    return Response.json({
      ...base,
      db: { error: error instanceof Error ? error.message : String(error) },
    });
  }
}
