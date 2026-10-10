import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { expireStalePendingOrders } from "@/lib/orders";
import { reconcilePendingPayments } from "@/lib/checkout-payment";

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

  // Late approvals first, so nothing paid is mistaken for an abandoned checkout.
  const reconciled = await reconcilePendingPayments({ limit: 100 });
  const expired = await expireStalePendingOrders(200);
  // Housekeeping: app funnel events are kept for 180 days.
  const pruned = await db.analyticsEvent.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) } },
  });
  return NextResponse.json({ ok: true, reconciled, expired, prunedEvents: pruned.count });
}
