import { db } from "./db";
import { allocateProportionally } from "./money";
import type { Discount } from "@/generated/prisma";

/**
 * Discount evaluation.
 *
 * `validateDiscount` answers "may this person use this code right now" and is
 * safe to call on every cart render. `applyDiscount` turns a valid code into
 * concrete pesewa amounts, including the per-line allocation an order needs so
 * refunds can be computed later.
 */

export type DiscountLine = {
  variantId: string;
  productId: string;
  categoryIds: string[];
  quantity: number;
  unitPrice: number;
};

export type DiscountContext = {
  lines: DiscountLine[];
  subtotal: number;
  shippingTotal: number;
  userId?: string | null;
  email?: string | null;
};

export type DiscountResult = {
  discount: Discount;
  /** Amount taken off the goods. */
  amount: number;
  /** True when the code zeroes the shipping line instead. */
  freeShipping: boolean;
  /** Per-line allocation, index-aligned with `context.lines`. */
  allocation: number[];
};

export type DiscountFailure = { ok: false; reason: string };
export type DiscountSuccess = { ok: true; result: DiscountResult };

/** Lines the discount actually applies to, given its scope. */
function eligibleLineIndexes(discount: Discount, lines: DiscountLine[]): number[] {
  if (discount.scope === "SPECIFIC_PRODUCTS") {
    const wanted = new Set(discount.productIds);
    return lines.flatMap((l, i) => (wanted.has(l.productId) ? [i] : []));
  }
  if (discount.scope === "SPECIFIC_CATEGORIES") {
    const wanted = new Set(discount.categoryIds);
    return lines.flatMap((l, i) => (l.categoryIds.some((c) => wanted.has(c)) ? [i] : []));
  }
  return lines.map((_, i) => i);
}

export async function validateDiscount(
  code: string,
  context: DiscountContext,
): Promise<DiscountSuccess | DiscountFailure> {
  const normalised = code.trim().toUpperCase();
  if (!normalised) return { ok: false, reason: "Enter a discount code." };

  const discount = await db.discount.findUnique({ where: { code: normalised } });
  if (!discount) return { ok: false, reason: "That code is not recognised." };
  if (!discount.isActive) return { ok: false, reason: "That code is no longer active." };

  const now = new Date();
  if (discount.startsAt && discount.startsAt > now) {
    return { ok: false, reason: "That code is not available yet." };
  }
  if (discount.endsAt && discount.endsAt < now) {
    return { ok: false, reason: "That code has expired." };
  }
  if (discount.usageLimit !== null && discount.timesUsed >= discount.usageLimit) {
    return { ok: false, reason: "That code has been fully redeemed." };
  }

  // Per-customer cap.
  if (discount.usageLimitPerUser !== null && context.userId) {
    const used = await db.discountRedemption.count({
      where: { discountId: discount.id, userId: context.userId },
    });
    if (used >= discount.usageLimitPerUser) {
      return { ok: false, reason: "You have already used that code." };
    }
  }

  // First-order-only codes.
  if (discount.firstOrderOnly) {
    const priorOrders = await db.order.count({
      where: {
        paymentStatus: "SUCCESS",
        ...(context.userId
          ? { userId: context.userId }
          : context.email
            ? { email: context.email }
            : { id: "__none__" }),
      },
    });
    if (priorOrders > 0) {
      return { ok: false, reason: "That code is for first orders only." };
    }
  }

  const indexes = eligibleLineIndexes(discount, context.lines);
  if (indexes.length === 0) {
    return { ok: false, reason: "That code does not apply to anything in your bag." };
  }

  const eligibleSubtotal = indexes.reduce(
    (sum, i) => sum + context.lines[i].unitPrice * context.lines[i].quantity,
    0,
  );
  const eligibleQuantity = indexes.reduce((sum, i) => sum + context.lines[i].quantity, 0);

  if (discount.minSubtotal !== null && eligibleSubtotal < discount.minSubtotal) {
    return { ok: false, reason: "Your bag has not reached the minimum for that code." };
  }
  if (discount.minQuantity !== null && eligibleQuantity < discount.minQuantity) {
    return { ok: false, reason: "Add more items to use that code." };
  }

  // --- Compute the amount ---------------------------------------------------

  let amount = 0;
  let freeShipping = false;

  if (discount.type === "FREE_SHIPPING") {
    freeShipping = true;
  } else if (discount.type === "PERCENTAGE") {
    amount = Math.round((eligibleSubtotal * discount.value) / 100);
  } else {
    // Never discount more than the eligible goods are worth.
    amount = Math.min(discount.value, eligibleSubtotal);
  }

  amount = Math.max(0, Math.min(amount, eligibleSubtotal));

  // Spread the amount back over the eligible lines by their value.
  const allocation = new Array(context.lines.length).fill(0);
  if (amount > 0) {
    const weights = indexes.map((i) => context.lines[i].unitPrice * context.lines[i].quantity);
    const parts = allocateProportionally(amount, weights);
    indexes.forEach((lineIndex, k) => {
      allocation[lineIndex] = parts[k];
    });
  }

  return { ok: true, result: { discount, amount, freeShipping, allocation } };
}

/** Convenience wrapper returning null instead of a failure object. */
export async function applyDiscount(
  code: string | null | undefined,
  context: DiscountContext,
): Promise<DiscountResult | null> {
  if (!code) return null;
  const outcome = await validateDiscount(code, context);
  return outcome.ok ? outcome.result : null;
}

/**
 * Records a redemption and bumps the counter. Called once, inside the same
 * transaction that marks the order paid, so the count cannot drift.
 */
export async function recordRedemption(args: {
  discountId: string;
  orderId: string;
  userId?: string | null;
  amount: number;
}): Promise<void> {
  await db.$transaction(async (tx) => {
    const existing = await tx.discountRedemption.findUnique({
      where: { orderId_discountId: { orderId: args.orderId, discountId: args.discountId } },
    });
    // Webhooks retry; a second delivery must not double-count.
    if (existing) return;

    await tx.discountRedemption.create({
      data: {
        discountId: args.discountId,
        orderId: args.orderId,
        userId: args.userId ?? null,
        amount: args.amount,
      },
    });
    await tx.discount.update({
      where: { id: args.discountId },
      data: { timesUsed: { increment: 1 } },
    });
  });
}

/** Suggests an unused code, e.g. WELCOME10 -> WELCOME10-2 if taken. */
export async function ensureUniqueCode(desired: string): Promise<string> {
  const base = desired.trim().toUpperCase().replace(/\s+/g, "");
  let candidate = base;
  let n = 1;

  for (;;) {
    const existing = await db.discount.findUnique({
      where: { code: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}

export function describeDiscount(discount: Discount): string {
  const scope =
    discount.scope === "ENTIRE_ORDER"
      ? "order"
      : discount.scope === "SPECIFIC_PRODUCTS"
        ? "selected products"
        : "selected categories";

  if (discount.type === "FREE_SHIPPING") return "Free shipping";
  if (discount.type === "PERCENTAGE") return `${discount.value}% off ${scope}`;
  return `${(discount.value / 100).toFixed(2)} off ${scope}`;
}
