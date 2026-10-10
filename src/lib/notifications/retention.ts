import { db } from "@/lib/db";

/** Keep transport audit metadata while removing no-longer-needed message PII. */
export async function pruneNotificationContent() {
  const transportCutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000);
  const inboxCutoff = new Date(Date.now() - 180 * 24 * 60 * 60_000);
  const [scrubbed, deleted] = await db.$transaction([
    db.notificationDelivery.updateMany({
      where: {
        updatedAt: { lt: transportCutoff }, status: { in: ["ACCEPTED", "FAILED", "UNKNOWN", "SUPPRESSED"] },
        OR: [{ destination: { not: "" } }, { body: { not: "" } }],
      },
      data: { destination: "", subject: "", body: "" },
    }),
    db.customerNotification.deleteMany({
      where: { createdAt: { lt: inboxCutoff }, deliveries: { none: { status: { in: ["QUEUED", "SENDING"] } } } },
    }),
  ]);
  return { scrubbed: scrubbed.count, deleted: deleted.count };
}
