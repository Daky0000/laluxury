import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { expireStalePendingOrders } from "@/lib/orders";
import { reconcilePendingPayments } from "@/lib/checkout-payment";
import { postManualSettlementReport } from "@/lib/payment-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/expire-orders
 * Settles late payments, finishes half-done paid orders, releases stock held
 * by checkouts that were never paid, and posts the daily list of money
 * recorded by hand. The server also runs this every five minutes itself
 * (src/instrumentation.ts); this endpoint lets an external scheduler run it
 * too (`node scripts/cron-payments.mjs`).
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
  await postManualSettlementReport().catch((error) => console.error("[cron] manual report", error));
  // Housekeeping: app funnel events are kept for 180 days.
  const pruned = await db.analyticsEvent.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) } },
  });
  return NextResponse.json({ ok: true, reconciled, expired, prunedEvents: pruned.count });
}
