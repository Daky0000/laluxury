import { timingSafeEqual } from "node:crypto";
import { runNotificationWorker } from "@/lib/notifications/worker";
import { pruneNotificationContent } from "@/lib/notifications/retention";
import { sendNewProductsSmsNotification } from "@/lib/new-products-sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expected = Buffer.from(process.env.CRON_SECRET || "");
  const supplied = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "");
  if (!expected.length || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const [workerResult, retentionResult, smsCampaignResult] = await Promise.all([
    runNotificationWorker(50_000),
    pruneNotificationContent(),
    sendNewProductsSmsNotification().catch((err) => ({ ok: false, error: String(err) })),
  ]);

  return Response.json(
    {
      ok: true,
      ...workerResult,
      retention: retentionResult,
      newProductsSms: smsCampaignResult,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
