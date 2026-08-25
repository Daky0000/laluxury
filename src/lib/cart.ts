import { randomUUID } from "node:crypto";
import { db } from "./db";
import { getCartToken, setCartToken, getSession } from "./auth/session";
import { applyDiscount, type DiscountLine, type DiscountResult } from "./discounts";
import { availableOf } from "./inventory";
import type { Prisma } from "@/generated/prisma";

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
  quantity: number;
  unitPrice: number;
  lineTotal: number;
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
  /** Goods after discount; shipping and tax are added at checkout. */
  total: number;
  problems: string[];
};

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
      where: { userId: session.userId, convertedOrderId: null },
      include: cartInclude,
      orderBy: { updatedAt: "desc" },
    });
    if (owned) return owned;
  }

  if (token) {
    const cart = await db.cart.findUnique({ where: { token }, include: cartInclude });
    if (cart && !cart.convertedOrderId) return cart;
  }

  return null;
}

/**
 * Finds or creates the cart for the current visitor, merging a guest cart into
 * the account cart on sign-in. Writes a cookie, so this is only safe inside a
 * Server Action or Route Handler.
 */
export async function getOrCreateCart(): Promise<CartWithItems> {
  const session = await getSession();
  const token = await getCartToken();

  if (session) {
    const existing = await db.cart.findFirst({
      where: { userId: session.userId, convertedOrderId: null },
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
    if (cart && !cart.convertedOrderId) return cart;
  }

  const created = await db.cart.create({
    data: { token: randomUUID() },
    include: cartInclude,
  });
  await setCartToken(created.token);
  return created;
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
  if (quantity < 1) throw new Error("Quantity must be at least 1.");

  const cart = await getOrCreateCart();
  const variant = await db.variant.findUnique({
    where: { id: variantId },
    include: { inventory: true, product: { select: { status: true } } },
  });

  if (!variant || !variant.isActive) throw new Error("That item is unavailable.");
  if (variant.product.status !== "ACTIVE") throw new Error("That product is not on sale.");

  const existing = cart.items.find((i) => i.variantId === variantId);
  const desired = (existing?.quantity ?? 0) + quantity;

  // Cap at what is actually sellable rather than failing the whole add.
  const inv = variant.inventory;
  if (inv && inv.trackInventory && !inv.allowBackorder) {
    const available = availableOf(inv);
    if (available <= 0) throw new Error("That item is out of stock.");
    if (desired > available) {
      throw new Error(`Only ${available} left in stock.`);
    }
  }

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

export async function updateCartLine(itemId: string, quantity: number): Promise<CartWithItems> {
  const cart = await getOrCreateCart();
  const item = cart.items.find((i) => i.id === itemId);
  if (!item) throw new Error("That line is no longer in your bag.");

  if (quantity <= 0) {
    await db.cartItem.delete({ where: { id: itemId } });
  } else {
    const inv = item.variant.inventory;
    if (inv && inv.trackInventory && !inv.allowBackorder && quantity > availableOf(inv)) {
      throw new Error(`Only ${Math.max(0, availableOf(inv))} left in stock.`);
    }
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
    const tracked = Boolean(inv && inv.trackInventory && !inv.allowBackorder);
    const available = tracked && inv ? Math.max(0, availableOf(inv)) : null;

    let stockProblem: string | null = null;
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
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.unitPrice * item.quantity,
      availableStock: available,
      stockProblem,
    };
  });

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
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
    });

    // Code went stale (expired, limit hit, bag changed) - drop it quietly.
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
    total: Math.max(0, subtotal - discountTotal),
    problems,
  };
}

/** Lightweight count for the header badge. */
export async function cartItemCount(): Promise<number> {
  const session = await getSession();
  const token = await getCartToken();
  if (!session && !token) return 0;

  const cart = await db.cart.findFirst({
    where: session ? { userId: session.userId, convertedOrderId: null } : { token: token! },
    select: { items: { select: { quantity: true } } },
  });

  return cart?.items.reduce((sum, i) => sum + i.quantity, 0) ?? 0;
}
