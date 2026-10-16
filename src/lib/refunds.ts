import { db } from "./db";
import { formatMoney } from "./money";
import { notifyOrder } from "./notify";
import { postAlert } from "./agent/slack";
import { PaystackError, refundTransaction } from "./paystack";
import { restockUnits } from "./inventory";
import { logOrderEvent } from "./orders";
import type { Order, Refund } from "@/generated/prisma";

/**
 * Refunds.
 *
 * Every refund is a row in the `Refund` ledger against one payment. The amount
 * is claimed locally first (the order's running total and the payment's
 * refunded amount move in one transaction, conditionally), and only then is
 * Paystack asked to send the money. So two clicks, or two staff members at
 * once, can never both reach Paystack for the same money.
 *
 * The customer is told about a refund only once Paystack has accepted it, or
 * when staff record that they returned the money by hand. A refund Paystack
 * refuses is marked failed and its amount handed back, so the order never
 * claims money went back when it did not. Paystack settles accepted refunds
 * later by webhook (`refund.processed` / `refund.failed`).
 */

export type RefundMethod = "provider" | "manual";

export type RefundRequest = {
  orderId: string;
  /** Minor units. */
  amount: number;
  reason: string;
  actorId: string;
  /**
   * "provider": send it back through Paystack (card or MoMo payments only).
   * "manual": the money was already returned by hand (cash, MoMo, transfer).
   */
  method: RefundMethod;
  /** Units to put back on the shelf, per order line. */
  restock?: { orderItemId: string; quantity: number }[];
};

export type RefundResult = { ok: boolean; message: string; accepted: number };

type Chunk = { paymentId: string; reference: string; domain: string | null; amount: number };

/** Payment providers whose money Paystack can send back. */
function refundableThroughPaystack(payment: { provider: string; reference: string }): boolean {
  return payment.provider === "paystack" && !payment.reference.includes("-MANUAL-");
}

/** Recomputes an order's payment state from its ledger after money moved. */
export async function recomputeRefundState(orderId: string): Promise<void> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return;
  const sum = await db.payment.aggregate({
    where: { orderId, status: "SUCCESS" },
    _sum: { amount: true },
  });
  const received = sum._sum.amount ?? 0;
  if (received <= 0) return;

  const kept = received - order.refundedTotal;
  // What the customer was meant to have paid by now.
  const due = order.depositAmount && !order.balancePaidAt ? order.depositAmount : order.total;

  let paymentStatus = order.paymentStatus;
  let status = order.status;
  if (kept <= 0) {
    paymentStatus = "REFUNDED";
    status = "REFUNDED";
  } else if (order.refundedTotal > 0 && kept < due) {
    paymentStatus = "PARTIALLY_REFUNDED";
  } else {
    // Nothing refunded, or only money the order did not need (a duplicate).
    paymentStatus = "SUCCESS";
  }
  // A refund that failed after the order was marked refunded puts it back.
  if (order.status === "REFUNDED" && kept > 0) status = order.cancelledAt ? "CANCELLED" : "PAID";

  if (paymentStatus !== order.paymentStatus || status !== order.status) {
    await db.order.update({ where: { id: orderId }, data: { paymentStatus, status } });
  }
}

/**
 * Splits a refund across the order's payments, newest first, so an extra
 * (duplicate) payment is returned before the one the order needs.
 */
function allocate(
  payments: { id: string; reference: string; provider: string; domain: string | null; amount: number; refundedAmount: number }[],
  amount: number,
  method: RefundMethod,
): { chunks: Chunk[]; shortfall: number } {
  const chunks: Chunk[] = [];
  let left = amount;
  for (const payment of payments) {
    if (left <= 0) break;
    if (method === "provider" && !refundableThroughPaystack(payment)) continue;
    const available = payment.amount - payment.refundedAmount;
    if (available <= 0) continue;
    const take = Math.min(available, left);
    chunks.push({ paymentId: payment.id, reference: payment.reference, domain: payment.domain, amount: take });
    left -= take;
  }
  return { chunks, shortfall: left };
}

/** Gives a failed refund's amount back to the order and payment, once. */
async function failRefund(refund: Refund, reason: string): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const claimed = await tx.refund.updateMany({
      where: { id: refund.id, status: { in: ["PENDING", "PROCESSING"] } },
      data: { status: "FAILED", failureReason: reason.slice(0, 500) },
    });
    if (claimed.count === 0) return false;
    await tx.order.update({
      where: { id: refund.orderId },
      data: { refundedTotal: { decrement: refund.amount } },
    });
    if (refund.paymentId) {
      await tx.payment.update({
        where: { id: refund.paymentId },
        data: { refundedAmount: { decrement: refund.amount } },
      });
    }
    return true;
  });
}

/**
 * Puts refunded goods back on the shelf, per line, never more than was sold.
 * Only goods that actually left the shelf (`inventoryAppliedAt`) can return.
 */
async function restockLines(
  order: Pick<Order, "id" | "orderNumber" | "inventoryAppliedAt">,
  requested: { orderItemId: string; quantity: number }[],
  actorId: string,
): Promise<number> {
  if (!order.inventoryAppliedAt || requested.length === 0) return 0;
  const items = await db.orderItem.findMany({ where: { orderId: order.id } });
  let units = 0;
  for (const want of requested) {
    const item = items.find((i) => i.id === want.orderItemId);
    if (!item?.variantId) continue;
    const quantity = Math.min(Math.floor(want.quantity), item.quantity - item.quantityRestocked);
    if (!(quantity > 0)) continue;
    const claimed = await db.orderItem.updateMany({
      where: { id: item.id, quantityRestocked: { lte: item.quantity - quantity } },
      data: { quantityRestocked: { increment: quantity } },
    });
    if (claimed.count !== 1) continue;
    await restockUnits([{ variantId: item.variantId, quantity }], order.orderNumber, "RETURN", actorId);
    units += quantity;
  }

  // Everything is back: a later cancellation has nothing left to return.
  const remaining = await db.orderItem.count({
    where: { orderId: order.id, variantId: { not: null }, quantityRestocked: { lt: db.orderItem.fields.quantity } },
  });
  if (remaining === 0) {
    await db.order.update({ where: { id: order.id }, data: { inventoryAppliedAt: null } });
  }
  return units;
}

export async function refundOrder(request: RefundRequest): Promise<RefundResult> {
  const reason = request.reason.trim() || "Refunded by staff.";
  if (!Number.isSafeInteger(request.amount) || request.amount <= 0) {
    return { ok: false, message: "Enter an amount to refund.", accepted: 0 };
  }

  const order = await db.order.findUnique({
    where: { id: request.orderId },
    include: { payments: { where: { status: "SUCCESS" }, orderBy: { paidAt: "desc" } } },
  });
  if (!order) return { ok: false, message: "Order not found.", accepted: 0 };

  const received = order.payments.reduce((sum, p) => sum + p.amount, 0);
  const refundable = received - order.refundedTotal;
  if (refundable <= 0) return { ok: false, message: "Nothing is left to refund on this order.", accepted: 0 };
  if (request.amount > refundable) {
    return { ok: false, message: `You can refund at most ${formatMoney(refundable, order.currency)}.`, accepted: 0 };
  }

  const { chunks, shortfall } = allocate(order.payments, request.amount, request.method);
  if (shortfall > 0) {
    return {
      ok: false,
      message:
        request.method === "provider"
          ? `Only ${formatMoney(request.amount - shortfall, order.currency)} of this was paid through Paystack and can go back that way. Record the rest as returned by hand (cash, MoMo or transfer).`
          : `You can refund at most ${formatMoney(request.amount - shortfall, order.currency)}.`,
      accepted: 0,
    };
  }

  // Claim the money locally before anyone is asked to send it.
  let rows: Refund[];
  try {
    rows = await db.$transaction(async (tx) => {
      const moved = await tx.order.updateMany({
        where: { id: order.id, refundedTotal: { lte: received - request.amount } },
        data: { refundedTotal: { increment: request.amount } },
      });
      if (moved.count === 0) throw new Error("conflict");

      const created: Refund[] = [];
      for (const chunk of chunks) {
        const payment = order.payments.find((p) => p.id === chunk.paymentId)!;
        const claimed = await tx.payment.updateMany({
          where: { id: chunk.paymentId, refundedAmount: { lte: payment.amount - chunk.amount } },
          data: { refundedAmount: { increment: chunk.amount } },
        });
        if (claimed.count === 0) throw new Error("conflict");
        created.push(
          await tx.refund.create({
            data: {
              orderId: order.id,
              paymentId: chunk.paymentId,
              amount: chunk.amount,
              currency: order.currency,
              method: request.method === "manual" ? "manual" : "paystack",
              status: request.method === "manual" ? "PROCESSED" : "PENDING",
              processedAt: request.method === "manual" ? new Date() : null,
              reason,
              actorId: request.actorId,
            },
          }),
        );
      }
      return created;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "conflict") {
      return {
        ok: false,
        message: "Another refund was just made on this order. Refresh to see what is left to refund.",
        accepted: 0,
      };
    }
    throw error;
  }

  let accepted = 0;
  let unconfirmed = 0;
  const refusals: string[] = [];

  if (request.method === "manual") {
    accepted = request.amount;
  } else {
    for (const row of rows) {
      const chunk = chunks.find((c) => c.paymentId === row.paymentId)!;
      try {
        const sent = await refundTransaction({
          reference: chunk.reference,
          amount: row.amount,
          reason,
          mode: chunk.domain === "test" || chunk.domain === "live" ? chunk.domain : null,
        });
        await db.refund.update({
          where: { id: row.id },
          data: {
            status: sent.status === "processed" ? "PROCESSED" : "PROCESSING",
            providerRefundId: sent.id ? String(sent.id) : null,
            ...(sent.status === "processed" ? { processedAt: new Date() } : {}),
          },
        });
        accepted += row.amount;
      } catch (error) {
        if (error instanceof PaystackError && error.timedOut) {
          // Paystack may have queued it. Leave it pending: the refund webhook,
          // or a look at the dashboard, settles it. The customer is not told yet.
          unconfirmed += row.amount;
          await db.refund.update({
            where: { id: row.id },
            data: { failureReason: "No answer from Paystack. Check the Paystack dashboard before trying again." },
          });
          continue;
        }
        const message = error instanceof Error ? error.message : "Paystack refused the refund.";
        await failRefund(row, message);
        refusals.push(message);
      }
    }
  }

  await recomputeRefundState(order.id);

  let restocked = 0;
  if (accepted + unconfirmed > 0 && request.restock?.length) {
    restocked = await restockLines(order, request.restock, request.actorId);
  }

  if (accepted > 0) {
    await logOrderEvent({
      orderId: order.id,
      type: "order.refunded",
      message:
        request.method === "manual"
          ? `Refund of ${formatMoney(accepted, order.currency)} recorded as returned by hand. ${reason}`
          : `Refund of ${formatMoney(accepted, order.currency)} sent to Paystack. ${reason}`,
      actorId: request.actorId,
      meta: { amount: accepted, method: request.method, restockedUnits: restocked },
    });
    await notifyOrder(order.id, { kind: "order.refunded", amount: accepted });
  }
  if (unconfirmed > 0) {
    await logOrderEvent({
      orderId: order.id,
      type: "refund.unconfirmed",
      message: `Refund of ${formatMoney(unconfirmed, order.currency)}: Paystack did not answer. Check the Paystack dashboard; the refund webhook will settle it.`,
      actorId: request.actorId,
    });
  }
  if (refusals.length > 0) {
    await logOrderEvent({
      orderId: order.id,
      type: "refund.failed",
      message: `Paystack refused a refund: ${refusals.join("; ")}. Nothing was recorded as refunded for that part.`,
      actorId: request.actorId,
    });
  }

  const parts: string[] = [];
  if (accepted > 0) {
    parts.push(
      request.method === "manual"
        ? `Refund of ${formatMoney(accepted, order.currency)} recorded.`
        : `Refund of ${formatMoney(accepted, order.currency)} sent to Paystack.`,
    );
  }
  if (unconfirmed > 0) {
    parts.push(`${formatMoney(unconfirmed, order.currency)} is waiting on Paystack, which did not answer; check the dashboard before retrying.`);
  }
  if (refusals.length > 0) {
    parts.push(`Paystack refused ${refusals.length > 1 ? "some of it" : "it"} (${refusals.join("; ")}). That part was not recorded and the customer was not told.`);
  }
  if (restocked > 0) parts.push(`${restocked} unit${restocked === 1 ? "" : "s"} back in stock.`);

  return { ok: refusals.length === 0, message: parts.join(" "), accepted };
}

/**
 * Applies Paystack's refund webhooks to the ledger. A refund made straight
 * from the Paystack dashboard has no row yet; it is recorded here so the
 * order still adds up.
 */
export async function applyRefundWebhook(args: {
  event: string;
  reference: string;
  amount: number | null;
  providerRefundId: string | null;
  reason: string | null;
}): Promise<void> {
  const payment = await db.payment.findUnique({
    where: { reference: args.reference },
    include: { order: { select: { id: true, orderNumber: true, currency: true } } },
  });
  if (!payment) return;
  const order = payment.order;

  const open = await db.refund.findMany({
    where: { paymentId: payment.id, method: "paystack", status: { in: ["PENDING", "PROCESSING"] } },
    orderBy: { createdAt: "asc" },
  });
  const match =
    (args.providerRefundId ? open.find((r) => r.providerRefundId === args.providerRefundId) : undefined) ??
    (args.amount !== null ? open.find((r) => r.amount === args.amount) : undefined) ??
    open[0];

  if (args.event === "refund.failed") {
    if (!match) return;
    const failed = await failRefund(match, args.reason ?? "Paystack could not complete the refund.");
    if (!failed) return;
    await recomputeRefundState(order.id);
    await logOrderEvent({
      orderId: order.id,
      type: "refund.failed",
      message: `Paystack could not complete the refund of ${formatMoney(match.amount, order.currency)}${args.reason ? ` (${args.reason})` : ""}. The customer has not been paid back; refund them another way.`,
      meta: { reference: args.reference, refundId: match.id },
    });
    await postAlert(
      `:rotating_light: Refund of ${formatMoney(match.amount, order.currency)} on ${order.orderNumber} FAILED at Paystack. The customer has not been paid back.`,
    );
    return;
  }

  if (args.event === "refund.processed") {
    if (match) {
      const done = await db.refund.updateMany({
        where: { id: match.id, status: { in: ["PENDING", "PROCESSING"] } },
        data: { status: "PROCESSED", processedAt: new Date(), failureReason: null },
      });
      if (done.count === 1) {
        await logOrderEvent({
          orderId: order.id,
          type: "refund.processed",
          message: `Paystack completed the refund of ${formatMoney(match.amount, order.currency)}.`,
          meta: { reference: args.reference, refundId: match.id },
        });
      }
      return;
    }
    await recordDashboardRefund(payment, order, args);
    return;
  }

  // refund.pending / refund.processing: Paystack has it.
  if (match && match.status === "PENDING") {
    await db.refund.update({ where: { id: match.id }, data: { status: "PROCESSING", failureReason: null } });
  }
}

/** A refund made in the Paystack dashboard, recorded once. */
async function recordDashboardRefund(
  payment: { id: string; amount: number; refundedAmount: number },
  order: { id: string; orderNumber: string; currency: string },
  args: { reference: string; amount: number | null; providerRefundId: string | null },
): Promise<void> {
  if (!args.amount || args.amount <= 0) return;
  const key = args.providerRefundId ?? `${args.reference}:${args.amount}`;
  const seen = await db.refund.findFirst({ where: { paymentId: payment.id, providerRefundId: key } });
  if (seen) return;

  const amount = Math.min(args.amount, Math.max(0, payment.amount - payment.refundedAmount));
  if (amount <= 0) return;
  await db.$transaction([
    db.refund.create({
      data: {
        orderId: order.id,
        paymentId: payment.id,
        amount,
        currency: order.currency,
        method: "paystack",
        status: "PROCESSED",
        processedAt: new Date(),
        providerRefundId: key,
        reason: "Refunded from the Paystack dashboard.",
      },
    }),
    db.payment.update({ where: { id: payment.id }, data: { refundedAmount: { increment: amount } } }),
    db.order.update({ where: { id: order.id }, data: { refundedTotal: { increment: amount } } }),
  ]);
  await recomputeRefundState(order.id);
  await logOrderEvent({
    orderId: order.id,
    type: "refund.processed",
    message: `Paystack refunded ${formatMoney(amount, order.currency)} (made from the Paystack dashboard).`,
    meta: { reference: args.reference },
  });
  await postAlert(`:information_source: ${order.orderNumber}: ${formatMoney(amount, order.currency)} was refunded from the Paystack dashboard and is now on the order.`);
}
