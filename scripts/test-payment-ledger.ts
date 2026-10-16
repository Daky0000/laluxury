/**
 * Payment ledger regression tests (docs/PAYMENT_AUDIT_2026-10-16.md).
 *
 * Runs the real settlement, cancellation, refund and stock services against a
 * DISPOSABLE database: it creates and deletes its own products and orders.
 * It refuses to run unless PAYMENT_TEST_DATABASE=1 is set, so it can never be
 * pointed at production by accident.
 *
 *   PAYMENT_TEST_DATABASE=1 DATABASE_URL=postgres://.../scratch AUTH_SECRET=x \
 *     npx tsx scripts/test-payment-ledger.ts
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

if (process.env.PAYMENT_TEST_DATABASE !== "1") {
  console.error("Refusing to run: set PAYMENT_TEST_DATABASE=1 and point DATABASE_URL at a disposable database.");
  process.exit(1);
}

async function main() {
  const { db } = await import("../src/lib/db");
  const orders = await import("../src/lib/orders");
  const { refundOrder, applyRefundWebhook } = await import("../src/lib/refunds");
  const { reserveStock } = await import("../src/lib/inventory");
  const { recordRedemption, validateDiscount } = await import("../src/lib/discounts");
  const { newPaymentReference } = await import("../src/lib/payment-reference");

  const tag = randomUUID().slice(0, 8).toUpperCase();
  const createdOrderIds: string[] = [];
  let passed = 0;
  const test = async (name: string, fn: () => Promise<void>) => {
    await fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  };

  // --- Fixtures -------------------------------------------------------------
  const product = await db.product.create({
    data: {
      title: `Ledger test ${tag}`,
      slug: `ledger-test-${tag.toLowerCase()}`,
      status: "ACTIVE",
      variants: {
        create: {
          title: "Default",
          sku: `LEDGER-${tag}`,
          price: 10_000,
          inventory: { create: { onHand: 20, trackInventory: true } },
        },
      },
    },
    include: { variants: { include: { inventory: true } } },
  });
  const variant = product.variants[0];
  const stock = async () => db.inventoryItem.findUniqueOrThrow({ where: { variantId: variant.id } });

  async function makeOrder(opts: {
    quantity?: number;
    reserve?: boolean;
    source?: string;
    depositAmount?: number | null;
    placedAt?: Date;
  } = {}) {
    const quantity = opts.quantity ?? 1;
    const total = 10_000 * quantity;
    const orderNumber = await orders.uniqueOrderNumber();
    const order = await db.order.create({
      data: {
        orderNumber,
        email: `ledger-${tag.toLowerCase()}@example.test`,
        status: "PENDING",
        paymentStatus: "PENDING",
        source: opts.source ?? "checkout",
        subtotal: total,
        total,
        depositAmount: opts.depositAmount ?? null,
        hasPreorderItems: Boolean(opts.depositAmount),
        ...(opts.placedAt ? { placedAt: opts.placedAt } : {}),
        items: {
          create: {
            variantId: variant.id,
            productId: product.id,
            productTitle: product.title,
            variantTitle: "Default",
            sku: variant.sku,
            quantity,
            unitPrice: 10_000,
            total,
          },
        },
      },
    });
    createdOrderIds.push(order.id);
    if (opts.reserve !== false) {
      await reserveStock([{ variantId: variant.id, quantity }], order.orderNumber);
      await db.order.update({ where: { id: order.id }, data: { stockReservedAt: new Date() } });
    }
    return order;
  }

  async function pendingPayment(orderId: string, orderNumber: string, amount: number, purpose?: string) {
    return db.payment.create({
      data: {
        orderId,
        reference: newPaymentReference(orderNumber),
        provider: "paystack",
        amount,
        currency: "GHS",
        status: "PENDING",
        purpose: purpose ?? null,
        domain: "live",
      },
    });
  }

  const events = (orderId: string, type: string) => db.orderEvent.count({ where: { orderId, type } });

  try {
    console.log("\nPayment ledger");

    await test("first payment settles the order once, from its reservation", async () => {
      const before = await stock();
      const order = await makeOrder();
      const payment = await pendingPayment(order.id, order.orderNumber, 10_000, "FULL");
      // Webhook, confirmation page and app poll all at once.
      await Promise.all(
        [0, 1, 2].map(() =>
          orders.markOrderPaid({ orderId: order.id, reference: payment.reference, amount: 10_000, channel: "card" }),
        ),
      );
      const fresh = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      assert.equal(fresh.status, "PAID");
      assert.equal(fresh.paymentStatus, "SUCCESS");
      assert.ok(fresh.inventoryAppliedAt);
      assert.equal(fresh.stockReservedAt, null);
      assert.ok(fresh.paidEffectsDoneAt, "post-payment steps all ran");
      assert.equal(await events(order.id, "payment.success"), 1);
      const after = await stock();
      assert.equal(after.onHand, before.onHand - 1);
      assert.equal(after.reserved, before.reserved);
    });

    await test("a second payment on a paid order is recorded, held and raised", async () => {
      const order = await makeOrder();
      const first = await pendingPayment(order.id, order.orderNumber, 10_000, "FULL");
      const second = await pendingPayment(order.id, order.orderNumber, 10_000, "FULL");
      await orders.markOrderPaid({ orderId: order.id, reference: first.reference, amount: 10_000 });
      const outcome = await orders.markOrderPaid({ orderId: order.id, reference: second.reference, amount: 10_000 });
      assert.equal(outcome.duplicate, true);
      const dup = await db.payment.findUniqueOrThrow({ where: { reference: second.reference } });
      assert.equal(dup.status, "SUCCESS");
      assert.ok(dup.heldAt);
      assert.equal(await events(order.id, "payment.duplicate"), 1);
      // Replays do not raise it again.
      await orders.markOrderPaid({ orderId: order.id, reference: second.reference, amount: 10_000 });
      assert.equal(await events(order.id, "payment.duplicate"), 1);
    });

    await test("deposit then balance; a third payment is a duplicate", async () => {
      const order = await makeOrder({ depositAmount: 5_000 });
      const deposit = await pendingPayment(order.id, order.orderNumber, 5_000, "DEPOSIT");
      await orders.markOrderPaid({ orderId: order.id, reference: deposit.reference, amount: 5_000 });
      let fresh = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      assert.equal(fresh.status, "PAID");
      assert.equal(fresh.balancePaidAt, null);
      assert.equal(orders.outstandingBalance(fresh), 5_000);

      // A deposit approved twice is not mistaken for the balance.
      const depositAgain = await pendingPayment(order.id, order.orderNumber, 5_000, "DEPOSIT");
      const again = await orders.markOrderPaid({ orderId: order.id, reference: depositAgain.reference, amount: 5_000 });
      assert.equal(again.duplicate, true);

      const balance = await pendingPayment(order.id, order.orderNumber, 5_000, "BALANCE");
      await orders.markOrderPaid({ orderId: order.id, reference: balance.reference, amount: 5_000 });
      fresh = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      assert.ok(fresh.balancePaidAt);

      const extra = await pendingPayment(order.id, order.orderNumber, 5_000, "BALANCE");
      const out = await orders.markOrderPaid({ orderId: order.id, reference: extra.reference, amount: 5_000 });
      assert.equal(out.duplicate, true);
    });

    await test("cancel and pay racing never lose the money or the stock count", async () => {
      const seen = { cancelledThenPaid: 0, paid: 0 };
      for (let round = 0; round < 12; round += 1) {
        const before = await stock();
        const order = await makeOrder();
        const payment = await pendingPayment(order.id, order.orderNumber, 10_000, "FULL");
        const jitter = () => new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 6)));
        const cancel = async () => {
          await jitter();
          return orders.cancelOrder(order.id, "Checkout expired without payment.", null, { notify: false, expectUnpaid: true });
        };
        const pay = async () => {
          await jitter();
          return orders.markOrderPaid({ orderId: order.id, reference: payment.reference, amount: 10_000 });
        };
        await Promise.allSettled(round % 2 === 0 ? [cancel(), pay()] : [pay(), cancel()]);
        const fresh = await db.order.findUniqueOrThrow({ where: { id: order.id } });
        const after = await stock();
        assert.equal(fresh.paymentStatus, "SUCCESS", "the payment is always on file");
        if (fresh.status === "CANCELLED") {
          assert.equal(await events(order.id, "payment.after_cancel"), 1, "a paid cancelled order is flagged");
          assert.equal(after.onHand, before.onHand, "stock was released, not sold");
          seen.cancelledThenPaid += 1;
        } else {
          assert.equal(fresh.status, "PAID");
          assert.equal(after.onHand, before.onHand - 1);
          seen.paid += 1;
        }
        assert.equal(after.reserved, before.reserved, "no reservation leaks");
      }
      console.log(`        (outcomes: ${seen.paid} paid first, ${seen.cancelledThenPaid} cancelled first then flagged)`);
    });

    await test("a staff order without a reservation sells from the shelf only", async () => {
      // Someone else holds one unit.
      const shopper = await makeOrder();
      const before = await stock();
      const pos = await makeOrder({ reserve: false, source: "pos" });
      await orders.markOrderPaid({
        orderId: pos.id,
        reference: newPaymentReference(pos.orderNumber, "POS"),
        amount: 10_000,
        provider: "pos",
        purpose: "FULL",
      });
      const after = await stock();
      assert.equal(after.onHand, before.onHand - 1);
      assert.equal(after.reserved, before.reserved, "the shopper's hold is untouched");
      const payment = await db.payment.findFirstOrThrow({ where: { orderId: pos.id } });
      assert.equal(payment.provider, "pos");
      await orders.cancelOrder(shopper.id, "test", null, { notify: false });
    });

    await test("only shopper checkouts expire; staff orders wait", async () => {
      const old = new Date(Date.now() - 7 * 60 * 60 * 1000);
      const checkout = await makeOrder({ placedAt: old });
      const console_ = await makeOrder({ placedAt: old, reserve: false, source: "console" });
      await orders.expireStalePendingOrders(500);
      assert.equal((await db.order.findUniqueOrThrow({ where: { id: checkout.id } })).status, "CANCELLED");
      assert.equal((await db.order.findUniqueOrThrow({ where: { id: console_.id } })).status, "PENDING");
    });

    await test("manual refund with partial restock, then cancel restocks only the rest", async () => {
      const order = await makeOrder({ quantity: 2 });
      const payment = await pendingPayment(order.id, order.orderNumber, 20_000, "FULL");
      await orders.markOrderPaid({ orderId: order.id, reference: payment.reference, amount: 20_000 });
      const sold = await stock();
      const item = await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } });

      const result = await refundOrder({
        orderId: order.id,
        amount: 10_000,
        reason: "One piece returned",
        actorId: "test",
        method: "manual",
        restock: [{ orderItemId: item.id, quantity: 1 }],
      });
      assert.equal(result.ok, true);
      assert.equal(result.accepted, 10_000);
      let fresh = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      assert.equal(fresh.refundedTotal, 10_000);
      assert.equal(fresh.paymentStatus, "PARTIALLY_REFUNDED");
      assert.equal((await stock()).onHand, sold.onHand + 1);

      const { refundOwed } = await orders.cancelOrder(order.id, "Customer cancelled", "test", { notify: false });
      assert.equal(refundOwed, 10_000);
      assert.equal(await events(order.id, "refund.due"), 1);
      assert.equal((await stock()).onHand, sold.onHand + 2, "the second unit only, not the first again");

      // Refunding the rest with restock puts nothing back twice.
      await refundOrder({
        orderId: order.id,
        amount: 10_000,
        reason: "Rest",
        actorId: "test",
        method: "manual",
        restock: [{ orderItemId: item.id, quantity: 2 }],
      });
      fresh = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      assert.equal(fresh.paymentStatus, "REFUNDED");
      assert.equal((await stock()).onHand, sold.onHand + 2);
    });

    await test("a refund Paystack refuses is not recorded and the customer is not told", async () => {
      const order = await makeOrder();
      const payment = await pendingPayment(order.id, order.orderNumber, 10_000, "FULL");
      await orders.markOrderPaid({ orderId: order.id, reference: payment.reference, amount: 10_000 });
      // No Paystack key is configured here, so Paystack "refuses".
      const result = await refundOrder({ orderId: order.id, amount: 10_000, reason: "x", actorId: "test", method: "provider" });
      assert.equal(result.ok, false);
      assert.equal(result.accepted, 0);
      const fresh = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      assert.equal(fresh.refundedTotal, 0);
      assert.equal(fresh.paymentStatus, "SUCCESS");
      assert.equal((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).refundedAmount, 0);
      assert.equal(await events(order.id, "order.refunded"), 0);
      assert.equal(await db.refund.count({ where: { orderId: order.id, status: "FAILED" } }), 1);
    });

    await test("manual money cannot be refunded through Paystack", async () => {
      const order = await makeOrder({ reserve: false, source: "console" });
      await orders.markOrderPaid({
        orderId: order.id,
        reference: newPaymentReference(order.orderNumber, "MANUAL"),
        amount: 10_000,
        provider: "manual",
        purpose: "FULL",
      });
      const result = await refundOrder({ orderId: order.id, amount: 5_000, reason: "x", actorId: "test", method: "provider" });
      assert.equal(result.ok, false);
      assert.match(result.message, /by hand/);
    });

    await test("refund webhooks settle and roll back the ledger", async () => {
      const order = await makeOrder();
      const payment = await pendingPayment(order.id, order.orderNumber, 10_000, "FULL");
      await orders.markOrderPaid({ orderId: order.id, reference: payment.reference, amount: 10_000 });
      // A refund Paystack accepted (as the admin action would leave it).
      await db.$transaction([
        db.order.update({ where: { id: order.id }, data: { refundedTotal: 4_000 } }),
        db.payment.update({ where: { id: payment.id }, data: { refundedAmount: 4_000 } }),
        db.refund.create({
          data: { orderId: order.id, paymentId: payment.id, amount: 4_000, method: "paystack", status: "PROCESSING", reason: "x", providerRefundId: "991" },
        }),
      ]);
      await applyRefundWebhook({ event: "refund.failed", reference: payment.reference, amount: 4_000, providerRefundId: "991", reason: "bank rejected" });
      let fresh = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      assert.equal(fresh.refundedTotal, 0);
      assert.equal(await events(order.id, "refund.failed"), 1);
      // Replayed: nothing moves twice.
      await applyRefundWebhook({ event: "refund.failed", reference: payment.reference, amount: 4_000, providerRefundId: "991", reason: "bank rejected" });
      fresh = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      assert.equal(fresh.refundedTotal, 0);

      // A refund made in the Paystack dashboard lands on the order once.
      await applyRefundWebhook({ event: "refund.processed", reference: payment.reference, amount: 2_500, providerRefundId: "dash-1", reason: null });
      await applyRefundWebhook({ event: "refund.processed", reference: payment.reference, amount: 2_500, providerRefundId: "dash-1", reason: null });
      fresh = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      assert.equal(fresh.refundedTotal, 2_500);
      assert.equal(fresh.paymentStatus, "PARTIALLY_REFUNDED");
    });

    await test("unfinished paid work is completed by the sweep", async () => {
      const order = await makeOrder();
      const payment = await pendingPayment(order.id, order.orderNumber, 10_000, "FULL");
      await orders.markOrderPaid({ orderId: order.id, reference: payment.reference, amount: 10_000 });
      // Pretend the stock commit and two steps never happened.
      await db.order.update({
        where: { id: order.id },
        data: {
          inventoryAppliedAt: null,
          stockReservedAt: null,
          paidEffectsDoneAt: null,
          paidEffects: { set: ["account", "discount", "cart", "event", "crm", "alert", "analytics", "push"] },
          paidAt: new Date(Date.now() - 10 * 60 * 1000),
        },
      });
      const before = await stock();
      await orders.retryUnfinishedPaidWork(500);
      const fresh = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      assert.ok(fresh.inventoryAppliedAt);
      assert.ok(fresh.paidEffectsDoneAt);
      assert.equal(await events(order.id, "payment.success"), 1, "steps already done are not repeated");
      assert.equal((await stock()).onHand, before.onHand - 1);
    });

    await test("discount limits count open checkouts and flag over-redemption", async () => {
      const code = `LEDGER${tag}`;
      const discount = await db.discount.create({
        data: { code, type: "FIXED_AMOUNT", value: 1_000, usageLimit: 1 },
      });
      const line = [{ variantId: variant.id, productId: product.id, categoryIds: [], quantity: 1, unitPrice: 10_000 }];
      const ctx = { lines: line, subtotal: 10_000, shippingTotal: 0 };
      assert.equal((await validateDiscount(code, ctx)).ok, true);
      const open = await makeOrder();
      await db.order.update({ where: { id: open.id }, data: { discountId: discount.id } });
      assert.equal((await validateDiscount(code, ctx)).ok, false, "an unpaid checkout holds the only use");
      assert.equal((await validateDiscount(code, { ...ctx, excludeOrderId: open.id })).ok, true);

      const a = await makeOrder();
      const b = await makeOrder();
      assert.deepEqual(await recordRedemption({ discountId: discount.id, orderId: a.id, amount: 1_000 }), { recorded: true, overLimit: false });
      assert.deepEqual(await recordRedemption({ discountId: discount.id, orderId: b.id, amount: 1_000 }), { recorded: true, overLimit: true });
      assert.deepEqual(await recordRedemption({ discountId: discount.id, orderId: b.id, amount: 1_000 }), { recorded: false, overLimit: false });
      await db.order.updateMany({ where: { discountId: discount.id }, data: { discountId: null } });
      await db.discount.delete({ where: { id: discount.id } });
    });

    console.log(`\n${passed} passed`);
  } finally {
    await db.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    await db.inventoryMovement.deleteMany({ where: { inventoryItem: { variantId: variant.id } } });
    await db.product.delete({ where: { id: product.id } }).catch(() => {});
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
