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
 * and after a deploy is how you tell a shipped change from a cached one. When
 * two projects deploy the same repository, it is also how you tell which one
 * you are actually talking to.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    ok: true,
    time: new Date().toISOString(),
    stamp: process.env.BUILD_STAMP ?? "unknown",
    commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
  });
}
