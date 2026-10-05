import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { expireStalePendingOrders } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/expire-orders
 * Releases stock held by checkouts that were never paid. Checkout also runs
 * this sweep opportunistically; this endpoint lets a scheduler run it on time.
 * Requires `Authorization: Bearer $CRON_SECRET`.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const ok =
    Boolean(secret) &&
    given.length === secret!.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(secret!));
  if (!ok) return NextResponse.json({ ok: false }, { status: 401 });

  const expired = await expireStalePendingOrders(200);
  return NextResponse.json({ ok: true, expired });
}
