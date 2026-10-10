import { db } from "@/lib/db";
import { safeNotificationUrl } from "./policy";

const select = {
  id: true, eventKey: true, title: true, body: true, actionUrl: true, createdAt: true, readAt: true,
} as const;

export async function listNotifications(userId: string, before?: string, limit = 20) {
  const take = Math.min(50, Math.max(1, Math.trunc(limit) || 20));
  // Resolve cursors within the account; a foreign cursor never discloses data.
  const cursor = before ? await db.customerNotification.findFirst({
    where: { id: before, userId }, select: { id: true, createdAt: true },
  }) : null;
  if (before && !cursor) return { items: [], nextCursor: null, unreadCount: await unreadCount(userId) };
  const rows = await db.customerNotification.findMany({
    where: {
      userId,
      ...(cursor ? { OR: [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ] } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], select, take: take + 1,
  });
  const more = rows.length > take;
  const items = rows.slice(0, take).map((row) => ({ ...row, actionUrl: safeNotificationUrl(row.actionUrl) }));
  return { items, nextCursor: more ? items.at(-1)!.id : null, unreadCount: await unreadCount(userId) };
}

export function unreadCount(userId: string) {
  return db.customerNotification.count({ where: { userId, readAt: null } });
}

export async function markNotificationRead(userId: string, id: string) {
  const row = await db.customerNotification.findFirst({ where: { id, userId }, select: { id: true } });
  if (!row) return false;
  await db.customerNotification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
  return true;
}

export async function markAllNotificationsRead(userId: string) {
  const result = await db.customerNotification.updateMany({
    where: { userId, readAt: null }, data: { readAt: new Date() },
  });
  return result.count;
}
