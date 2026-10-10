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
export async function reconcilePaystackPayment(payment: {
  orderId: string;
  orderNumber: string;
  reference: string;
  amount: number;
  currency: string;
}): Promise<PaymentOutcome> {
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
    await markPaymentFailed({
      orderId,
      reference,
      reason: transaction.gateway_response ?? "Payment did not complete.",
    });
    return "failed";
  }

  return "pending";
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
