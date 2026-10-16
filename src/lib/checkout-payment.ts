import { db } from "./db";
import { env } from "./env";
import { getIntegrations, isReady } from "./integrations";
import { orderAccessToken } from "./order-access";
import { newPaymentReference } from "./payment-reference";
import { recordDirectCharge } from "./momo-push";
import { notifyOrder } from "./notify";
import {
  chargeMobileMoney,
  currentPaystackMode,
  detectGhanaMomoProvider,
  initializeTransaction,
  normaliseGhanaMomoPhone,
  MOMO_PROVIDER_LABELS,
  PaystackError,
  storableTransaction,
  verifyTransaction,
  type MomoProvider,
  type PaystackChargeStatus,
  type PaystackTransaction,
} from "./paystack";
import {
  cancelOrder,
  logOrderEvent,
  markOrderPaid,
  markPaymentFailed,
  retryUnfinishedPaidWork,
  type PaymentPurpose,
} from "./orders";
import { postAlert } from "./agent/slack";
import { formatMoney } from "./money";
import type { PaystackMode } from "./integrations";
import type { Prisma } from "@/generated/prisma";

/**
 * "unfinished": Paystack says nobody has paid yet, but it is too soon to call
 * it failed. The shopper may have closed the payment page, or be about to
 * approve the prompt.
 */
export type PaymentOutcome = "paid" | "failed" | "pending" | "held" | "unfinished";

type PaymentRef = {
  orderId: string;
  orderNumber: string;
  reference: string;
  amount: number;
  currency: string;
  /** The Paystack mode the attempt was started in, when known. */
  domain?: string | null;
};

function modeOf(domain: string | null | undefined): PaystackMode | null {
  return domain === "test" || domain === "live" ? domain : null;
}

/**
 * Puts a payment aside for a person to look at, once: the event and the
 * alert go out only for the call that sets the hold.
 */
async function holdPayment(
  payment: PaymentRef,
  reason: string,
  meta: Prisma.InputJsonValue,
  type = "payment.mismatch",
): Promise<void> {
  const held = await db.payment.updateMany({
    where: { reference: payment.reference, heldAt: null, status: { not: "SUCCESS" } },
    data: { heldAt: new Date(), heldReason: reason },
  });
  if (held.count === 0) return;
  await logOrderEvent({ orderId: payment.orderId, type, message: `${reason} Held for review.`, meta });
  await postAlert(`:warning: ${payment.orderNumber}: ${reason} Held for review on the order page.`);
}

/**
 * Settles a payment Paystack reports as successful, by webhook or by
 * verification, after the checks every path must make: the amount and
 * currency are the ones this attempt asked for, and test-mode money is never
 * accepted on a live order. Anything that fails a check is held for review
 * instead of being recorded as paid.
 */
export async function settleProviderSuccess(
  payment: PaymentRef,
  transaction: Pick<PaystackTransaction, "id" | "amount" | "currency" | "channel" | "domain" | "authorization"> &
    object,
): Promise<"paid" | "held"> {
  const order = await db.order.findUnique({
    where: { id: payment.orderId },
    select: { isTest: true },
  });
  if (!order) throw new Error("Order not found.");

  if (transaction.domain === "test" && !order.isTest) {
    await holdPayment(
      payment,
      "Paystack reported a TEST-mode payment (no real money) on a live order.",
      { reference: payment.reference, domain: "test" },
      "payment.test_mode",
    );
    return "held";
  }

  const reportedCurrency = String(transaction.currency ?? "").toUpperCase();
  if (transaction.amount !== payment.amount || reportedCurrency !== payment.currency.toUpperCase()) {
    await holdPayment(
      payment,
      `Payment provider reported ${formatMoney(transaction.amount, reportedCurrency || payment.currency)} but the expected payment is ${formatMoney(payment.amount, payment.currency)}.`,
      {
        reference: payment.reference,
        reported: transaction.amount,
        expected: payment.amount,
        reportedCurrency,
        expectedCurrency: payment.currency,
      },
    );
    return "held";
  }

  await markOrderPaid({
    orderId: payment.orderId,
    reference: payment.reference,
    amount: transaction.amount,
    channel: transaction.channel,
    providerTransactionId: transaction.id ? String(transaction.id) : null,
    cardLast4: transaction.authorization?.last4 ?? null,
    cardBrand: transaction.authorization?.brand ?? null,
    mobileMoneyNumber: transaction.authorization?.mobile_money_number ?? null,
    domain: typeof transaction.domain === "string" ? transaction.domain : null,
    raw: storableTransaction(transaction) as Prisma.InputJsonValue,
  });
  return "paid";
}

/**
 * Asks the payment provider where a storefront payment stands and records the
 * answer.
 *
 * The webhook is the authoritative path, but the shopper often arrives first
 * and expects an answer, so the confirmation page, the status checks and a
 * repeat checkout from the same bag verify directly too. Every route funnels
 * into `settleProviderSuccess`, so whichever lands first wins and the rest are
 * no-ops. Throws when the provider cannot be reached.
 */
export async function reconcilePaystackPayment(
  payment: PaymentRef,
  options: { recordFailure?: boolean } = {},
): Promise<PaymentOutcome> {
  const { orderId, reference } = payment;
  const transaction = await verifyTransaction(reference, modeOf(payment.domain));

  if (transaction.status === "success") {
    return settleProviderSuccess(payment, transaction);
  }

  if (transaction.status === "failed" || transaction.status === "abandoned") {
    // Paystack calls every unpaid hosted checkout "abandoned", including one
    // the shopper is still looking at. Only the shopper's own page settles it
    // as failed; background checks leave it for the webhook or expiry.
    if (options.recordFailure === false) return "pending";
    const row = await db.payment.findUnique({ where: { reference }, select: { createdAt: true } });
    if (!isFinalFailure(transaction.status, row?.createdAt ?? null)) return "unfinished";
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
 * How long an "abandoned" payment is given before it counts as failed. Paystack
 * reports "abandoned" for a hosted page the shopper is still filling in and for
 * a MoMo prompt not yet approved, so reading it as failure straight away told
 * people their payment failed while they were still paying.
 */
const ABANDONED_GRACE_MS = 20 * 60 * 1000;

/** True when a provider status means the attempt is over and unpaid. */
export function isFinalFailure(status: string, startedAt: Date | null): boolean {
  if (status === "failed") return true;
  if (status !== "abandoned") return false;
  return !startedAt || Date.now() - startedAt.getTime() > ABANDONED_GRACE_MS;
}

/** How far back an unsettled payment is still worth asking the provider about. */
const RECONCILE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const FAILED_RECHECK_WINDOW_MS = 24 * 60 * 60 * 1000;

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
      heldAt: null,
      ...(options.orderId ? { orderId: options.orderId } : {}),
      OR: [
        { status: "PENDING", createdAt: { gte: new Date(Date.now() - RECONCILE_WINDOW_MS) } },
        // A prompt approved after it was recorded as failed (a timeout, a
        // missed webhook, a prompt sent again) is still money received, even
        // when the order was paid another way: that is a second payment to
        // refund, not one to forget. Asked about for a day.
        { status: "FAILED", createdAt: { gte: new Date(Date.now() - FAILED_RECHECK_WINDOW_MS) } },
      ],
    },
    select: {
      orderId: true,
      reference: true,
      amount: true,
      currency: true,
      domain: true,
      order: { select: { orderNumber: true } },
    },
    // Oldest first within the window, alternating each sweep so neither end starves.
    orderBy: { createdAt: sweepNewestFirst ? "desc" : "asc" },
    take: options.limit ?? 25,
  });
  if (!options.orderId) sweepNewestFirst = !sweepNewestFirst;

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
          domain: payment.domain,
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

  // The background sweep also finishes paid orders left half-done.
  if (!options.orderId) {
    await retryUnfinishedPaidWork().catch((error) => console.error("[payments.reconcile] paid work", error));
  }
  return { checked: payments.length, paid };
}

let sweepNewestFirst = true;

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
    // Money that arrived wrong is held for review: never charge again.
    if (payment.heldAt) return { paidReference: payment.reference };
    if (payment.provider !== "paystack" || payment.status !== "PENDING") continue;

    try {
      const outcome = await reconcilePaystackPayment({
        orderId: order.id,
        orderNumber: order.orderNumber,
        reference: payment.reference,
        amount: payment.amount,
        currency: payment.currency,
        domain: payment.domain,
      });
      if (outcome === "paid" || outcome === "held") return { paidReference: payment.reference };
    } catch (error) {
      console.error("[checkout] could not verify earlier attempt", payment.reference, error);
    }
  }

  if (order.status === "PENDING" && !order.paidAt) {
    try {
      await cancelOrder(order.id, "Replaced by a new checkout from the same bag.", null, {
        notify: false,
        expectUnpaid: true,
      });
    } catch (error) {
      // Paid at this very moment: show that order rather than charging again.
      const fresh = await db.payment.findFirst({
        where: { orderId: order.id, status: "SUCCESS" },
        select: { reference: true },
      });
      if (fresh) return { paidReference: fresh.reference };
      throw error;
    }
  }
  return { paidReference: null };
}

/**
 * Staff deciding on a payment held for review.
 *
 * - A held attempt that Paystack still reports as successful live money (an
 *   amount or currency that did not match) is accepted for what Paystack
 *   actually took: the order is settled with that amount and the difference
 *   is the team's to chase or refund.
 * - A held success (a second payment) is marked reviewed, kept on the order
 *   as received money; refund it from the refund form if it goes back.
 *
 * Test-mode money is never accepted. Callers check `payments:record`.
 */
export async function resolveHeldPayment(paymentId: string, actorId: string): Promise<string> {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { order: { select: { id: true, orderNumber: true, currency: true } } },
  });
  if (!payment || !payment.heldAt) return "That payment is not held.";

  if (payment.status === "SUCCESS") {
    await db.payment.update({
      where: { id: payment.id },
      data: { heldAt: null, heldReason: `Reviewed: ${payment.heldReason ?? "kept on the order"}` },
    });
    await logOrderEvent({
      orderId: payment.orderId,
      type: "payment.reviewed",
      message: `Extra payment ${payment.reference} reviewed and kept on the order.`,
      actorId,
    });
    return "Marked as reviewed. Refund it from the refund form if the money goes back.";
  }

  const transaction = await verifyTransaction(payment.reference, modeOf(payment.domain));
  if (transaction.status !== "success") return `Paystack reports this payment as ${transaction.status}; there is nothing to accept.`;
  if (transaction.domain === "test") return "This was a test-mode payment. No real money moved, so it cannot settle the order.";

  // Accept what was actually taken.
  await db.payment.update({
    where: { id: payment.id },
    data: {
      amount: transaction.amount,
      currency: String(transaction.currency).toUpperCase(),
      heldAt: null,
      heldReason: `Accepted by staff: ${payment.heldReason ?? ""}`.trim(),
    },
  });
  await markOrderPaid({
    orderId: payment.orderId,
    reference: payment.reference,
    amount: transaction.amount,
    channel: transaction.channel,
    providerTransactionId: String(transaction.id),
    domain: typeof transaction.domain === "string" ? transaction.domain : null,
    raw: storableTransaction(transaction) as Prisma.InputJsonValue,
  });
  await logOrderEvent({
    orderId: payment.orderId,
    type: "payment.accepted",
    message: `Held payment ${payment.reference} accepted by staff for ${formatMoney(transaction.amount, String(transaction.currency))}.`,
    actorId,
  });
  return `Accepted ${formatMoney(transaction.amount, String(transaction.currency))}.`;
}

/**
 * Why online payment cannot start right now, or null when it can. Payment is
 * refused rather than started with a callback the shopper can never reach:
 * a production server without `NEXT_PUBLIC_SITE_URL` would send Paystack's
 * redirect to localhost.
 */
export async function checkoutUnavailableReason(): Promise<string | null> {
  if (!isReady(await getIntegrations(), "paystack")) {
    return "Online payment is temporarily unavailable. Please try again shortly.";
  }
  if (process.env.NODE_ENV === "production" && /localhost|127\.0\.0\.1/.test(env.siteUrl())) {
    console.error("[checkout] NEXT_PUBLIC_SITE_URL is not set; refusing to start a payment that would return to localhost.");
    return "Online payment is temporarily unavailable. Please try again shortly.";
  }
  return null;
}

export type StartedPayment =
  /** Paystack's hosted page: send the shopper here. */
  | { kind: "hosted"; reference: string; url: string }
  /** A prompt went to the phone (or a code is wanted first). */
  | {
      kind: "prompt";
      reference: string;
      provider: MomoProvider;
      providerLabel: string;
      phone: string;
      status: PaystackChargeStatus;
      displayText: string | null;
      amount: number;
    }
  /** Nothing to pay (a 100% discount with free delivery): already settled. */
  | { kind: "free"; reference: string };

/**
 * Starts paying for a freshly placed checkout order, for the web storefront
 * and the app alike. The payment row goes in first so a webhook or code for
 * this reference always finds it.
 *
 * When Paystack refuses, the attempt is marked failed and the order cancelled
 * (its stock and code use go back), and the error is rethrown for the caller
 * to show. When Paystack does not answer a MoMo charge in time the prompt may
 * still have gone out, so the order is kept and the attempt left pending for
 * the confirmation page and the sweep to settle.
 */
export async function startCheckoutPayment(
  order: { id: string; orderNumber: string; email: string; currency: string; total: number; depositAmount: number | null },
  args: {
    method: "direct_debit" | "mobile_money" | "bank_card";
    momoPhone?: string | null;
    network?: MomoProvider | null;
    source: "web_storefront" | "mobile_app";
  },
): Promise<StartedPayment> {
  const amount = order.depositAmount ?? order.total;
  const purpose: PaymentPurpose = order.depositAmount ? "DEPOSIT" : "FULL";

  if (amount <= 0) {
    const reference = newPaymentReference(order.orderNumber, "FREE");
    await markOrderPaid({
      orderId: order.id,
      reference,
      amount: 0,
      channel: "free",
      provider: "none",
      purpose,
    });
    return { kind: "free", reference };
  }

  const reference = newPaymentReference(order.orderNumber);
  const isDirect = args.method === "direct_debit";
  const phone = isDirect ? normaliseGhanaMomoPhone(args.momoPhone ?? "") : null;
  const provider = isDirect ? (args.network ?? detectGhanaMomoProvider(phone ?? "")) : null;

  await db.payment.create({
    data: {
      orderId: order.id,
      reference,
      provider: "paystack",
      channel: isDirect ? "mobile_money" : args.method,
      amount,
      currency: order.currency,
      status: "PENDING",
      purpose,
      domain: await currentPaystackMode(),
      mobileMoneyNumber: phone,
    },
  });

  try {
    if (isDirect && phone && provider) {
      const charge = await chargeMobileMoney({
        email: order.email,
        amount,
        phone,
        // Ported numbers keep their old prefix, so the shopper's choice wins.
        provider,
        reference,
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          source: args.source,
          channel: "direct_debit",
          purpose,
        },
      });
      if (charge.status === "failed") {
        throw new Error(
          charge.display_text ||
            charge.message ||
            "That MoMo number could not be charged. Check the number and network, or choose another payment method.",
        );
      }
      await recordDirectCharge(reference, provider, charge);
      await notifyOrder(order.id, { kind: "order.placed" }).catch((err) =>
        console.error("[notify] direct debit order.placed error:", err),
      );
      return {
        kind: "prompt",
        reference,
        provider,
        providerLabel: MOMO_PROVIDER_LABELS[provider],
        phone,
        status: charge.status,
        displayText: charge.display_text ?? null,
        amount,
      };
    }

    const init = await initializeTransaction({
      email: order.email,
      amount,
      reference,
      currency: order.currency,
      // The access token opens the full receipt; Paystack adds the reference.
      callbackUrl: `${env.siteUrl()}/checkout/confirm?t=${orderAccessToken(order.orderNumber)}`,
      channels: args.method === "mobile_money" ? ["mobile_money"] : ["card"],
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        depositAmount: order.depositAmount,
        source: args.source,
        purpose,
        custom_fields: [
          {
            display_name: "Order",
            variable_name: "order_number",
            value: order.orderNumber,
          },
        ],
      },
    });
    if (!init?.authorization_url) throw new Error("Unable to obtain a payment authorization link.");
    return { kind: "hosted", reference, url: init.authorization_url };
  } catch (error) {
    if (isDirect && phone && provider && error instanceof PaystackError && error.timedOut) {
      // The prompt may be on its way; keep the order and watch the attempt.
      return {
        kind: "prompt",
        reference,
        provider,
        providerLabel: MOMO_PROVIDER_LABELS[provider],
        phone,
        status: "pending",
        displayText: null,
        amount,
      };
    }
    await db.payment
      .updateMany({ where: { reference, status: "PENDING" }, data: { status: "FAILED" } })
      .catch(() => {});
    await cancelOrder(order.id, "Payment gateway initialization failed.", null, {
      notify: false,
      expectUnpaid: true,
    }).catch((err) => console.error("[checkout] failed to cancel order after gateway error:", err));
    throw error;
  }
}
