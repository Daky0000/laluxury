import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { db } from "@/lib/db";
import { runNotificationWorker } from "./worker";

type DeliveryInput = { channel: "EMAIL" | "SMS" | "PUSH"; destination: string; subject: string; body: string };

/** Persist the inbox and every channel together before any provider is called. */
export async function enqueueNotification(input: {
  orderId: string; userId: string | null; eventKey: string; dedupeKey: string;
  title: string; body: string; actionUrl: string; deliveries: DeliveryInput[];
}) {
  const id = randomUUID();
  const result = await db.$transaction(async (tx) => {
    const created = await tx.customerNotification.createMany({
      skipDuplicates: true,
      data: {
        id, orderId: input.orderId, userId: input.userId, eventKey: input.eventKey,
        dedupeKey: input.dedupeKey, title: input.title, body: input.body,
        actionUrl: input.actionUrl,
      },
    });
    if (created.count) {
      await tx.notificationDelivery.createMany({
        data: input.deliveries.map((delivery) => ({ ...delivery, notificationId: id })),
      });
      await tx.orderEvent.create({ data: {
        orderId: input.orderId, type: `notify.${input.eventKey}`,
        message: `Customer notice queued (${input.eventKey}); ${input.deliveries.length} channel jobs.`,
        meta: { notificationId: id },
      } });
    }
    return tx.customerNotification.findUniqueOrThrow({
      where: { dedupeKey: input.dedupeKey },
      select: { id: true, userId: true, _count: { select: { deliveries: true } } },
    });
  });
  // The persisted queue remains available to cron/a dedicated worker if this
  // request ends before after() can run, or the process exits.
  try {
    after(async () => {
      await runNotificationWorker(20_000).catch(() => console.error("[notifications] Background worker failed."));
    });
  } catch {
    // CLI callers have no request context; their worker drains the queue.
  }
  return {
    ok: Boolean(result.userId || result._count.deliveries),
    outcomes: [result.id === id ? "queued" : "already queued", `${result._count.deliveries} channel jobs`, ...(result.userId ? ["inbox recorded"] : [])],
  };
}
