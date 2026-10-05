import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runCatalogWorker } from "@/lib/bulk-import/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/bulk-import
 * Gives the catalog import queue up to 50 seconds of work, so large imports
 * keep moving with nobody watching. Requires `Authorization: Bearer $CRON_SECRET`.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const ok =
    Boolean(secret) &&
    given.length === secret!.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(secret!));
  if (!ok) return NextResponse.json({ ok: false }, { status: 401 });

  const out = await runCatalogWorker(50_000, "cron");
  return NextResponse.json({ ok: true, ...out });
}
