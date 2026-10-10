import assert from "node:assert/strict";
import { classifyEmailError, deliveryTransition, isNoticeCurrent, MAX_ATTEMPTS, safeNotificationUrl } from "../src/lib/notifications/policy";

const now = new Date("2026-10-09T10:00:00Z");
const rejection = classifyEmailError({ responseCode: 451 });
assert.equal(rejection.retryable, true);
const retry = deliveryTransition(rejection, 1, now);
assert.equal(retry.status, "QUEUED");
assert.equal(retry.nextAttemptAt.getTime() - now.getTime(), 30_000);
assert.equal(deliveryTransition(rejection, 2, now).nextAttemptAt.getTime() - now.getTime(), 60_000);
assert.equal(deliveryTransition(rejection, MAX_ATTEMPTS, now).status, "FAILED");
assert.equal(deliveryTransition(classifyEmailError({ responseCode: 550 }), 1, now).status, "FAILED");
assert.equal(deliveryTransition(classifyEmailError({ code: "EAUTH" }), 1, now).status, "FAILED");
assert.equal(deliveryTransition(classifyEmailError({ code: "ECONNREFUSED" }), 1, now).status, "QUEUED");
for (const code of ["ETIMEDOUT", "ECONNRESET", "ESOCKET", undefined]) {
  const result = classifyEmailError({ code, command: "DATA" });
  assert.equal(result.status, "UNKNOWN");
  assert.equal(deliveryTransition(result, 1, now).status, "UNKNOWN");
}
const accepted = deliveryTransition({ status: "ACCEPTED" }, 2, now);
assert.equal(accepted.status, "ACCEPTED");
assert.equal(accepted.acceptedAt, now);
assert.equal(accepted.lockToken, null);
assert.equal(deliveryTransition({ status: "SUPPRESSED", code: "STALE_ORDER_STATE" }, 1, now).status, "SUPPRESSED");
assert.equal(safeNotificationUrl("/orders/track?order=LX-123"), "/orders/track?order=LX-123");
for (const url of ["https://evil.example", "//evil.example", "/orders/track?order=LX-123&t=secret", "javascript:alert(1)"]) {
  assert.equal(safeNotificationUrl(url), "/account");
}

assert.equal(isNoticeCurrent("order.shipped", { status: "DELIVERED", paymentStatus: "SUCCESS" }), false);
assert.equal(isNoticeCurrent("order.shipped", { status: "SHIPPED", paymentStatus: "SUCCESS" }), true);
assert.equal(isNoticeCurrent("order.processing", { status: "CANCELLED", paymentStatus: "FAILED" }), false);
assert.equal(isNoticeCurrent("order.placed", { status: "PAID", paymentStatus: "SUCCESS" }), false);
assert.equal(isNoticeCurrent("payment.failed", { status: "PAID", paymentStatus: "SUCCESS" }), false);
assert.equal(isNoticeCurrent("payment.failed", { status: "CANCELLED", paymentStatus: "FAILED" }), false);
assert.equal(isNoticeCurrent("payment.failed", { status: "PENDING", paymentStatus: "FAILED" }), true);
assert.equal(isNoticeCurrent("custom.message", { status: "DELIVERED", paymentStatus: "SUCCESS" }), true);
console.log("Notification delivery policy checks passed.");
