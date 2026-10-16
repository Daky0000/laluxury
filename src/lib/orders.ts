import { pushToStaff } from "@/lib/push";
import { revalidateProductCatalog } from "@/lib/catalog-revalidate";
import { db } from "./db";
import { generateOrderNumber } from "./slug";
import { allocateProportionally, formatMoney } from "./money";
import {
  clearCart,
  computeCartTotals,
  toDiscountLines,
  type CartWithItems,
} from "./cart";
import { applyDiscount, recordRedemption } from "./discounts";
import { depositAmountFor, depositPercentFor } from "./deposits";
import {
  commitStock,
  lowStockAfterSale,
  releaseStock,
  reserveStock,
  restockUnits,
  stockLinesForOrder,
} from "./inventory";
import { notifyOrder, notifyOwnerOfPaidOrder } from "./notify";
import { quoteShipping, shippingRateIdForOrder } from "./shipping";
import { describeChannel } from "./paystack";
import { env } from "./env";
import { formatPhone, normalisePhone } from "./phone";
import { isPickupAddress } from "./pickup-locations";
import { getSettings } from "./settings";
import { sendSms } from "./sms";
import { postAlert } from "./agent/slack";
import { MANUAL_PAYMENT_METHODS, type ManualPaymentMethod } from "./constants";
import { activePaystack, getIntegrations } from "./integrations";
import { newPaymentReference } from "./payment-reference";
import type { OrderNotice } from "./notify";
import type { Order, OrderStatus, PaymentStatus, Prisma } from "@/generated/prisma";

export const orderInclude = {
  items: true,
  payments: { orderBy: { createdAt: "desc" } },
  shippingAddress: true,
  billingAddress: true,
  shippingRate: { include: { zone: true } },
  redemptions: { include: { discount: true } },
  refunds: { orderBy: { createdAt: "desc" } },
  events: { orderBy: { createdAt: "desc" } },
  user: { select: { id: true, email: true, firstName: true, lastName: true } },
} satisfies Prisma.OrderInclude;

export type FullOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export type AddressInput = {
  firstName: string;
  lastName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  region: string;
  postalCode?: string | null;
  country?: string;
};

export async function logOrderEvent(args: {
  orderId: string;
  type: string;
  message: string;
  actorId?: string | null;
  meta?: Prisma.InputJsonValue;
}): Promise<void> {
  await db.orderEvent.create({
    data: {
      orderId: args.orderId,
      type: args.type,
      message: args.message,
      actorId: args.actorId ?? null,
      meta: args.meta,
    },
  });
}

// --- Payment state helpers ---------------------------------------------------

/** Payment states that mean money was received, whatever has been refunded since. */
const SETTLED: PaymentStatus[] = ["SUCCESS", "PARTIALLY_REFUNDED", "REFUNDED"];

export function isPaymentSettled(status: PaymentStatus): boolean {
  return SETTLED.includes(status);
}

/** What the money in one payment is for. */
export type PaymentPurpose = "FULL" | "DEPOSIT" | "BALANCE";

/** The balance still owed on a deposit order, or 0. */
export function outstandingBalance(order: {
  total: number;
  depositAmount: number | null;
  balancePaidAt: Date | null;
}): number {
  if (!order.depositAmount || order.balancePaidAt || order.depositAmount >= order.total) return 0;
  return order.total - order.depositAmount;
}

/** Money received on an order and not yet sent back (minor units). */
export async function netPaidOn(orderId: string): Promise<{ received: number; refundable: number }> {
  const [order, sum] = await Promise.all([
    db.order.findUnique({ where: { id: orderId }, select: { refundedTotal: true } }),
    db.payment.aggregate({ where: { orderId, status: "SUCCESS" }, _sum: { amount: true } }),
  ]);
  const received = sum._sum.amount ?? 0;
  return { received, refundable: Math.max(0, received - (order?.refundedTotal ?? 0)) };
}

/**
 * Turns a cart into a PENDING order and reserves its stock.
 *
 * Totals are recomputed here from the database rather than taken from the
 * request, so a tampered client cannot set its own price. Stock is reserved
 * before the payment attempt so a shopper who reaches Paystack is guaranteed
 * the goods for the life of that attempt. Web checkout and the app both come
 * through here, so the two can never price an order differently.
 */
export async function createOrderFromCart(args: {
  cart: CartWithItems;
  email: string;
  phone?: string | null;
  /** The signed-in buyer. Contact details typed at checkout never pick an account. */
  userId?: string | null;
  /** Account whose per-customer code limits apply (an existing customer with this email or phone). */
  discountUserId?: string | null;
  shippingAddress: AddressInput;
  billingAddress?: AddressInput | null;
  shippingRateId?: string | null;
  customerNote?: string | null;
  paymentMethod?: string | null;
  /** The shopper chose to pay a pre-order deposit now and the balance later. */
  payDeposit?: boolean;
  /** Collected from a pickup location: no delivery rate and no delivery fee. */
  pickup?: boolean;
  /** "console" for an order staff raise for a customer from the app; it never expires. */
  source?: "checkout" | "app" | "console";
  idempotencyKey?: string | null;
}): Promise<FullOrder> {
  const { cart } = args;
  if (cart.items.length === 0) throw new Error("Your bag is empty.");
  sweepStalePendingOrdersSoon();

  const totals = await computeCartTotals(cart);
  if (totals.problems.length > 0) {
    throw new Error(totals.problems[0]);
  }

  // --- Shipping -------------------------------------------------------------
  const quotes = await quoteShipping({
    region: args.shippingAddress.region,
    subtotal: totals.subtotal,
    totalWeightGrams: totals.totalWeightGrams,
  });

  let shippingTotal = 0;
  let shippingRateId: string | null = null;

  if (args.pickup) {
    // Nothing to deliver; the address is the pickup point.
  } else if (args.shippingRateId) {
    const chosen = quotes.find((q) => q.id === args.shippingRateId);
    if (!chosen) throw new Error("That delivery option is not available for your address.");
    shippingRateId = shippingRateIdForOrder(chosen.id);
    shippingTotal = chosen.price;
  } else if (quotes.length > 0) {
    shippingRateId = shippingRateIdForOrder(quotes[0].id);
    shippingTotal = quotes[0].price;
  } else {
    // No rate covers this address: refuse rather than deliver for free.
    throw new Error("We do not deliver to that region yet. Choose pickup or another address.");
  }

  // --- Discount re-check ----------------------------------------------------
  const discount = cart.discountCode
    ? await applyDiscount(cart.discountCode, {
        lines: toDiscountLines(cart),
        subtotal: totals.subtotal,
        shippingTotal,
        userId: args.userId ?? args.discountUserId ?? null,
        email: args.email,
        excludeOrderId: cart.convertedOrderId,
      })
    : null;

  // A FREE_SHIPPING code zeroes the line but keeps the carrier selection.
  if (discount?.freeShipping) shippingTotal = 0;

  const discountTotal = discount?.amount ?? 0;
  const total = Math.max(0, totals.subtotal - discountTotal + shippingTotal);

  const hasPreorderItems = cart.items.some((item) => Boolean(item.variant.product.isPreorder));
  const depositPercent = args.payDeposit
    ? depositPercentFor(cart.items.map((item) => item.variant.product))
    : null;
  const depositAmount = depositAmountFor(total, depositPercent);

  // Spread the discount across lines so per-item refunds stay accurate.
  const allocation =
    discount?.allocation ??
    allocateProportionally(
      0,
      cart.items.map((i) => i.unitPrice * i.quantity),
    );

  const isTest = activePaystack(await getIntegrations()).mode === "test";

  // --- Persist --------------------------------------------------------------
  const orderNumber = await uniqueOrderNumber();

  const order = await db.$transaction(async (tx) => {
    const shipping = await tx.address.create({
      data: {
        userId: args.userId ?? null,
        firstName: args.shippingAddress.firstName,
        lastName: args.shippingAddress.lastName,
        phone: args.shippingAddress.phone,
        line1: args.shippingAddress.line1,
        line2: args.shippingAddress.line2 ?? null,
        city: args.shippingAddress.city,
        region: args.shippingAddress.region,
        postalCode: args.shippingAddress.postalCode ?? null,
        country: args.shippingAddress.country ?? "GH",
      },
    });

    const billingSource = args.billingAddress ?? args.shippingAddress;
    const billing = args.billingAddress
      ? await tx.address.create({
          data: {
            userId: args.userId ?? null,
            firstName: billingSource.firstName,
            lastName: billingSource.lastName,
            phone: billingSource.phone,
            line1: billingSource.line1,
            line2: billingSource.line2 ?? null,
            city: billingSource.city,
            region: billingSource.region,
            postalCode: billingSource.postalCode ?? null,
            country: billingSource.country ?? "GH",
          },
        })
      : shipping;

    return tx.order.create({
      data: {
        orderNumber,
        userId: args.userId ?? null,
        email: args.email,
        phone: args.phone ?? args.shippingAddress.phone,
        status: "PENDING",
        paymentStatus: "PENDING",
        source: args.source ?? "checkout",
        idempotencyKey: args.idempotencyKey ?? null,
        isTest,
        hasPreorderItems,
        paymentMethod: args.paymentMethod ?? "paystack",
        depositAmount,
        subtotal: totals.subtotal,
        discountTotal,
        discountId: discount?.discount.id ?? null,
        shippingTotal,
        taxTotal: 0,
        total,
        shippingAddressId: shipping.id,
        billingAddressId: billing.id,
        shippingRateId,
        customerNote: args.customerNote ?? null,
        items: {
          create: cart.items.map((item, index) => {
            const lineTotal = item.unitPrice * item.quantity;
            const allocated = allocation[index] ?? 0;
            return {
              variantId: item.variantId,
              productId: item.variant.productId,
              productTitle: item.variant.product.title,
              variantTitle: item.variant.title,
              sku: item.variant.sku,
              imageUrl: item.variant.product.images[0]?.url ?? null,
              isPreorder: Boolean(item.variant.product.isPreorder),
              preorderLeadTime: item.variant.product.preorderLeadTime ?? null,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountAllocated: allocated,
              total: lineTotal - allocated,
            };
          }),
        },
      },
      include: orderInclude,
    });
  });

  // Reserve outside the order transaction so a stock clash does not roll back
  // the order record we need for the failure message.
  try {
    await reserveStock(
      cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      order.orderNumber,
      args.userId,
    );
  } catch (error) {
    await db.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    throw error;
  }
  await db.order.update({ where: { id: order.id }, data: { stockReservedAt: new Date() } });

  await logOrderEvent({
    orderId: order.id,
    type: "order.placed",
    message: `Order ${order.orderNumber} created, awaiting payment.`,
    actorId: args.userId,
  });

  // Remember which order the cart became, so it is not reused.
  await db.cart.update({
    where: { id: cart.id },
    data: { convertedOrderId: order.id },
  });

  return order;
}

export async function uniqueOrderNumber(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = generateOrderNumber();
    const clash = await db.order.findUnique({
      where: { orderNumber: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  throw new Error("Could not allocate an order number.");
}

/**
 * Takes a paid order's goods off the shelf, exactly once. An order that held a
 * reservation turns it into the sale; a staff order that never reserved takes
 * the units straight from `onHand`. A failure gives both flags back, so the
 * next webhook, confirmation or background sweep finishes the job.
 */
async function applySoldStock(order: { id: string; orderNumber: string }): Promise<void> {
  const stockClaim = await db.order.updateMany({
    where: { id: order.id, inventoryAppliedAt: null },
    data: { inventoryAppliedAt: new Date() },
  });
  if (stockClaim.count !== 1) return;

  const held = await db.order.updateMany({
    where: { id: order.id, stockReservedAt: { not: null } },
    data: { stockReservedAt: null },
  });

  try {
    const lines = await stockLinesForOrder(order.id);
    await commitStock(lines, order.orderNumber, null, { fromReservation: held.count === 1 });
    // Storefront stock counts change with every sale.
    revalidateProductCatalog();

    // The sale that empties a shelf is the moment to say so.
    const low = await lowStockAfterSale(lines);
    if (low.length > 0) {
      await postAlert(
        `:package: Low stock after ${order.orderNumber}:\n` +
          low
            .map(
              (item) =>
                `- ${item.label} (${item.sku}): ${item.available} left` +
                (item.reorderQuantity ? `, reorder ${item.reorderQuantity}` : ""),
            )
            .join("\n"),
      );
    }
  } catch (error) {
    await db.order.update({
      where: { id: order.id },
      data: {
        inventoryAppliedAt: null,
        ...(held.count === 1 ? { stockReservedAt: new Date() } : {}),
      },
    });
    throw error;
  }
}

export type SettlementInput = {
  orderId: string;
  reference: string;
  amount: number;
  channel?: string | null;
  providerTransactionId?: string | null;
  cardLast4?: string | null;
  cardBrand?: string | null;
  mobileMoneyNumber?: string | null;
  raw?: Prisma.InputJsonValue;
  /** Who took the money: "paystack" (default), "manual" or "pos". */
  provider?: string;
  /** What the money is for, when this reference has no payment row yet. */
  purpose?: PaymentPurpose | null;
  /** "live" or "test", as Paystack reported the transaction. */
  domain?: string | null;
};

/**
 * Marks money received against an order. Safe to call repeatedly, and safe to
 * call twice at once.
 *
 * Paystack retries webhooks, and the confirmation page verifies too, so this
 * runs more than once for every real payment, often within the same second.
 * The flip from unpaid to paid is one conditional update: exactly one caller
 * sees the row change, and that caller does the work that must happen once.
 *
 * A successful reference that arrives once the order is already paid is
 * never dropped. It is the balance when it matches the balance due on a
 * deposit order; otherwise it is a second payment, recorded, held for review
 * and raised with the team so it can be refunded.
 *
 * Money arriving for an order that has since been cancelled is recorded and
 * flagged rather than reversed: the stock went back when it was cancelled, the
 * order stays cancelled, and the team is told it needs a refund or reopening.
 */
export async function markOrderPaid(
  args: SettlementInput,
): Promise<{ alreadyPaid: boolean; duplicate?: boolean }> {
  // A concurrent change (a cancel, another payment) between reading and
  // claiming the order is re-read and settled against the new state.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const outcome = await settleOnce(args);
    if (outcome !== "retry") return outcome;
  }
  throw new Error(`Order changed repeatedly while recording payment ${args.reference}; retry later.`);
}

async function settleOnce(
  args: SettlementInput,
): Promise<{ alreadyPaid: boolean; duplicate?: boolean } | "retry"> {
  const order = await db.order.findUnique({ where: { id: args.orderId } });
  if (!order) throw new Error("Order not found.");

  const existing = await db.payment.findUnique({
    where: { reference: args.reference },
    select: { orderId: true, status: true, purpose: true },
  });
  if (existing && existing.orderId !== order.id) {
    throw new Error(`Payment ${args.reference} belongs to another order.`);
  }
  const purpose = (existing?.purpose ?? args.purpose ?? null) as PaymentPurpose | null;

  if (isPaymentSettled(order.paymentStatus)) {
    if (existing?.status === "SUCCESS") {
      // Already on file. Finish whatever an earlier, interrupted run left.
      await finishPaidWork(order);
      return { alreadyPaid: true };
    }

    const balanceDue = outstandingBalance(order);
    if (balanceDue > 0 && args.amount === balanceDue && purpose !== "FULL" && purpose !== "DEPOSIT") {
      await settleOrderBalance(order, args, purpose);
      return { alreadyPaid: false };
    }

    await recordUnexpectedPayment(
      order,
      args,
      purpose,
      balanceDue > 0
        ? `It does not match the balance due (${formatMoney(balanceDue, order.currency)}).`
        : "The order was already paid.",
    );
    return { alreadyPaid: true, duplicate: true };
  }

  // The payment row first, so the money is on file whatever happens below.
  await claimPaymentSuccess(order, args, purpose);

  const now = new Date();
  const wasCancelled = order.status === "CANCELLED";
  // Paying the whole total on a deposit order settles the balance too.
  const coversBalance = Boolean(order.depositAmount && args.amount >= order.total);

  // The one write that decides who is first. It also checks the status, so a
  // cancellation that lands in between is seen and handled on the next pass.
  const claimed = await db.order.updateMany({
    where: { id: order.id, status: order.status, paymentStatus: { notIn: SETTLED } },
    data: {
      paymentStatus: "SUCCESS",
      paidAt: now,
      ...(wasCancelled ? {} : { status: "PAID" }),
      ...(coversBalance ? { balancePaidAt: now } : {}),
    },
  });
  if (claimed.count === 0) return "retry";

  if (wasCancelled) {
    const message =
      `Payment of ${formatMoney(args.amount, order.currency)} arrived after this order was cancelled. ` +
      "The stock was not taken again. Refund the customer, or reopen the order as paid.";
    await logOrderEvent({
      orderId: order.id,
      type: "payment.after_cancel",
      message,
      meta: { reference: args.reference, amount: args.amount },
    });
    await postAlert(
      `:rotating_light: ${order.orderNumber} was paid (${formatMoney(args.amount, order.currency)}) *after* being cancelled. It needs a refund or reopening.`,
    );
    return { alreadyPaid: false };
  }

  try {
    await applySoldStock(order);
  } catch (error) {
    // The sale stands; the background sweep retries the stock.
    console.error("[orders] stock commit failed after payment", order.orderNumber, error);
    await logOrderEvent({
      orderId: order.id,
      type: "stock.commit_failed",
      message: "Paid, but the stock could not be taken off the shelf yet. It will be retried.",
    }).catch(() => {});
  }
  await runPaidEffects(order.id);
  return { alreadyPaid: false };
}

/**
 * Moves one payment row to SUCCESS. Returns true when this call made the
 * change, false when the row was already settled by someone else.
 */
async function claimPaymentSuccess(
  order: { id: string; currency: string },
  args: SettlementInput,
  purpose: PaymentPurpose | null,
  hold?: { reason: string },
): Promise<boolean> {
  const now = new Date();
  const fields = {
    status: "SUCCESS" as const,
    channel: args.channel ?? null,
    providerTransactionId: args.providerTransactionId ?? null,
    rawResponse: args.raw,
    paidAt: now,
    ...(args.cardLast4 ? { cardLast4: args.cardLast4 } : {}),
    ...(args.cardBrand ? { cardBrand: args.cardBrand } : {}),
    ...(args.mobileMoneyNumber ? { mobileMoneyNumber: args.mobileMoneyNumber } : {}),
    ...(args.domain ? { domain: args.domain } : {}),
    ...(hold ? { heldAt: now, heldReason: hold.reason } : {}),
  };

  const updated = await db.payment.updateMany({
    where: { reference: args.reference, status: { not: "SUCCESS" } },
    data: fields,
  });
  if (updated.count === 1) return true;

  const exists = await db.payment.findUnique({ where: { reference: args.reference }, select: { id: true } });
  if (exists) return false;

  try {
    await db.payment.create({
      data: {
        orderId: order.id,
        reference: args.reference,
        amount: args.amount,
        currency: order.currency,
        provider: args.provider ?? "paystack",
        purpose,
        ...fields,
      },
    });
    return true;
  } catch (error) {
    // Two callers created the same reference at once; the other one won.
    if ((error as { code?: string }).code === "P2002") return false;
    throw error;
  }
}

/**
 * A successful payment the order did not need: a second approval of the same
 * MoMo request, two checkouts paid for one bag, or a balance for the wrong
 * amount. It is recorded (so it can be refunded), held, and raised once.
 */
async function recordUnexpectedPayment(
  order: Order,
  args: SettlementInput,
  purpose: PaymentPurpose | null,
  why: string,
): Promise<void> {
  const reason = `Extra payment of ${formatMoney(args.amount, order.currency)} on an order that did not need it. ${why}`;
  const flipped = await claimPaymentSuccess(order, args, purpose, { reason });
  if (!flipped) return;

  await logOrderEvent({
    orderId: order.id,
    type: "payment.duplicate",
    message: `${reason} Refund it from the order page, or keep it against the order if the customer agrees.`,
    meta: { reference: args.reference, amount: args.amount },
  });
  await postAlert(
    `:rotating_light: ${order.orderNumber} received an extra ${formatMoney(args.amount, order.currency)} (ref ${args.reference}). ${why} Refund it from the order page.`,
  );
}

/** Records the remaining balance on a deposit order, exactly once. */
async function settleOrderBalance(
  order: Order,
  args: SettlementInput,
  purpose: PaymentPurpose | null,
): Promise<void> {
  await claimPaymentSuccess(order, args, purpose ?? "BALANCE");

  const now = new Date();
  const claimed = await db.order.updateMany({
    where: { id: order.id, balancePaidAt: null },
    data: { balancePaidAt: now },
  });
  if (claimed.count === 0) {
    // Another payment settled the balance first; this one is extra.
    const reason = `Balance paid twice: ${formatMoney(args.amount, order.currency)} arrived after the balance was already settled.`;
    const held = await db.payment.updateMany({
      where: { reference: args.reference, heldAt: null },
      data: { heldAt: now, heldReason: reason },
    });
    if (held.count === 1) {
      await logOrderEvent({ orderId: order.id, type: "payment.duplicate", message: `${reason} Refund it.`, meta: { reference: args.reference } });
      await postAlert(`:rotating_light: ${order.orderNumber}: ${reason} Refund it from the order page.`);
    }
    return;
  }

  await logOrderEvent({
    orderId: order.id,
    type: "order.balance_paid",
    message: `Remaining balance (${formatMoney(args.amount, order.currency)}) received via ${describeChannel(args.channel ?? null)}.`,
    meta: { reference: args.reference, amount: args.amount },
  });
  await postAlert(
    `:moneybag: Balance paid on ${order.orderNumber} - ${formatMoney(args.amount, order.currency)}.`,
  );
}

/** Finishes anything a paid order still lacks: its stock movement and its post-payment steps. */
async function finishPaidWork(order: Order): Promise<void> {
  if (order.status === "CANCELLED" || order.status === "REFUNDED") return;
  if (!order.inventoryAppliedAt) {
    await applySoldStock(order).catch((error) =>
      console.error("[orders] stock commit retry failed", order.orderNumber, error),
    );
  }
  if (!order.paidEffectsDoneAt) await runPaidEffects(order.id);
}

/**
 * The steps that follow a sale, in order. Each one is recorded on the order
 * when it succeeds, so a step that fails (a gateway down, a database blip) is
 * retried later without repeating the steps that already went out.
 */
const PAID_EFFECTS = [
  "account",
  "discount",
  "cart",
  "event",
  "crm",
  "alert",
  "analytics",
  "push",
  "notify",
  "owner",
] as const;

const EFFECTS_LEASE_MS = 2 * 60 * 1000;

/**
 * Runs the post-payment steps still outstanding for a paid order. Only one
 * caller at a time holds the lease, so the webhook and the confirmation page
 * arriving together cannot text the customer twice.
 */
export async function runPaidEffects(orderId: string): Promise<void> {
  const now = new Date();
  const lease = await db.order.updateMany({
    where: {
      id: orderId,
      paidAt: { not: null },
      paidEffectsDoneAt: null,
      status: { notIn: ["CANCELLED", "REFUNDED"] },
      OR: [{ paidEffectsLockedUntil: null }, { paidEffectsLockedUntil: { lt: now } }],
    },
    data: { paidEffectsLockedUntil: new Date(now.getTime() + EFFECTS_LEASE_MS) },
  });
  if (lease.count !== 1) return;

  let failed = false;
  try {
    const order = await db.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        redemptions: true,
        payments: { where: { status: "SUCCESS", heldAt: null }, orderBy: { paidAt: "asc" }, take: 1 },
      },
    });
    const payment = order.payments[0];
    const reference = payment?.reference ?? order.orderNumber;
    const amount = payment?.amount ?? order.depositAmount ?? order.total;
    const channel = describeChannel(payment?.channel ?? null);
    const done = new Set(order.paidEffects);
    let userId = order.userId;

    const steps: Record<(typeof PAID_EFFECTS)[number], () => Promise<unknown>> = {
      // A first-time buyer's order becomes their account.
      account: async () => {
        if (!userId) userId = await ensureCustomerAccount(order.id);
      },
      // Count the code only on a real sale, free-delivery codes included.
      discount: async () => {
        if (order.redemptions.length > 0) return;
        let discountId = order.discountId;
        if (!discountId) {
          const cart = await db.cart.findFirst({
            where: { convertedOrderId: order.id },
            select: { discountCode: true },
          });
          if (cart?.discountCode) {
            discountId = (await db.discount.findUnique({ where: { code: cart.discountCode }, select: { id: true } }))?.id ?? null;
          }
        }
        if (!discountId) return;
        const { overLimit } = await recordRedemption({
          discountId,
          orderId: order.id,
          userId,
          amount: order.discountTotal,
        });
        if (overLimit) {
          await postAlert(`:warning: A discount code on ${order.orderNumber} went over its usage limit. Check the code's limit.`);
        }
      },
      cart: async () => {
        const carts = await db.cart.findMany({ where: { convertedOrderId: order.id }, select: { id: true } });
        for (const cart of carts) await clearCart(cart.id);
      },
      event: () =>
        logOrderEvent({
          orderId: order.id,
          type: "payment.success",
          message: `Payment received via ${channel}.`,
          meta: { reference, amount },
        }),
      // The purchase on the customer timeline for CRM.
      crm: async () => {
        if (!userId) return;
        await db.customerInteraction.create({
          data: {
            userId,
            type: "ORDER_PLACED",
            subject: `Order ${order.orderNumber}`,
            body: `Paid ${formatMoney(order.total, order.currency)}.`,
            meta: { orderId: order.id, orderNumber: order.orderNumber },
          },
        });
      },
      alert: () =>
        postAlert(
          `:tada: New order ${order.orderNumber} - ${formatMoney(amount, order.currency)} via ${channel}.`,
        ),
      // The purchase step of the funnel, recorded where it is certain.
      analytics: () =>
        db.analyticsEvent.create({
          data: {
            name: "purchase",
            userId,
            platform: "server",
            props: { orderNumber: order.orderNumber, amount, currency: order.currency },
          },
        }),
      push: () =>
        pushToStaff("orders:read", {
          title: `New order ${order.orderNumber}`,
          body: `${formatMoney(amount, order.currency)} via ${channel}.`,
          data: { type: "staff_order", orderId: order.id, orderNumber: order.orderNumber },
        }),
      // Told last, so nothing about the sale depends on a gateway answering.
      notify: () => notifyOrder(order.id, { kind: "payment.received", reference, channel }),
      owner: () => notifyOwnerOfPaidOrder(order.id, reference),
    };

    for (const name of PAID_EFFECTS) {
      if (done.has(name)) continue;
      try {
        await steps[name]();
        await db.order.update({ where: { id: order.id }, data: { paidEffects: { push: name } } });
      } catch (error) {
        failed = true;
        console.error(`[orders] post-payment step "${name}" failed for ${order.orderNumber}`, error);
      }
    }
  } finally {
    await db.order.update({
      where: { id: orderId },
      data: { paidEffectsLockedUntil: null, ...(failed ? {} : { paidEffectsDoneAt: new Date() }) },
    });
  }
}

/**
 * Finishes paid orders whose stock or post-payment steps did not complete:
 * a crash, a gateway outage, a database blip mid-way. Runs with the payment
 * sweep; safe to run anywhere and often.
 */
export async function retryUnfinishedPaidWork(limit = 20): Promise<number> {
  const now = Date.now();
  const orders = await db.order.findMany({
    where: {
      paidAt: { gte: new Date(now - 3 * 24 * 60 * 60 * 1000), lt: new Date(now - 2 * 60 * 1000) },
      status: { notIn: ["CANCELLED", "REFUNDED"] },
      OR: [{ paidEffectsDoneAt: null }, { inventoryAppliedAt: null }],
    },
    orderBy: { paidAt: "asc" },
    take: limit,
  });
  for (const order of orders) {
    await finishPaidWork(order).catch((error) =>
      console.error("[orders] could not finish paid work", order.orderNumber, error),
    );
  }
  return orders.length;
}

/**
 * Checkout has no sign-in. On a guest's first paid order this makes their
 * account from the order itself, the name on the delivery and the phone
 * number, and texts them that they can now sign in with that number (sign-in
 * is by a code texted to the phone, so no password is needed). An existing
 * customer account with the same phone or email gets the order instead,
 * without a text. Staff accounts are never given a customer's order. Returns
 * the account the order now belongs to.
 */
export async function ensureCustomerAccount(orderId: string): Promise<string | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      userId: true,
      email: true,
      phone: true,
      shippingAddress: { select: { id: true, firstName: true, lastName: true, phone: true, line1: true } },
      billingAddressId: true,
    },
  });
  if (!order) return null;
  if (order.userId) return order.userId;

  const phone = normalisePhone(order.phone ?? order.shippingAddress?.phone ?? "");
  // Showroom sales carry a made-up address (pos.ts); it is nobody's email.
  const rawEmail = order.email?.trim().toLowerCase() || null;
  const email = rawEmail && !/^showroom\.\d+@/.test(rawEmail) ? rawEmail : null;
  if (!phone) return null;

  const link = async (userId: string) => {
    await db.order.update({ where: { id: order.id }, data: { userId } });
    // The delivery address goes on the account too, so the next checkout
    // offers it. A pickup point is not a delivery address.
    if (order.shippingAddress && !isPickupAddress(order.shippingAddress.line1)) {
      await db.address.updateMany({
        where: { id: { in: [order.shippingAddress.id, order.billingAddressId ?? ""] }, userId: null },
        data: { userId },
      });
    }
  };

  const findMatch = () =>
    db.user.findFirst({
      where: { OR: [{ phone }, ...(email ? [{ email }] : [])] },
      select: { id: true, role: true },
    });

  const existing = await findMatch();
  if (existing) {
    // A staff login is not a customer account; the order stays a guest order.
    if (existing.role !== "CUSTOMER") return null;
    await link(existing.id);
    return existing.id;
  }

  let userId: string;
  try {
    const created = await db.user.create({
      data: {
        phone,
        email,
        firstName: order.shippingAddress?.firstName?.trim() || null,
        lastName: order.shippingAddress?.lastName?.trim() || null,
      },
      select: { id: true },
    });
    userId = created.id;
  } catch (error) {
    // Two payment paths for the same order raced here; the other one won.
    const winner = await findMatch();
    if (!winner) throw error;
    if (winner.role !== "CUSTOMER") return null;
    await link(winner.id);
    return winner.id;
  }
  await link(userId);

  const settings = await getSettings();
  const name = order.shippingAddress?.firstName?.trim();
  const message =
    `${name ? `Hi ${name}, your` : "Your"} ${settings.storeName} account has been created with ${formatPhone(phone)}. ` +
    `Sign in with this number at ${env.siteUrl()}/login to track your orders and check out faster.`;
  const sent = await sendSms(phone, message);
  if (!sent.ok) console.warn("[orders] account-created SMS not sent", sent.message);
  await logOrderEvent({
    orderId: order.id,
    type: "customer.account_created",
    message: `Account created for ${formatPhone(phone)} from this order${sent.ok ? "; sign-in SMS sent" : "; the sign-in SMS could not be sent"}.`,
    meta: { userId },
  });
  return userId;
}

/** How long a newer attempt (a prompt sent again) keeps an order from reading as failed. */
const LIVE_ATTEMPT_MS = 15 * 60 * 1000;

/**
 * Records a failed payment attempt. Like `markOrderPaid`, this runs more than
 * once for the same attempt — the webhook and the confirmation page both reach
 * it — so the customer is only told about it the first time.
 */
export async function markPaymentFailed(args: {
  orderId: string;
  reference: string;
  reason?: string;
}): Promise<void> {
  // Only one caller can claim a failed attempt. A late failure cannot regress
  // a successful attempt, and the reference must belong to this order.
  const claimed = await db.payment.updateMany({
    where: {
      reference: args.reference,
      orderId: args.orderId,
      status: { notIn: ["SUCCESS", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"] },
    },
    data: { status: "FAILED" },
  });
  if (claimed.count === 0) return;

  // Another attempt for the same order may still be open (a prompt sent
  // again); the order only reads as failed when none is.
  const stillOpen = await db.payment.count({
    where: {
      orderId: args.orderId,
      status: "PENDING",
      heldAt: null,
      createdAt: { gte: new Date(Date.now() - LIVE_ATTEMPT_MS) },
    },
  });
  if (stillOpen > 0) return;

  const changed = await db.order.updateMany({
    where: {
      id: args.orderId,
      status: { notIn: ["CANCELLED", "REFUNDED"] },
      paymentStatus: { notIn: SETTLED },
    },
    data: { paymentStatus: "FAILED" },
  });
  if (changed.count === 0) return;

  await logOrderEvent({
    orderId: args.orderId,
    type: "payment.failed",
    message: args.reason ?? "Payment attempt failed.",
  });

  await notifyOrder(args.orderId, { kind: "payment.failed", reason: args.reason ?? null, reference: args.reference });
}

/**
 * Gives a cancelled order's goods back, at most once: sold units go back on
 * the shelf (less anything a refund already restocked), a held reservation is
 * released, and an order that never held stock moves nothing.
 */
async function returnStockOnCancel(
  order: { id: string; orderNumber: string },
  actorId?: string | null,
): Promise<void> {
  const sold = await db.order.updateMany({
    where: { id: order.id, inventoryAppliedAt: { not: null } },
    data: { inventoryAppliedAt: null },
  });
  if (sold.count === 1) {
    const items = await db.orderItem.findMany({
      where: { orderId: order.id, variantId: { not: null } },
      select: { id: true, variantId: true, quantity: true, quantityRestocked: true },
    });
    const lines = items
      .map((item) => ({ variantId: item.variantId!, quantity: item.quantity - item.quantityRestocked }))
      .filter((line) => line.quantity > 0);
    await restockUnits(lines, order.orderNumber, "RETURN", actorId);
    await db.$executeRaw`UPDATE "OrderItem" SET "quantityRestocked" = "quantity" WHERE "orderId" = ${order.id}`;
    return;
  }

  const held = await db.order.updateMany({
    where: { id: order.id, stockReservedAt: { not: null } },
    data: { stockReservedAt: null },
  });
  if (held.count === 1) {
    await releaseStock(await stockLinesForOrder(order.id), order.orderNumber, actorId);
  }
}

/**
 * Cancels an order and gives its stock back.
 *
 * The cancellation is one conditional write against the status that was read,
 * so a payment landing at the same moment is never overwritten: whichever
 * write lands first wins, and the other sees the change. `expectUnpaid` is for
 * the automatic paths (expiry, a replaced checkout): they never cancel an
 * order that has been paid. A paid order cancelled by staff keeps its money
 * on file and is flagged as owing a refund.
 */
export async function cancelOrder(
  orderId: string,
  reason: string,
  actorId?: string | null,
  options: { notify?: boolean; expectUnpaid?: boolean } = {},
): Promise<{ refundOwed: number }> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found.");
  if (order.status === "CANCELLED") return { refundOwed: 0 };
  if (order.status === "REFUNDED") throw new Error("A refunded order cannot be cancelled.");

  const paid = isPaymentSettled(order.paymentStatus);
  if (options.expectUnpaid && paid) {
    throw new Error(`${order.orderNumber} has been paid, so it was not cancelled.`);
  }

  const claimed = await db.order.updateMany({
    where: { id: orderId, status: order.status, paymentStatus: order.paymentStatus },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  if (claimed.count === 0) {
    const now = await db.order.findUnique({ where: { id: orderId }, select: { status: true } });
    if (now?.status === "CANCELLED") return { refundOwed: 0 };
    throw new Error("This order changed while it was being cancelled (a payment may have just arrived). Refresh and check it.");
  }

  await returnStockOnCancel(order, actorId);

  // A code used on an order that was never paid is given back.
  if (!order.paidAt) {
    const redemptions = await db.discountRedemption.findMany({ where: { orderId } });
    for (const redemption of redemptions) {
      await db.$transaction([
        db.discountRedemption.delete({ where: { id: redemption.id } }),
        db.discount.update({
          where: { id: redemption.discountId },
          data: { timesUsed: { decrement: 1 } },
        }),
      ]);
    }
  }

  await logOrderEvent({
    orderId,
    type: "order.cancelled",
    message: reason,
    actorId,
  });

  let refundOwed = 0;
  if (paid) {
    refundOwed = (await netPaidOn(orderId)).refundable;
    if (refundOwed > 0) {
      await logOrderEvent({
        orderId,
        type: "refund.due",
        message: `Cancelled after payment: ${formatMoney(refundOwed, order.currency)} is owed back to the customer. Refund it from this page.`,
        actorId,
        meta: { amount: refundOwed },
      });
      await postAlert(
        `:money_with_wings: ${order.orderNumber} was cancelled after payment. ${formatMoney(refundOwed, order.currency)} needs refunding.`,
      );
    }
  }

  if (options.notify !== false) {
    await notifyOrder(orderId, { kind: "order.cancelled", reason });
  }
  return { refundOwed };
}

/** How long an unpaid checkout holds its stock before it is released. */
export const PENDING_ORDER_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Cancels checkouts that were never paid and gives their reserved stock back.
 * Only shopper checkouts (web and app) expire: showroom, console and quote
 * orders wait for their payment until staff cancel them. Safe to run often
 * and from several places: each order is claimed by `cancelOrder`, and money
 * arriving later is still caught by `markOrderPaid`, which flags it.
 */
export async function expireStalePendingOrders(limit = 50): Promise<number> {
  const cutoff = new Date(Date.now() - PENDING_ORDER_TTL_MS);
  const stale = await db.order.findMany({
    where: {
      status: "PENDING",
      source: { in: ["checkout", "app"] },
      paymentStatus: { in: ["PENDING", "FAILED", "ABANDONED"] },
      placedAt: { lt: cutoff },
      // Money on file, or money held for review, keeps the order open.
      payments: { none: { OR: [{ status: "SUCCESS" }, { heldAt: { not: null } }] } },
    },
    select: { id: true },
    orderBy: { placedAt: "asc" },
    take: limit,
  });

  // Imported here, not at the top: checkout-payment builds on this module.
  const { reconcilePendingPayments } = await import("./checkout-payment");

  let expired = 0;
  for (const order of stale) {
    try {
      // A payment approved late, with its webhook missed, is still a sale.
      // Ask the provider before giving the stock back.
      const { paid } = await reconcilePendingPayments({ orderId: order.id });
      if (paid > 0) continue;
      await cancelOrder(order.id, "Checkout expired without payment.", null, {
        notify: false,
        expectUnpaid: true,
      });
      expired += 1;
    } catch (error) {
      console.error("[orders.expire] could not expire", order.id, error);
    }
  }
  return expired;
}

let lastSweep = 0;

/** Runs the expiry sweep at most every ten minutes per server, in the background. */
export function sweepStalePendingOrdersSoon(): void {
  const now = Date.now();
  if (now - lastSweep < 10 * 60 * 1000) return;
  lastSweep = now;
  expireStalePendingOrders().catch((error) => console.error("[orders.expire]", error));
}

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["PAID", "CANCELLED"],
  PAID: ["PROCESSING", "FULFILLED", "CANCELLED", "REFUNDED"],
  PROCESSING: ["FULFILLED", "SHIPPED", "CANCELLED", "REFUNDED"],
  FULFILLED: ["SHIPPED", "REFUNDED"],
  SHIPPED: ["DELIVERED", "REFUNDED"],
  DELIVERED: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Which status changes are worth texting a customer about, and as what. */
const STATUS_NOTICES: Partial<Record<OrderStatus, OrderNotice>> = {
  PROCESSING: { kind: "order.processing" },
  FULFILLED: { kind: "order.fulfilled" },
  SHIPPED: { kind: "order.shipped" },
  DELIVERED: { kind: "order.delivered" },
};

/** Why an order may not move on to `status` yet, or null. */
function fulfilmentBlock(
  order: Pick<Order, "disputeStatus" | "total" | "depositAmount" | "balancePaidAt" | "currency">,
  status: OrderStatus,
): string | null {
  if (order.disputeStatus === "open" && ["FULFILLED", "SHIPPED", "DELIVERED"].includes(status)) {
    return "The customer's card issuer has disputed this payment. Hold the order until the dispute is resolved.";
  }
  const balance = outstandingBalance(order);
  if (status === "DELIVERED" && balance > 0) {
    return `The balance of ${formatMoney(balance, order.currency)} is still due. Record it (or collect it by MoMo prompt) before marking the order delivered.`;
  }
  return null;
}

export async function updateOrderStatus(args: {
  orderId: string;
  status: OrderStatus;
  actorId?: string | null;
  trackingNumber?: string | null;
  trackingCompany?: string | null;
}): Promise<void> {
  const order = await db.order.findUnique({ where: { id: args.orderId } });
  if (!order) throw new Error("Order not found.");

  if (order.status === args.status) return;
  if (!canTransition(order.status, args.status)) {
    throw new Error(`Cannot move an order from ${order.status} to ${args.status}.`);
  }

  if (args.status === "CANCELLED") {
    await cancelOrder(args.orderId, "Cancelled by staff.", args.actorId);
    return;
  }

  const blocked = fulfilmentBlock(order, args.status);
  if (blocked) throw new Error(blocked);

  const data: Prisma.OrderUpdateInput = { status: args.status };
  if (args.status === "SHIPPED") {
    data.shippedAt = new Date();
    data.fulfillmentStatus = "FULFILLED";
    if (args.trackingNumber !== undefined) data.trackingNumber = args.trackingNumber;
    if (args.trackingCompany !== undefined) data.trackingCompany = args.trackingCompany;
  }
  if (args.status === "DELIVERED") data.deliveredAt = new Date();
  if (args.status === "FULFILLED") data.fulfillmentStatus = "FULFILLED";

  await db.order.update({ where: { id: args.orderId }, data });

  await logOrderEvent({
    orderId: args.orderId,
    type: `order.${args.status.toLowerCase()}`,
    message: `Status changed to ${args.status.toLowerCase()}.`,
    actorId: args.actorId,
  });

  // PAID is announced by `markOrderPaid` — with the payment reference on it —
  // and CANCELLED left above through `cancelOrder`, which sends its own.
  const notice = STATUS_NOTICES[args.status];
  if (notice) await notifyOrder(args.orderId, notice);
}

/**
 * Staff recording money that arrived outside the checkout: cash, a MoMo sent
 * straight to the shop, a bank transfer. It goes through `markOrderPaid`, so
 * stock, the receipt text and the owner alert behave exactly as for an online
 * payment, and the payment is on file as a manual one that can be refunded by
 * hand. Paystack is asked first, so a payment it already holds is not
 * recorded twice. Callers check `payments:record`.
 */
async function recordManualPayment(
  orderId: string,
  actorId: string,
  method: ManualPaymentMethod,
  note?: string | null,
): Promise<string> {
  // Imported here, not at the top: checkout-payment builds on this module.
  const { reconcilePendingPayments } = await import("./checkout-payment");
  const { paid } = await reconcilePendingPayments({ orderId });
  if (paid > 0) return "Paystack had already received this payment, so the order is now paid.";

  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found.");
  if (order.status !== "PENDING") {
    throw new Error(`Cannot move an order from ${order.status} to PAID.`);
  }

  const proof = note?.trim() || null;
  await markOrderPaid({
    orderId,
    reference: newPaymentReference(order.orderNumber, "MANUAL"),
    amount: order.depositAmount ?? order.total,
    channel: method,
    provider: "manual",
    purpose: order.depositAmount ? "DEPOSIT" : "FULL",
    raw: { recordedBy: actorId, method, note: proof },
  });
  await logOrderEvent({
    orderId,
    type: "payment.manual",
    message: `Payment recorded by staff (${MANUAL_PAYMENT_METHODS[method]})${proof ? `: ${proof}` : ""}.`,
    actorId,
  });
  return `Order marked paid (${MANUAL_PAYMENT_METHODS[method]}).`;
}

/**
 * Staff recording the balance of a deposit order collected outside Paystack,
 * usually cash on delivery. Paystack is asked first in case a balance payment
 * already landed. Callers check `payments:record`.
 */
export async function recordBalancePayment(args: {
  orderId: string;
  actorId: string;
  method: ManualPaymentMethod;
  note?: string | null;
}): Promise<string> {
  const { reconcilePendingPayments } = await import("./checkout-payment");
  await reconcilePendingPayments({ orderId: args.orderId });

  const order = await db.order.findUnique({ where: { id: args.orderId } });
  if (!order) throw new Error("Order not found.");
  if (!isPaymentSettled(order.paymentStatus)) throw new Error("The deposit has not been paid yet.");
  if (order.status === "CANCELLED" || order.status === "REFUNDED") {
    throw new Error("This order is cancelled or refunded; there is no balance to collect.");
  }
  const balance = outstandingBalance(order);
  if (balance <= 0) return "The balance is already settled.";

  const proof = args.note?.trim() || null;
  await markOrderPaid({
    orderId: order.id,
    reference: newPaymentReference(order.orderNumber, "BAL"),
    amount: balance,
    channel: args.method,
    provider: "manual",
    purpose: "BALANCE",
    raw: { recordedBy: args.actorId, method: args.method, note: proof },
  });
  await logOrderEvent({
    orderId: order.id,
    type: "payment.manual",
    message: `Balance recorded by staff (${MANUAL_PAYMENT_METHODS[args.method]})${proof ? `: ${proof}` : ""}.`,
    actorId: args.actorId,
  });
  return `Balance of ${formatMoney(balance, order.currency)} recorded.`;
}

/**
 * Brings a cancelled order back. Its stock is taken again first, so a piece
 * sold to someone else in the meantime stops it with the usual stock message.
 * An order whose money arrived after it was cancelled comes back as paid,
 * with the receipt and owner texts it missed; any other comes back awaiting
 * payment.
 */
async function reopenOrder(orderId: string, actorId: string): Promise<"PAID" | "PENDING"> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found.");
  if (order.status !== "CANCELLED") throw new Error("Only a cancelled order can be reopened.");
  if (order.refundedTotal > 0) throw new Error("A refunded order cannot be reopened.");

  const lines = await stockLinesForOrder(orderId);
  await reserveStock(lines, order.orderNumber, actorId);

  const paid = isPaymentSettled(order.paymentStatus);
  const claimed = await db.order.updateMany({
    where: { id: orderId, status: "CANCELLED" },
    data: {
      status: paid ? "PAID" : "PENDING",
      cancelledAt: null,
      // Cancelling put any sold goods back; the claim starts over.
      inventoryAppliedAt: null,
      stockReservedAt: new Date(),
      ...(paid ? {} : { paymentStatus: "PENDING" as const }),
    },
  });
  if (claimed.count === 0) {
    await releaseStock(lines, order.orderNumber, actorId);
    throw new Error("This order changed while it was being reopened. Refresh and check it.");
  }
  await db.orderItem.updateMany({ where: { orderId }, data: { quantityRestocked: 0 } });

  await logOrderEvent({
    orderId,
    type: "order.reopened",
    message: paid ? "Reopened by staff as paid." : "Reopened by staff, awaiting payment.",
    actorId,
  });

  if (paid) {
    await applySoldStock(order);
    if (order.paidEffectsDoneAt) {
      // Its receipt went out before it was cancelled; say it is back on.
      const reference = (
        await db.payment.findFirst({ where: { orderId, status: "SUCCESS" }, orderBy: { paidAt: "asc" } })
      )?.reference ?? order.orderNumber;
      await notifyOrder(orderId, { kind: "payment.received", reference });
    } else {
      // Paid after it was cancelled: everything a sale sets off, now.
      await runPaidEffects(orderId);
    }
    return "PAID";
  }
  return "PENDING";
}

/**
 * Every status change staff can make, from the web admin or the admin app.
 * On top of the forward steps: an unpaid order can be marked paid, and a
 * cancelled one reopened to awaiting payment or straight to paid.
 * Returns the line to show the person who made the change.
 *
 * Marking an order paid records money that did not come through Paystack, so
 * callers must check `payments:record` before passing `status: "PAID"`.
 */
export async function changeOrderStatusByStaff(args: {
  orderId: string;
  status: OrderStatus;
  actorId: string;
  reason?: string | null;
  paymentMethod?: ManualPaymentMethod | null;
  /** Receipt number, transfer reference or who took the cash. */
  paymentNote?: string | null;
  trackingNumber?: string | null;
  trackingCompany?: string | null;
}): Promise<string> {
  const order = await db.order.findUnique({
    where: { id: args.orderId },
    select: { status: true, currency: true },
  });
  if (!order) throw new Error("Order not found.");
  if (order.status === args.status) return "Nothing to change.";

  const method = args.paymentMethod ?? "cash";

  if (order.status === "CANCELLED" && (args.status === "PENDING" || args.status === "PAID")) {
    const reopened = await reopenOrder(args.orderId, args.actorId);
    if (args.status === "PAID" && reopened === "PENDING") {
      return recordManualPayment(args.orderId, args.actorId, method, args.paymentNote);
    }
    return reopened === "PAID" ? "Order reopened as paid." : "Order reopened, awaiting payment.";
  }

  if (args.status === "PAID") return recordManualPayment(args.orderId, args.actorId, method, args.paymentNote);

  if (args.status === "CANCELLED") {
    const { refundOwed } = await cancelOrder(
      args.orderId,
      args.reason?.trim() || "Cancelled by staff.",
      args.actorId,
    );
    return refundOwed > 0
      ? `Order cancelled and its stock is back on the shelf. ${formatMoney(refundOwed, order.currency)} was paid and must now be refunded.`
      : "Order cancelled. Its stock is back on the shelf.";
  }

  if (args.status === "REFUNDED") throw new Error("Use the refund form to refund an order.");

  await updateOrderStatus({
    orderId: args.orderId,
    status: args.status,
    actorId: args.actorId,
    trackingNumber: args.trackingNumber,
    trackingCompany: args.trackingCompany,
  });
  return `Order marked ${args.status.toLowerCase()}.`;
}

export async function getOrderByNumber(orderNumber: string): Promise<FullOrder | null> {
  return db.order.findUnique({
    where: { orderNumber },
    include: orderInclude,
  });
}
