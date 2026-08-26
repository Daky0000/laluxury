"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addToCart,
  getOrCreateCart,
  readCart,
  removeCartLine,
  setCartDiscountCode,
  updateCartLine,
  type CartLineView,
} from "@/lib/cart";
import { validateDiscount } from "@/lib/discounts";
import { toDiscountLines, computeCartTotals } from "@/lib/cart";
import { getSession } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";

export type ActionState = { ok: boolean; message?: string };

export async function addToCartAction(
  variantId: string,
  quantity = 1,
): Promise<ActionState> {
  try {
    await addToCart(variantId, quantity);
    revalidatePath("/cart");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not add that." };
  }
}

/**
 * Quick order: adds the piece and goes straight to checkout.
 *
 * For the shopper who already knows what they want — one tap from the tile to
 * the payment screen, skipping the bag entirely. The redirect happens here
 * rather than in the browser so the cart cookie is already written when the
 * checkout page renders.
 */
export async function buyNowAction(variantId: string, quantity = 1): Promise<ActionState> {
  try {
    await addToCart(variantId, quantity);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not add that." };
  }

  revalidatePath("/cart");
  revalidatePath("/", "layout");

  // Outside the try: redirect() signals by throwing, and catching it here would
  // turn a successful hand-off into an error message.
  redirect("/checkout");
}

export type CartSummary = {
  lines: CartLineView[];
  itemCount: number;
  subtotal: number;
  /** Copy for the drawer's delivery row, e.g. "Complimentary". */
  deliveryLabel: string;
};

/**
 * What the mini-bag drawer renders. Read-only, so it never creates a cart for
 * a visitor who has not added anything yet.
 */
export async function cartSummaryAction(): Promise<CartSummary> {
  const cart = await readCart();
  const settings = await getSettings();

  if (!cart) {
    return { lines: [], itemCount: 0, subtotal: 0, deliveryLabel: "—" };
  }

  const totals = await computeCartTotals(cart);
  const threshold = settings.freeShippingThreshold;

  const deliveryLabel =
    totals.subtotal === 0
      ? "—"
      : threshold !== null && totals.subtotal >= threshold
        ? "Complimentary"
        : "Calculated at checkout";

  return {
    lines: totals.lines,
    itemCount: totals.itemCount,
    subtotal: totals.subtotal,
    deliveryLabel,
  };
}

export async function updateCartLineAction(
  itemId: string,
  quantity: number,
): Promise<ActionState> {
  try {
    await updateCartLine(itemId, quantity);
    revalidatePath("/cart");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not update that." };
  }
}

export async function removeCartLineAction(itemId: string): Promise<ActionState> {
  try {
    await removeCartLine(itemId);
    revalidatePath("/cart");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not remove that." };
  }
}

export async function applyDiscountAction(code: string): Promise<ActionState> {
  const cart = await getOrCreateCart();
  const totals = await computeCartTotals(cart);
  const session = await getSession();

  const outcome = await validateDiscount(code, {
    lines: toDiscountLines(cart),
    subtotal: totals.subtotal,
    shippingTotal: 0,
    userId: session?.userId ?? null,
    email: cart.email,
  });

  if (!outcome.ok) return { ok: false, message: outcome.reason };

  await setCartDiscountCode(code);
  revalidatePath("/cart");
  revalidatePath("/checkout");
  return { ok: true, message: `${outcome.result.discount.code} applied.` };
}

export async function removeDiscountAction(): Promise<ActionState> {
  await setCartDiscountCode(null);
  revalidatePath("/cart");
  revalidatePath("/checkout");
  return { ok: true };
}
