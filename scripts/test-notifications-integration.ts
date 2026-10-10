import assert from "node:assert/strict";

// This script never runs against the configured commerce database.
const url = process.env.NOTIFICATION_TEST_DATABASE_URL;
if (!url) throw new Error("Set NOTIFICATION_TEST_DATABASE_URL to an isolated local test database.");
const parsed = new URL(url);
if (!["127.0.0.1", "localhost"].includes(parsed.hostname) || parsed.pathname !== "/noble_notifications_test") {
  throw new Error("Notification integration tests require the isolated local noble_notifications_test database.");
}
process.env.DATABASE_URL = url;
process.env.AUTH_SECRET = "notification-browser-test-secret-only";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3016";

async function main() {
  const { db } = await import("../src/lib/db");
  const { enqueueNotification } = await import("../src/lib/notifications/queue");
  const { claimDelivery, finishDelivery } = await import("../src/lib/notifications/worker");
  const { listNotifications, markNotificationRead, markAllNotificationsRead } = await import("../src/lib/notifications/inbox");
  const { pruneNotificationContent } = await import("../src/lib/notifications/retention");
  try {
    await db.customerNotification.deleteMany();
    const owner = await db.user.create({ data: { firstName: "Notification test" } });
    const stranger = await db.user.create({ data: { firstName: "Other notification test" } });
    const order = await db.order.create({ data: {
      userId: owner.id, orderNumber: `TEST-${Date.now()}`, email: "test@example.invalid",
      subtotal: 100, shippingTotal: 0, total: 100,
    } });
    const input = {
      orderId: order.id, userId: owner.id, eventKey: "order.placed", dedupeKey: `${order.id}:order.placed`,
      title: "Order received", body: "Your order is recorded.", actionUrl: `/orders/track?order=${order.orderNumber}`,
      deliveries: [
        { channel: "EMAIL" as const, destination: "test@example.invalid", subject: "Order", body: "Test fixture" },
        { channel: "SMS" as const, destination: "233000000000", subject: "Order", body: "Test fixture" },
      ],
    };
    // Only enqueue/claim/finish are exercised. No provider adapter is called.
    await Promise.all(Array.from({ length: 8 }, () => enqueueNotification(input)));
    assert.equal(await db.customerNotification.count({ where: { orderId: order.id } }), 1);
    assert.equal(await db.notificationDelivery.count({ where: { notification: { orderId: order.id } } }), 2);
    const inbox = await listNotifications(owner.id);
    const notice = inbox.items[0];
    assert.equal(inbox.unreadCount, 1);
    assert.equal((await listNotifications(stranger.id)).items.length, 0);
    assert.equal(await markNotificationRead(stranger.id, notice.id), false);
    assert.equal((await listNotifications(stranger.id, notice.id)).items.length, 0);
    assert.equal(await markNotificationRead(owner.id, notice.id), true);
    assert.equal(await markNotificationRead(owner.id, notice.id), true);
    assert.equal((await listNotifications(owner.id)).unreadCount, 0);

    const claims = await Promise.all(Array.from({ length: 4 }, () => claimDelivery()));
    const jobs = claims.filter((job) => job !== null);
    assert.equal(jobs.length, 2);
    assert.equal(new Set(jobs.map((job) => job.id)).size, 2);
    await finishDelivery(jobs[0], { status: "ACCEPTED" });
    await finishDelivery(jobs[0], { status: "FAILED", retryable: true, code: "LATE_WORKER" });
    assert.equal((await db.notificationDelivery.findUniqueOrThrow({ where: { id: jobs[0].id } })).status, "ACCEPTED");
    await finishDelivery(jobs[1], { status: "FAILED", retryable: true, code: "SMTP_451" });
    assert.equal((await db.notificationDelivery.findUniqueOrThrow({ where: { id: jobs[1].id } })).status, "QUEUED");
    assert.equal(await claimDelivery(), null);
    await db.notificationDelivery.update({ where: { id: jobs[1].id }, data: { nextAttemptAt: new Date(0) } });
    const retried = await claimDelivery();
    assert.ok(retried);
    assert.equal(retried.attemptCount, 2);
    await db.notificationDelivery.update({ where: { id: retried.id }, data: { lockedAt: new Date(0) } });
    assert.equal(await claimDelivery(), null);
    assert.equal((await db.notificationDelivery.findUniqueOrThrow({ where: { id: retried.id } })).status, "UNKNOWN");
    assert.equal((await db.notificationAttempt.findUniqueOrThrow({ where: { deliveryId_number: { deliveryId: retried.id, number: 2 } } })).status, "UNKNOWN");
    await finishDelivery(retried, { status: "ACCEPTED" });
    assert.equal((await db.notificationDelivery.findUniqueOrThrow({ where: { id: retried.id } })).status, "UNKNOWN");

    const sameTime = new Date();
    await db.customerNotification.createMany({ data: Array.from({ length: 3 }, (_, index) => ({
      id: `page-${owner.id}-${index}`, userId: owner.id, orderId: order.id,
      dedupeKey: `page-${owner.id}-${index}`, eventKey: "order.shipped", title: "Shipment", body: "Shipped",
      actionUrl: "https://untrusted.example", createdAt: sameTime,
    })) });
    const page1 = await listNotifications(owner.id, undefined, 2);
    assert.ok(page1.nextCursor);
    const page2 = await listNotifications(owner.id, page1.nextCursor, 2);
    assert.equal(new Set([...page1.items, ...page2.items].map((row) => row.id)).size, 4);
    assert.equal(page1.items[0].actionUrl, "/account");
    assert.equal(await markAllNotificationsRead(stranger.id), 0);
    assert.equal(await markAllNotificationsRead(owner.id), 3);

    const old = new Date(Date.now() - 200 * 24 * 60 * 60_000);
    const retention = await db.customerNotification.create({ data: {
      userId: owner.id, orderId: order.id, eventKey: "order.receipt", dedupeKey: `retention-${owner.id}`,
      title: "Receipt", body: "Receipt available", actionUrl: "/account",
      deliveries: { create: { channel: "EMAIL", destination: "test@example.invalid", subject: "Receipt", body: "Private test content", status: "ACCEPTED", updatedAt: old } },
    }, include: { deliveries: true } });
    await db.customerNotification.create({ data: {
      userId: owner.id, orderId: order.id, eventKey: "order.receipt", dedupeKey: `expired-${owner.id}`,
      title: "Old receipt", body: "Receipt available", actionUrl: "/account", createdAt: old,
    } });
    const cleanup = await pruneNotificationContent();
    assert.ok(cleanup.scrubbed >= 1);
    assert.equal(cleanup.deleted, 1);
    const redacted = await db.notificationDelivery.findUniqueOrThrow({ where: { id: retention.deliveries[0].id } });
    assert.equal(redacted.body, "");
    assert.equal(redacted.destination, "");
    assert.equal(redacted.status, "ACCEPTED");

    const base = process.env.NOTIFICATION_TEST_BASE_URL;
    if (base) {
      const origin = new URL(base);
      assert.ok(["127.0.0.1", "localhost"].includes(origin.hostname));
      const { SignJWT } = await import("jose");
      const tokenFor = (userId: string) => new SignJWT({ userId, role: "CUSTOMER" })
        .setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m")
        .sign(new TextEncoder().encode("notification-browser-test-secret-only"));
      const ownerToken = await tokenFor(owner.id);
      const strangerToken = await tokenFor(stranger.id);
      const ownerHeaders = { Authorization: `Bearer ${ownerToken}` };
      assert.equal((await fetch(`${base}/api/app/notifications`)).status, 401);
      const listing = await fetch(`${base}/api/app/notifications`, { headers: ownerHeaders });
      assert.equal(listing.status, 200);
      assert.equal(listing.headers.get("cache-control"), "private, no-store");
      const foreignRead = await fetch(`${base}/api/app/notifications/${notice.id}/read`, {
        method: "PATCH", headers: { Authorization: `Bearer ${strangerToken}` },
      });
      assert.equal(foreignRead.status, 404);
      const ownRead = await fetch(`${base}/api/app/notifications/${notice.id}/read`, { method: "PATCH", headers: ownerHeaders });
      assert.equal(ownRead.status, 200);
      await db.user.update({ where: { id: owner.id }, data: { isActive: false } });
      assert.equal((await fetch(`${base}/api/app/notifications/unread-count`, { headers: ownerHeaders })).status, 401);
      await db.user.update({ where: { id: owner.id }, data: { isActive: true } });
      assert.equal((await fetch(`${base}/api/cron/notifications`, { method: "POST", headers: { Authorization: "Bearer invalid-test-secret" } })).status, 401);
      console.log("Notification HTTP authentication, ownership, caching and cron checks passed.");
    }
    const { notifyOrder } = await import("../src/lib/notify");
    assert.equal((await notifyOrder(order.id, { kind: "order.placed" })).ok, true);
    assert.equal((await notifyOrder(order.id, { kind: "order.placed" })).ok, true);
    assert.equal(await db.customerNotification.count({ where: { dedupeKey: `${order.id}:order.placed:lifecycle` } }), 1);
    const composed = await db.customerNotification.findUniqueOrThrow({ where: { dedupeKey: `${order.id}:order.placed:lifecycle` } });
    assert.ok(!composed.body.includes("&t="));
    const receiptsBefore = await db.customerNotification.count({ where: { orderId: order.id, eventKey: "order.receipt" } });
    await notifyOrder(order.id, { kind: "order.receipt" });
    await notifyOrder(order.id, { kind: "order.receipt" });
    assert.equal(await db.customerNotification.count({ where: { orderId: order.id, eventKey: "order.receipt" } }), receiptsBefore + 2);
    console.log("PostgreSQL notification integration checks passed: deduplication, concurrent claims, retry, stale locks, fencing, pagination and ownership.");
  } finally { await db.$disconnect(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
