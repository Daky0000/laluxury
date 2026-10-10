import Link from "next/link";
import { Bell } from "lucide-react";
import { markReadAction, markAllReadAction } from "@/app/actions/notifications";
import type { listNotifications } from "@/lib/notifications/inbox";
import { NotificationSubmit } from "./notification-submit";

export function NotificationInbox({ inbox, paginated }: {
  inbox: Awaited<ReturnType<typeof listNotifications>>; paginated: boolean;
}) {
  return (
    <section id="notifications" aria-labelledby="notifications-heading" className="mb-10 scroll-mt-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="notifications-heading" className="flex items-center gap-2 text-xl">
          <Bell className="h-5 w-5" aria-hidden="true" /> Notifications
          {inbox.unreadCount > 0 && <span className="text-sm text-[var(--text-secondary)]">{inbox.unreadCount} unread</span>}
        </h2>
        {inbox.unreadCount > 0 && (
          <form action={markAllReadAction}><NotificationSubmit label="Mark all as read" /></form>
        )}
      </div>
      {inbox.items.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">
          {paginated ? "No older notifications." : "Order and payment updates will appear here."}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {inbox.items.map((item) => (
            <li key={item.id} className="py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className={item.readAt ? "text-sm text-[var(--text-secondary)]" : "text-sm font-semibold"}>
                  {item.title}{!item.readAt && <span className="sr-only"> — Unread</span>}
                </h3>
                <time dateTime={item.createdAt.toISOString()} className="text-xs text-[var(--text-muted)]">
                  {item.createdAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" })}
                </time>
              </div>
              <p className="mt-2 max-w-prose whitespace-pre-line break-words text-sm leading-relaxed text-[var(--text-secondary)]">{item.body}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                <Link href={item.actionUrl} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">View order</Link>
                {!item.readAt && (
                  <form action={markReadAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <NotificationSubmit label="Mark as read" />
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <nav aria-label="Notification pages" className="mt-3 flex flex-wrap gap-5 text-sm">
        {paginated && <Link href="/account#notifications" className="inline-flex min-h-11 items-center underline underline-offset-4">Latest notifications</Link>}
        {inbox.nextCursor && <Link href={`/account?notificationsBefore=${encodeURIComponent(inbox.nextCursor)}#notifications`} className="inline-flex min-h-11 items-center underline underline-offset-4">Older notifications</Link>}
      </nav>
    </section>
  );
}
