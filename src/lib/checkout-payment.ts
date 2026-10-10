import { db } from "./db";
import { verifyTransaction } from "./paystack";
import { cancelOrder, logOrderEvent, markOrderPaid, markPaymentFailed } from "./orders";
import { postAlert } from "./agent/slack";
import { formatMoney } from "./money";

export type PaymentOutcome = "paid" | "failed" | "pending" | "held";

/**
 * Asks the payment provider where a storefront payment stands and records the
 * answer.
 *
 * The webhook is the authoritative path, but the shopper often arrives first
 * and expects an answer, so the confirmation page and a repeat checkout from
 * the same bag verify directly too. Every route funnels into the same
 * idempotent `markOrderPaid`, so whichever lands first wins and the rest are
 * no-ops. Throws when the provider cannot be reached.
 */
export async function reconcilePaystackPayment(
  payment: {
    orderId: string;
    orderNumber: string;
    reference: string;
    amount: number;
    currency: string;
  },
  options: { recordFailure?: boolean } = {},
): Promise<PaymentOutcome> {
  const { orderId, reference } = payment;
  const transaction = await verifyTransaction(reference);

  if (transaction.status === "success") {
    if (
      transaction.amount !== payment.amount ||
      transaction.currency.toUpperCase() !== payment.currency.toUpperCase()
    ) {
      const held = await db.orderEvent.findFirst({
        where: { orderId, type: "payment.mismatch" },
        select: { id: true },
      });
      if (!held) {
        await logOrderEvent({
          orderId,
          type: "payment.mismatch",
          message: `Payment provider reported ${formatMoney(transaction.amount, transaction.currency)} but the expected payment is ${formatMoney(payment.amount, payment.currency)}. Held for review.`,
          meta: { reference, reported: transaction.amount, expected: payment.amount, reportedCurrency: transaction.currency, expectedCurrency: payment.currency },
        });
        await postAlert(
          `:warning: Payment mismatch on ${payment.orderNumber}. Provider reported ${formatMoney(transaction.amount, transaction.currency)}, expected ${formatMoney(payment.amount, payment.currency)}.`,
        );
      }
      return "held";
    }

    await markOrderPaid({
      orderId,
      reference,
      amount: transaction.amount,
      channel: transaction.channel,
      providerTransactionId: String(transaction.id),
      cardLast4: transaction.authorization?.last4 ?? null,
      cardBrand: transaction.authorization?.brand ?? null,
      authCode: transaction.authorization?.authorization_code ?? null,
      mobileMoneyNumber: transaction.authorization?.mobile_money_number ?? null,
      raw: transaction as never,
    });
    return "paid";
  }

  if (transaction.status === "failed" || transaction.status === "abandoned") {
    // Paystack calls every unpaid hosted checkout "abandoned", including one
    // the shopper is still looking at. Only the shopper's own page settles it
    // as failed; background checks leave it for the webhook or expiry.
    if (options.recordFailure === false) return "pending";
    await markPaymentFailed({
      orderId,
      reference,
      reason: transaction.gateway_response ?? "Payment did not complete.",
    });
    return "failed";
  }

  return "pending";
}

/** How far back an unsettled payment is still worth asking the provider about. */
const RECONCILE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Asks the provider about payments still marked pending and records what it
 * says.
 *
 * A customer can approve a MoMo prompt after closing the confirmation page,
 * and a webhook can be missed, which left paid orders reading "awaiting
 * payment". This catches them: it runs in the background as people use the
 * shop, and directly when an order is opened by staff or by its customer.
 */
export async function reconcilePendingPayments(
  options: { orderId?: string; limit?: number } = {},
): Promise<{ checked: number; paid: number }> {
  const payments = await db.payment.findMany({
    where: {
      provider: "paystack",
      status: "PENDING",
      createdAt: { gte: new Date(Date.now() - RECONCILE_WINDOW_MS) },
      ...(options.orderId ? { orderId: options.orderId } : {}),
    },
    select: {
      orderId: true,
      reference: true,
      amount: true,
      currency: true,
      order: { select: { orderNumber: true } },
    },
    orderBy: { createdAt: "desc" },
    take: options.limit ?? 25,
  });

  let paid = 0;
  for (const payment of payments) {
    try {
      const outcome = await reconcilePaystackPayment(
        {
          orderId: payment.orderId,
          orderNumber: payment.order.orderNumber,
          reference: payment.reference,
          amount: payment.amount,
          currency: payment.currency,
        },
        { recordFailure: false },
      );
      if (outcome === "paid") paid += 1;
    } catch (error) {
      // An unknown reference (a charge that never started) or a provider
      // hiccup. The next sweep asks again while the payment is in the window.
      console.error("[payments.reconcile] could not verify", payment.reference, error);
    }
  }
  return { checked: payments.length, paid };
}

let lastReconcile = 0;

/** Runs the pending-payment check at most every two minutes per server, in the background. */
export function reconcilePendingPaymentsSoon(): void {
  const now = Date.now();
  if (now - lastReconcile < 2 * 60 * 1000) return;
  lastReconcile = now;
  reconcilePendingPayments().catch((error) => console.error("[payments.reconcile]", error));
}

/**
 * A bag is going through checkout again while its earlier attempt is still
 * open: a MoMo prompt that was never approved, or a payment that failed or was
 * abandoned. The earlier attempt is checked with the provider first. If the
 * money did land after all, its reference comes back so the shopper is shown
 * that order rather than charged twice. Otherwise the earlier order is
 * cancelled, so its stock reservation does not block the new one.
 */
export async function settleEarlierCheckout(
  orderId: string,
): Promise<{ paidReference: string | null }> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { payments: { orderBy: { createdAt: "desc" } } },
  });
  if (!order) return { paidReference: null };

  for (const payment of order.payments) {
    if (payment.status === "SUCCESS") return { paidReference: payment.reference };
    if (payment.provider !== "paystack" || payment.status !== "PENDING") continue;

    try {
      const outcome = await reconcilePaystackPayment({
        orderId: order.id,
        orderNumber: order.orderNumber,
        reference: payment.reference,
        amount: payment.amount,
        currency: payment.currency,
      });
      // Money arrived (or arrived wrong and is held for review): never charge again.
      if (outcome === "paid" || outcome === "held") return { paidReference: payment.reference };
    } catch (error) {
      console.error("[checkout] could not verify earlier attempt", payment.reference, error);
    }
  }

  if (order.status === "PENDING" && !order.paidAt) {
    await cancelOrder(order.id, "Replaced by a new checkout from the same bag.", null, {
      notify: false,
    });
  }
  return { paidReference: null };
}
