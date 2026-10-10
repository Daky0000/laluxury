import { timingSafeEqual } from "node:crypto";
import { runNotificationWorker } from "@/lib/notifications/worker";
import { pruneNotificationContent } from "@/lib/notifications/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expected = Buffer.from(process.env.CRON_SECRET || "");
  const supplied = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "");
  if (!expected.length || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return Response.json({ ok: false }, { status: 401 });
  }
  return Response.json({ ok: true, ...await runNotificationWorker(50_000), retention: await pruneNotificationContent() }, { headers: { "Cache-Control": "no-store" } });
}
