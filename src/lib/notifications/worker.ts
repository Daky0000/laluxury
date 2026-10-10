import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import { pushToUser } from "@/lib/push";
import { deliveryTransition, isNoticeCurrent, MAX_ATTEMPTS, type DeliveryResult } from "./policy";
import type { NotificationDelivery } from "@/generated/prisma";

/** A stale in-flight send might have succeeded; never automatically resend it. */
export async function claimDelivery() {
  const token = randomUUID();
  await db.$executeRaw`
    UPDATE "NotificationDelivery"
       SET status = 'UNKNOWN', "failureCode" = 'WORKER_INTERRUPTED', "lockToken" = NULL,
           "lockedAt" = NULL, "updatedAt" = now()
     WHERE status = 'SENDING' AND "lockedAt" < now() - interval '5 minutes'`;
  await db.$executeRaw`
    UPDATE "NotificationAttempt" a
       SET status = 'UNKNOWN', "failureCode" = 'WORKER_INTERRUPTED'
      FROM "NotificationDelivery" d
     WHERE a."deliveryId" = d.id AND a.number = d."attemptCount"
       AND a.status = 'SENDING' AND d.status = 'UNKNOWN' AND d."failureCode" = 'WORKER_INTERRUPTED'`;
  const rows = await db.$queryRaw<NotificationDelivery[]>`
    UPDATE "NotificationDelivery"
       SET status = 'SENDING', "lockedAt" = now(), "lockToken" = ${token},
           "attemptCount" = "attemptCount" + 1, "updatedAt" = now()
     WHERE id IN (
       SELECT id FROM "NotificationDelivery"
        WHERE status = 'QUEUED' AND "nextAttemptAt" <= now() AND "attemptCount" < ${MAX_ATTEMPTS}
        ORDER BY "nextAttemptAt", "createdAt"
        LIMIT 1 FOR UPDATE SKIP LOCKED
     ) RETURNING *`;
  const job = rows[0];
  if (!job) return null;
  await db.notificationAttempt.create({ data: {
    deliveryId: job.id, number: job.attemptCount, status: "SENDING",
  } });
  return job;
}

async function deliver(job: NotificationDelivery): Promise<DeliveryResult> {
  const notification = await db.customerNotification.findUnique({
    where: { id: job.notificationId }, include: { user: { select: { isActive: true } }, order: true },
  });
  if (!notification || (notification.userId && !notification.user?.isActive)) {
    return { status: "SUPPRESSED", code: "ACCOUNT_UNAVAILABLE" };
  }
  const order = notification.order;
  if (!order) return { status: "SUPPRESSED", code: "ORDER_UNAVAILABLE" };
  if (!isNoticeCurrent(notification.eventKey, order)) {
    return { status: "SUPPRESSED", code: "STALE_ORDER_STATE" };
  }
  if (job.channel === "EMAIL") {
    const result = await sendEmail({ to: job.destination, subject: job.subject, text: job.body });
    if (result.ok) return { status: "ACCEPTED" };
    if (result.skipped) return { status: "FAILED", code: "EMAIL_NOT_CONFIGURED" };
    return result.delivery ?? { status: "UNKNOWN", code: "SMTP_UNKNOWN" };
  }
  if (job.channel === "SMS") {
    const result = await sendSms(job.destination, job.body);
    if (result.ok) return { status: "ACCEPTED" };
    return { status: result.fatal ? "FAILED" : "UNKNOWN", code: result.code };
  }
  if (job.channel === "PUSH" && notification.userId) {
    const count = await db.pushDevice.count({ where: { userId: notification.userId, isActive: true } });
    if (!count) return { status: "SUPPRESSED", code: "NO_PUSH_DEVICE" };
    const accepted = await pushToUser(notification.userId, {
      title: job.subject, body: job.body,
      data: { type: "order", orderNumber: order.orderNumber, notificationId: notification.id },
    });
    // A batch can have partial success; resending would duplicate accepted tickets.
    return accepted ? { status: "ACCEPTED" } : { status: "UNKNOWN", code: "PUSH_UNCONFIRMED" };
  }
  return { status: "FAILED", code: "INVALID_CHANNEL" };
}

export async function finishDelivery(job: NotificationDelivery, result: DeliveryResult) {
  await db.$transaction(async (tx) => {
    const changed = await tx.notificationDelivery.updateMany({
      where: { id: job.id, status: "SENDING", lockToken: job.lockToken },
      data: deliveryTransition(result, job.attemptCount, new Date()),
    });
    if (!changed.count) return;
    await tx.notificationAttempt.updateMany({
      where: { deliveryId: job.id, number: job.attemptCount },
      data: { status: result.status, failureCode: result.code ?? null },
    });
    const notice = await tx.customerNotification.findUnique({ where: { id: job.notificationId }, select: { orderId: true } });
    if (notice?.orderId) await tx.orderEvent.create({ data: {
      orderId: notice.orderId, type: "notify.delivery",
      message: `${job.channel} notice ${result.status.toLowerCase()} (attempt ${job.attemptCount}).`,
      meta: { deliveryId: job.id, notificationId: job.notificationId, code: result.code ?? null },
    } });
  });
}

const globalWorker = globalThis as unknown as { notificationWorkerRunning?: boolean };

export async function runNotificationWorker(budgetMs = 20_000) {
  if (globalWorker.notificationWorkerRunning) return { processed: 0 };
  globalWorker.notificationWorkerRunning = true;
  const end = Date.now() + Math.min(50_000, Math.max(1, budgetMs));
  let processed = 0;
  try {
    while (Date.now() < end) {
      const job = await claimDelivery();
      if (!job) break;
      let result: DeliveryResult;
      try { result = await deliver(job); }
      catch { result = { status: "UNKNOWN", code: "WORKER_ERROR" }; }
      await finishDelivery(job, result);
      processed++;
    }
    return { processed };
  } finally { globalWorker.notificationWorkerRunning = false; }
}
