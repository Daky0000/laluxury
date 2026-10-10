"use server";

import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { runNotificationWorker } from "@/lib/notifications/worker";
import { MAX_ATTEMPTS } from "@/lib/notifications/policy";

export async function retryConfiguredDeliveryAction(form: FormData) {
  const actor = await requirePermission("settings:manage");
  const id = String(form.get("id") || "");
  // Only unsent messages blocked by missing configuration are safe to replay.
  // UNKNOWN is deliberately excluded, since it may already have been accepted.
  const changed = await db.notificationDelivery.updateMany({
    where: {
      id, status: "FAILED", failureCode: { in: ["EMAIL_NOT_CONFIGURED", "NOT_CONFIGURED"] },
      attemptCount: { lt: MAX_ATTEMPTS },
      destination: { not: "" }, body: { not: "" },
    },
    data: { status: "QUEUED", failureCode: null, nextAttemptAt: new Date() },
  });
  if (changed.count) {
    await recordAudit({ actorId: actor.id, action: "notification.retry", entity: "NotificationDelivery", entityId: id });
    after(async () => { await runNotificationWorker().catch(() => console.error("[notifications] Retry worker failed.")); });
  }
  revalidatePath("/admin/settings/messages");
}
