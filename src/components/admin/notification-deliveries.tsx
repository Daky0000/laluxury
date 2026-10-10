import Link from "next/link";
import { db } from "@/lib/db";
import { retryConfiguredDeliveryAction } from "@/app/actions/admin/notification-deliveries";
import { MAX_ATTEMPTS } from "@/lib/notifications/policy";
import { NotificationSubmit } from "@/components/shop/notification-submit";

/** The parent page must require settings:manage before rendering this section. */
export async function NotificationDeliveries() {
  const [deliveries, pending, review] = await Promise.all([
    db.notificationDelivery.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 25,
      select: {
        id: true, channel: true, status: true, attemptCount: true, failureCode: true, createdAt: true, destination: true,
        notification: { select: { eventKey: true, order: { select: { id: true, orderNumber: true } } } },
      },
    }),
    db.notificationDelivery.count({ where: { status: { in: ["QUEUED", "SENDING"] } } }),
    db.notificationDelivery.count({ where: { status: { in: ["FAILED", "UNKNOWN"] } } }),
  ]);
  return (
    <section aria-labelledby="delivery-heading">
      <h2 id="delivery-heading" className="text-xl">Recent delivery attempts</h2>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">{pending} pending · {review} need review. Accepted means the provider received the message. Unknown outcomes are not automatically retried.</p>
      {deliveries.length === 0 ? <p className="mt-4 text-sm text-[var(--text-muted)]">Queued order notices will appear here.</p> : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Latest 25 notification deliveries</caption>
            <thead className="border-b border-[var(--border)] text-[var(--text-secondary)]"><tr>
              {["Order / event", "Channel", "Status", "Attempts", "Failure / action"].map((heading) => <th key={heading} scope="col" className="whitespace-nowrap px-3 py-3 font-medium">{heading}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-[var(--border)]">
              {deliveries.map((delivery) => <tr key={delivery.id}>
                <td className="px-3 py-3">
                  {delivery.notification.order && <Link href={`/admin/orders/${delivery.notification.order.id}`} className="underline underline-offset-4">{delivery.notification.order.orderNumber}</Link>}
                  <span className="mt-1 block text-xs text-[var(--text-muted)]">{delivery.notification.eventKey}</span>
                </td>
                <td className="px-3 py-3">{delivery.channel}</td>
                <td className="px-3 py-3">{delivery.status}</td>
                <td className="px-3 py-3 tabular-nums">{delivery.attemptCount} / {MAX_ATTEMPTS}</td>
                <td className="px-3 py-3">
                  <span className="text-xs">{delivery.failureCode || "—"}</span>
                  {delivery.destination && delivery.status === "FAILED" && ["EMAIL_NOT_CONFIGURED", "NOT_CONFIGURED"].includes(delivery.failureCode || "") && delivery.attemptCount < MAX_ATTEMPTS && (
                    <form action={retryConfiguredDeliveryAction}><input type="hidden" name="id" value={delivery.id} /><NotificationSubmit label="Retry after setup" /></form>
                  )}
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
