import { db } from "./db";
import { generateOrderNumber } from "./slug";
import { allocateProportionally } from "./money";
import {
  clearCart,
  computeCartTotals,
  toDiscountLines,
  type CartWithItems,
} from "./cart";
import { applyDiscount, recordRedemption } from "./discounts";
import {
  commitStock,
  releaseStock,
  reserveStock,
  restockUnits,
  stockLinesForOrder,
} from "./inventory";
import { quoteShipping } from "./shipping";
import type { OrderStatus, Prisma } from "@/generated/prisma";

export const orderInclude = {
  items: true,
  payments: { orderBy: { createdAt: "desc" } },
  shippingAddress: true,
  billingAddress: true,
  shippingRate: { include: { zone: true } },
  redemptions: { include: { discount: true } },
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

/**
 * Turns a cart into a PENDING order and reserves its stock.
 *
 * Totals are recomputed here from the database rather than taken from the
 * request, so a tampered client cannot set its own price. Stock is reserved
 * before the payment attempt so a shopper who reaches Paystack is guaranteed
 * the goods for the life of that attempt.
 */
export async function createOrderFromCart(args: {
  cart: CartWithItems;
  email: string;
  phone?: string | null;
  userId?: string | null;
  shippingAddress: AddressInput;
  billingAddress?: AddressInput | null;
  shippingRateId?: string | null;
  customerNote?: string | null;
}): Promise<FullOrder> {
  const { cart } = args;
  if (cart.items.length === 0) throw new Error("Your bag is empty.");

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

  if (args.shippingRateId) {
    const chosen = quotes.find((q) => q.id === args.shippingRateId);
    if (!chosen) throw new Error("That delivery option is not available for your address.");
    shippingRateId = chosen.id;
    shippingTotal = chosen.price;
  } else if (quotes.length > 0) {
    shippingRateId = quotes[0].id;
    shippingTotal = quotes[0].price;
  }

  // A FREE_SHIPPING code zeroes the line but keeps the carrier selection.
  if (totals.freeShipping) shippingTotal = 0;

  // --- Discount re-check ----------------------------------------------------
  const discount = cart.discountCode
    ? await applyDiscount(cart.discountCode, {
        lines: toDiscountLines(cart),
        subtotal: totals.subtotal,
        shippingTotal,
        userId: args.userId,
        email: args.email,
      })
    : null;

  const discountTotal = discount?.amount ?? 0;
  const total = Math.max(0, totals.subtotal - discountTotal + shippingTotal);

  // Spread the discount across lines so per-item refunds stay accurate.
  const allocation =
    discount?.allocation ??
    allocateProportionally(
      0,
      cart.items.map((i) => i.unitPrice * i.quantity),
    );

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
        subtotal: totals.subtotal,
        discountTotal,
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
 * Marks an order paid. Safe to call repeatedly: Paystack retries webhooks, and
 * the callback page verifies too, so this runs more than once in practice.
 */
export async function markOrderPaid(args: {
  orderId: string;
  reference: string;
  amount: number;
  channel?: string | null;
  providerTransactionId?: string | null;
  cardLast4?: string | null;
  cardBrand?: string | null;
  authCode?: string | null;
  mobileMoneyNumber?: string | null;
  raw?: Prisma.InputJsonValue;
}): Promise<{ alreadyPaid: boolean }> {
  const order = await db.order.findUnique({
    where: { id: args.orderId },
    include: { redemptions: true },
  });
  if (!order) throw new Error("Order not found.");

  if (order.paymentStatus === "SUCCESS") {
    return { alreadyPaid: true };
  }

  await db.payment.upsert({
    where: { reference: args.reference },
    create: {
      orderId: order.id,
      reference: args.reference,
      amount: args.amount,
      currency: order.currency,
      status: "SUCCESS",
      channel: args.channel ?? null,
      providerTransactionId: args.providerTransactionId ?? null,
      cardLast4: args.cardLast4 ?? null,
      cardBrand: args.cardBrand ?? null,
      authCode: args.authCode ?? null,
      mobileMoneyNumber: args.mobileMoneyNumber ?? null,
      rawResponse: args.raw,
      paidAt: new Date(),
    },
    update: {
      status: "SUCCESS",
      channel: args.channel ?? null,
      providerTransactionId: args.providerTransactionId ?? null,
      rawResponse: args.raw,
      paidAt: new Date(),
    },
  });

  await db.order.update({
    where: { id: order.id },
    data: {
      status: "PAID",
      paymentStatus: "SUCCESS",
      paidAt: new Date(),
    },
  });

  // Turn reservations into sales exactly once.
  if (!order.inventoryAppliedAt) {
    const lines = await stockLinesForOrder(order.id);
    await commitStock(lines, order.orderNumber);
    await db.order.update({
      where: { id: order.id },
      data: { inventoryAppliedAt: new Date() },
    });
  }

  // Count the discount only on a real sale.
  if (order.discountTotal > 0 && order.redemptions.length === 0) {
    const cart = await db.cart.findFirst({
      where: { convertedOrderId: order.id },
      select: { discountCode: true },
    });
    if (cart?.discountCode) {
      const discount = await db.discount.findUnique({ where: { code: cart.discountCode } });
      if (discount) {
        await recordRedemption({
          discountId: discount.id,
          orderId: order.id,
          userId: order.userId,
          amount: order.discountTotal,
        });
      }
    }
  }

  const cartToClear = await db.cart.findFirst({
    where: { convertedOrderId: order.id },
    select: { id: true },
  });
  if (cartToClear) await clearCart(cartToClear.id);

  await logOrderEvent({
    orderId: order.id,
    type: "payment.success",
    message: `Payment received via ${args.channel ?? "Paystack"}.`,
    meta: { reference: args.reference, amount: args.amount },
  });

  // Log the purchase on the customer timeline for CRM.
  if (order.userId) {
    await db.customerInteraction.create({
      data: {
        userId: order.userId,
        type: "ORDER_PLACED",
        subject: `Order ${order.orderNumber}`,
        body: `Paid ${order.currency} ${(order.total / 100).toFixed(2)}.`,
        meta: { orderId: order.id, orderNumber: order.orderNumber },
      },
    });
  }

  return { alreadyPaid: false };
}

export async function markPaymentFailed(args: {
  orderId: string;
  reference: string;
  reason?: string;
}): Promise<void> {
  await db.payment.updateMany({
    where: { reference: args.reference },
    data: { status: "FAILED" },
  });
  await db.order.update({
    where: { id: args.orderId },
    data: { paymentStatus: "FAILED" },
  });
  await logOrderEvent({
    orderId: args.orderId,
    type: "payment.failed",
    message: args.reason ?? "Payment attempt failed.",
  });
}

/** Cancels an unpaid order and gives its reserved stock back. */
export async function cancelOrder(
  orderId: string,
  reason: string,
  actorId?: string | null,
): Promise<void> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found.");
  if (order.status === "CANCELLED") return;

  const lines = await stockLinesForOrder(orderId);

  if (order.inventoryAppliedAt) {
    // Already sold - put the goods back on the shelf.
    await restockUnits(lines, order.orderNumber, "RETURN", actorId);
  } else {
    await releaseStock(lines, order.orderNumber, actorId);
  }

  await db.order.update({
    where: { id: orderId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  await logOrderEvent({
    orderId,
    type: "order.cancelled",
    message: reason,
    actorId,
  });
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
}

/** Records a refund against the order and restocks the goods. */
export async function recordRefund(args: {
  orderId: string;
  amount: number;
  reason: string;
  restock: boolean;
  actorId?: string | null;
}): Promise<void> {
  const order = await db.order.findUnique({ where: { id: args.orderId } });
  if (!order) throw new Error("Order not found.");

  const refundedTotal = Math.min(order.total, order.refundedTotal + args.amount);
  const fullyRefunded = refundedTotal >= order.total;

  await db.order.update({
    where: { id: args.orderId },
    data: {
      refundedTotal,
      paymentStatus: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
      ...(fullyRefunded ? { status: "REFUNDED" } : {}),
    },
  });

  if (args.restock) {
    const lines = await stockLinesForOrder(args.orderId);
    await restockUnits(lines, order.orderNumber, "RETURN", args.actorId);
  }

  await logOrderEvent({
    orderId: args.orderId,
    type: "order.refunded",
    message: `Refunded ${(args.amount / 100).toFixed(2)}. ${args.reason}`,
    actorId: args.actorId,
    meta: { amount: args.amount, restock: args.restock },
  });
}

export async function getOrderByNumber(orderNumber: string): Promise<FullOrder | null> {
  return db.order.findUnique({
    where: { orderNumber },
    include: orderInclude,
  });
}
