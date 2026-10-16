import { assertMinimumOrderQuantity, minimumOrderProblem } from "./minimum-order";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { getCartToken, setCartToken, getSession } from "./auth/session";
import { applyDiscount, type DiscountLine, type DiscountResult } from "./discounts";
import { depositPercentFor } from "./deposits";
import { availableOf } from "./inventory";
import type { PaymentStatus, Prisma } from "@/generated/prisma";

/**
 * Carts are keyed by an httpOnly cookie token for guests and additionally by
 * userId once signed in. Signing in merges the guest cart into the account
 * cart rather than discarding either.
 */

const cartInclude = {
  items: {
    orderBy: { createdAt: "asc" },
    include: {
      variant: {
        include: {
          inventory: true,
          optionValues: { include: { optionValue: { include: { option: true } } } },
          product: {
            include: {
              images: { orderBy: { position: "asc" }, take: 1 },
              categories: { select: { categoryId: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

export type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

export type CartLineView = {
  id: string;
  variantId: string;
  productId: string;
  slug: string;
  productTitle: string;
  variantTitle: string;
  sku: string;
  imageUrl: string | null;
  minimumOrderQuantity: number;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  isPreorder: boolean;
  preorderLeadTime: string | null;
  /** Null when the variant is untracked, otherwise units the shopper may still add. */
  availableStock: number | null;
  /** Set when the line exceeds what is in stock, so checkout can block. */
  stockProblem: string | null;
};

export type CartTotals = {
  lines: CartLineView[];
  itemCount: number;
  subtotal: number;
  discountTotal: number;
  discountCode: string | null;
  discountLabel: string | null;
  freeShipping: boolean;
  totalWeightGrams: number;
  hasPreorderItems: boolean;
  /** Deposit due now when the shopper splits a pre-order payment (null: no split offered). */
  depositPercent: number | null;
  /** Goods after discount; shipping and tax are added at checkout. */
  total: number;
  problems: string[];
};

/** Shared sellability and stock guard for every web and mobile cart mutation. */
export async function validateCartVariantQuantity(variantId: string, quantity: number) {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new Error("Quantity must be at least 1.");
  }

  const variant = await db.variant.findUnique({
    where: { id: variantId },
    include: { inventory: true, product: { select: { status: true, title: true, minimumOrderQuantity: true, isPreorder: true } } },
  });

  if (!variant || !variant.isActive) throw new Error("That item is unavailable.");
  if (variant.product.status !== "ACTIVE") throw new Error("That product is not on sale.");

  assertMinimumOrderQuantity(variant.product.title, quantity, variant.product.minimumOrderQuantity);
  const inv = variant.inventory;
  if (inv && inv.trackInventory && !inv.allowBackorder && !variant.product.isPreorder) {
    const available = availableOf(inv);
    if (available <= 0) throw new Error("That item is out of stock.");
    if (quantity > available) throw new Error(`Only ${available} left in stock.`);
  }

  return variant;
}

const UNPAID: PaymentStatus[] = ["PENDING", "FAILED", "ABANDONED"];

/**
 * Checkout tags a cart with the order it became, but the bag has to outlive
 * that order until it is actually paid. A MoMo prompt still waiting for
 * approval, or a payment that failed or was abandoned, must leave the
 * shopper's pieces where they were, so going back from the payment step finds
 * the bag intact. Payment clears the cart (`markOrderPaid`), and checking out
 * from it again replaces the earlier attempt (`settleEarlierCheckout`).
 */
async function isAwaitingPayment(cart: {
  convertedOrderId: string | null;
  items: unknown[];
}): Promise<boolean> {
  if (!cart.convertedOrderId || cart.items.length === 0) return false;
  const order = await db.order.findUnique({
    where: { id: cart.convertedOrderId },
    select: { paidAt: true, paymentStatus: true, status: true, placedAt: true },
  });
  // Only while that checkout is still open. A cancelled or expired attempt
  // used to keep its bag live for good, so old (even test) lines kept coming
  // back long after the shopper had moved on.
  return Boolean(
    order &&
      !order.paidAt &&
      order.status === "PENDING" &&
      UNPAID.includes(order.paymentStatus) &&
      Date.now() - order.placedAt.getTime() < BAG_HOLD_MS,
  );
}

/** Matches `PENDING_ORDER_TTL_MS` in orders.ts, when an unpaid checkout expires. */
const BAG_HOLD_MS = 6 * 60 * 60 * 1000;

/**
 * Brings stored lines in line with the catalogue: lines for products taken
 * off sale (archived, draft, or a disabled variant) are dropped, and prices
 * are re-read, since a line keeps the price from when it was added and
 * checkout charges what the cart holds. Returns true when anything changed.
 */
export async function refreshCartLines(cartId: string): Promise<boolean> {
  const items = await db.cartItem.findMany({
    where: { cartId },
    select: {
      id: true,
      unitPrice: true,
      variant: { select: { price: true, isActive: true, product: { select: { status: true } } } },
    },
  });
  const gone = items
    .filter((item) => !item.variant.isActive || item.variant.product.status !== "ACTIVE")
    .map((item) => item.id);
  const repriced = items.filter(
    (item) => !gone.includes(item.id) && item.unitPrice !== item.variant.price,
  );
  if (gone.length === 0 && repriced.length === 0) return false;

  await db.$transaction([
    db.cartItem.deleteMany({ where: { id: { in: gone } } }),
    ...repriced.map((item) =>
      db.cartItem.update({ where: { id: item.id }, data: { unitPrice: item.variant.price } }),
    ),
  ]);
  return true;
}

async function fresh(cart: CartWithItems): Promise<CartWithItems> {
  return (await refreshCartLines(cart.id)) ? reload(cart.id) : cart;
}

/** A cart the visitor is still shopping with: never checked out, or not yet paid for. */
async function isLive(cart: { convertedOrderId: string | null; items: unknown[] }): Promise<boolean> {
  return !cart.convertedOrderId || isAwaitingPayment(cart);
}

/**
 * Where to find the cart a signed-in customer is shopping with, on web or in
 * the app: the open cart, or failing that the bag whose order still waits on
 * payment.
 */
export async function liveCartWhere(userId: string): Promise<Prisma.CartWhereInput> {
  const open: Prisma.CartWhereInput = { userId, convertedOrderId: null };
  if (await db.cart.findFirst({ where: open, select: { id: true } })) return open;

  const pending = await db.cart.findFirst({
    where: { userId, convertedOrderId: { not: null }, items: { some: {} } },
    select: { id: true, convertedOrderId: true, items: { select: { id: true }, take: 1 } },
    orderBy: { updatedAt: "desc" },
  });
  return pending && (await isAwaitingPayment(pending)) ? { id: pending.id } : open;
}

/**
 * Read-only cart lookup for Server Components.
 *
 * Pages must use this rather than `getOrCreateCart`: creating a cart writes a
 * cookie, and Next only permits that inside a Server Action or Route Handler.
 * Returns null when the visitor has no cart yet, which renders as an empty bag.
 */
export async function readCart(): Promise<CartWithItems | null> {
  const session = await getSession();
  const token = await getCartToken();

  if (session) {
    const owned = await db.cart.findFirst({
      where: await liveCartWhere(session.userId),
      include: cartInclude,
      orderBy: { updatedAt: "desc" },
    });
    if (owned) return fresh(owned);
  }

  if (token) {
    const cart = await db.cart.findUnique({ where: { token }, include: cartInclude });
    if (cart && (await isLive(cart))) return fresh(cart);
  }

  return null;
}

/**
 * Finds or creates the cart for the current visitor, merging a guest cart into
 * the account cart on sign-in. Writes a cookie, so this is only safe inside a
 * Server Action or Route Handler.
 */
export async function getOrCreateCart(): Promise<CartWithItems> {
  return fresh(await findOrCreateCart());
}

async function findOrCreateCart(): Promise<CartWithItems> {
  const session = await getSession();
  const token = await getCartToken();

  if (session) {
    const existing = await db.cart.findFirst({
      where: await liveCartWhere(session.userId),
      include: cartInclude,
      orderBy: { updatedAt: "desc" },
    });

    // Merge a guest cart picked up before signing in.
    if (token) {
      const guest = await db.cart.findUnique({ where: { token }, include: cartInclude });
      if (guest && guest.id !== existing?.id && !guest.convertedOrderId) {
        const target = existing ?? (await db.cart.update({
          where: { id: guest.id },
          data: { userId: session.userId },
          include: cartInclude,
        }));

        if (existing) {
          await mergeCarts(guest.id, target.id);
          await db.cart.delete({ where: { id: guest.id } }).catch(() => {});
        }
        return reload(target.id);
      }

      // A guest bag still waiting on payment is adopted whole, never merged,
      // so it stays tied to the order it may yet be paid for.
      if (
        !existing &&
        guest &&
        (!guest.userId || guest.userId === session.userId) &&
        (await isAwaitingPayment(guest))
      ) {
        if (!guest.userId) {
          await db.cart.update({ where: { id: guest.id }, data: { userId: session.userId } });
        }
        return reload(guest.id);
      }
    }

    if (existing) return existing;

    const created = await db.cart.create({
      data: { userId: session.userId, token: randomUUID() },
      include: cartInclude,
    });
    await setCartToken(created.token);
    return created;
  }

  if (token) {
    const cart = await db.cart.findUnique({ where: { token }, include: cartInclude });
    if (cart && (await isLive(cart))) return cart;
  }

  const created = await db.cart.create({
    data: { token: randomUUID() },
    include: cartInclude,
  });
  await setCartToken(created.token);
  return created;
}

/**
 * A cart built from lines the app sends at checkout, so app orders are priced
 * and placed by exactly the same code as web orders (`createOrderFromCart`).
 * Prices come from the catalogue, never from the request. The cart has no
 * owner or cookie; it exists to become one order.
 */
export async function createCheckoutCart(args: {
  lines: { variantId: string; quantity: number }[];
  email: string;
  discountCode?: string | null;
}): Promise<CartWithItems> {
  const merged = new Map<string, number>();
  for (const line of args.lines) merged.set(line.variantId, (merged.get(line.variantId) ?? 0) + line.quantity);

  const variants = await db.variant.findMany({
    where: { id: { in: [...merged.keys()] } },
    select: { id: true, price: true },
  });
  const price = new Map(variants.map((v) => [v.id, v.price]));

  const created = await db.cart.create({
    data: {
      token: randomUUID(),
      email: args.email,
      discountCode: args.discountCode?.trim().toUpperCase() || null,
      items: {
        create: [...merged.entries()]
          .filter(([variantId]) => price.has(variantId))
          .map(([variantId, quantity]) => ({ variantId, quantity, unitPrice: price.get(variantId)! })),
      },
    },
    select: { id: true },
  });
  return reload(created.id);
}

async function reload(cartId: string): Promise<CartWithItems> {
  const cart = await db.cart.findUnique({ where: { id: cartId }, include: cartInclude });
  if (!cart) throw new Error("Cart disappeared while loading.");
  return cart;
}

/** Moves lines from one cart into another, summing quantities on collisions. */
async function mergeCarts(sourceId: string, targetId: string): Promise<void> {
  const sourceItems = await db.cartItem.findMany({ where: { cartId: sourceId } });

  for (const item of sourceItems) {
    await db.cartItem.upsert({
      where: { cartId_variantId: { cartId: targetId, variantId: item.variantId } },
      create: {
        cartId: targetId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      },
      update: { quantity: { increment: item.quantity } },
    });
  }
}

async function touch(cartId: string): Promise<void> {
  await db.cart.update({
    where: { id: cartId },
    data: { lastActivityAt: new Date() },
  });
}

export async function addToCart(variantId: string, quantity = 1): Promise<CartWithItems> {
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error("Quantity must be at least 1.");

  const cart = await getOrCreateCart();
  const existing = cart.items.find((i) => i.variantId === variantId);
  const desired = (existing?.quantity ?? 0) + quantity;
  const variant = await validateCartVariantQuantity(variantId, desired);

  await db.cartItem.upsert({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
    create: {
      cartId: cart.id,
      variantId,
      quantity,
      unitPrice: variant.price,
    },
    // Re-snapshot the price so a long-lived cart follows current pricing.
    update: { quantity: desired, unitPrice: variant.price },
  });

  await touch(cart.id);
  return reload(cart.id);
}

export async function addManyToCart(
  items: { variantId: string; quantity: number }[],
): Promise<CartWithItems> {
  const wanted = new Map<string, number>();
  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity)) throw new Error("Quantity must be a whole number.");
    if (item.quantity < 1) continue;
    wanted.set(item.variantId, (wanted.get(item.variantId) ?? 0) + item.quantity);
  }
  if (wanted.size === 0) throw new Error("Choose a quantity first.");

  const cart = await getOrCreateCart();
  const variants = await db.variant.findMany({
    where: { id: { in: [...wanted.keys()] } },
    include: { inventory: true, product: { select: { status: true, title: true, minimumOrderQuantity: true, isPreorder: true } } },
  });

  const planned: { variantId: string; quantity: number; unitPrice: number }[] = [];

  for (const [variantId, quantity] of wanted) {
    const variant = variants.find((v) => v.id === variantId);
    if (!variant || !variant.isActive) throw new Error("One of those items is unavailable.");
    if (variant.product.status !== "ACTIVE") {
      throw new Error(`${variant.product.title} is not on sale.`);
    }

    const existing = cart.items.find((i) => i.variantId === variantId);
    const desired = (existing?.quantity ?? 0) + quantity;
    assertMinimumOrderQuantity(variant.product.title, desired, variant.product.minimumOrderQuantity);

    const inv = variant.inventory;
    if (inv && inv.trackInventory && !inv.allowBackorder && !variant.product.isPreorder) {
      const available = availableOf(inv);
      if (available <= 0) throw new Error(`${variant.title} is out of stock.`);
      if (desired > available) {
        throw new Error(`Only ${available} left of ${variant.title}.`);
      }
    }

    planned.push({ variantId, quantity: desired, unitPrice: variant.price });
  }

  await db.$transaction(
    planned.map((line) =>
      db.cartItem.upsert({
        where: { cartId_variantId: { cartId: cart.id, variantId: line.variantId } },
        create: {
          cartId: cart.id,
          variantId: line.variantId,
          // `quantity` here is already the running total, which is what the
          // update branch wants; a brand new line has nothing to add it to.
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        },
        update: { quantity: line.quantity, unitPrice: line.unitPrice },
      }),
    ),
  );

  await touch(cart.id);
  return reload(cart.id);
}

export async function updateCartLine(itemId: string, quantity: number): Promise<CartWithItems> {
  const cart = await getOrCreateCart();
  const item = cart.items.find((i) => i.id === itemId);
  if (!item) throw new Error("That line is no longer in your bag.");

  if (!Number.isSafeInteger(quantity)) throw new Error("Quantity must be a whole number.");
  if (quantity <= 0) {
    await db.cartItem.delete({ where: { id: itemId } });
  } else {
    await validateCartVariantQuantity(item.variantId, quantity);
    await db.cartItem.update({ where: { id: itemId }, data: { quantity } });
  }

  await touch(cart.id);
  return reload(cart.id);
}

export async function removeCartLine(itemId: string): Promise<CartWithItems> {
  const cart = await getOrCreateCart();
  await db.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
  await touch(cart.id);
  return reload(cart.id);
}

export async function clearCart(cartId: string): Promise<void> {
  await db.cartItem.deleteMany({ where: { cartId } });
  await db.cart.update({ where: { id: cartId }, data: { discountCode: null } });
}

export async function setCartDiscountCode(code: string | null): Promise<CartWithItems> {
  const cart = await getOrCreateCart();
  await db.cart.update({
    where: { id: cart.id },
    data: { discountCode: code ? code.trim().toUpperCase() : null },
  });
  return reload(cart.id);
}

/** Shapes cart rows into the lines the discount engine expects. */
export function toDiscountLines(cart: CartWithItems): DiscountLine[] {
  return cart.items.map((item) => ({
    variantId: item.variantId,
    productId: item.variant.productId,
    categoryIds: item.variant.product.categories.map((c) => c.categoryId),
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  }));
}

/**
 * The single source of truth for what a cart costs. Checkout recomputes this
 * server-side rather than trusting anything the browser sends.
 */
export async function computeCartTotals(cart: CartWithItems): Promise<CartTotals> {
  const session = await getSession();
  const problems: string[] = [];

  const lines: CartLineView[] = cart.items.map((item) => {
    const inv = item.variant.inventory;
    const isPreorder = Boolean(item.variant.product.isPreorder);
    const tracked = Boolean(inv && inv.trackInventory && !inv.allowBackorder && !isPreorder);
    const available = tracked && inv ? Math.max(0, availableOf(inv)) : null;

    let stockProblem = minimumOrderProblem(item.variant.product.title, item.quantity, item.variant.product.minimumOrderQuantity);
    if (stockProblem) problems.push(stockProblem);
    if (available !== null && item.quantity > available) {
      stockProblem =
        available === 0
          ? `${item.variant.product.title} is out of stock.`
          : `Only ${available} of ${item.variant.product.title} left.`;
      problems.push(stockProblem);
    }

    return {
      id: item.id,
      variantId: item.variantId,
      productId: item.variant.productId,
      slug: item.variant.product.slug,
      productTitle: item.variant.product.title,
      variantTitle: item.variant.title,
      sku: item.variant.sku,
      imageUrl: item.variant.product.images[0]?.url ?? null,
      minimumOrderQuantity: item.variant.product.minimumOrderQuantity,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.unitPrice * item.quantity,
      isPreorder,
      preorderLeadTime: item.variant.product.preorderLeadTime ?? (isPreorder ? "2–3 weeks" : null),
      availableStock: available,
      stockProblem,
    };
  });

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  const hasPreorderItems = lines.some((l) => l.isPreorder);
  const totalWeightGrams = cart.items.reduce(
    (sum, i) => sum + (i.variant.weightGrams ?? 0) * i.quantity,
    0,
  );

  let discount: DiscountResult | null = null;
  if (cart.discountCode && lines.length > 0) {
    discount = await applyDiscount(cart.discountCode, {
      lines: toDiscountLines(cart),
      subtotal,
      shippingTotal: 0,
      userId: session?.userId ?? null,
      email: cart.email,
      // The bag's own checkout, still awaiting payment, is not a rival use.
      excludeOrderId: cart.convertedOrderId,
    });

    if (!discount) {
      await db.cart.update({ where: { id: cart.id }, data: { discountCode: null } });
    }
  }

  const discountTotal = discount?.amount ?? 0;

  return {
    lines,
    itemCount,
    subtotal,
    discountTotal,
    discountCode: discount ? cart.discountCode : null,
    discountLabel: discount ? discount.discount.description ?? cart.discountCode : null,
    freeShipping: discount?.freeShipping ?? false,
    totalWeightGrams,
    hasPreorderItems,
    depositPercent: depositPercentFor(cart.items.map((item) => item.variant.product)),
    total: Math.max(0, subtotal - discountTotal),
    problems,
  };
}

import { isDbTemporarilyDown, recordDbFailure } from "@/lib/db-health";

/** Lightweight count for the header badge. */
export async function cartItemCount(): Promise<number> {
  if (isDbTemporarilyDown()) return 0;

  try {
    const session = await getSession();
    const token = await getCartToken();
    if (!session && !token) return 0;

    const cart = await db.cart.findFirst({
      where: session ? await liveCartWhere(session.userId) : { token: token! },
      select: { items: { select: { quantity: true } } },
    });

    return cart?.items.reduce((sum, i) => sum + i.quantity, 0) ?? 0;
  } catch {
    recordDbFailure();
    return 0;
  }
}
