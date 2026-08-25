import { NextResponse } from "next/server";
import { computeCartTotals, getOrCreateCart } from "@/lib/cart";
import { quoteShipping } from "@/lib/shipping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Delivery options for a region, priced against the caller's own cart.
 * The cart is read server-side so a client cannot ask for rates on a
 * subtotal it made up.
 */
export async function GET(request: Request) {
  const region = new URL(request.url).searchParams.get("region");

  const cart = await getOrCreateCart();
  const totals = await computeCartTotals(cart);

  const rates = await quoteShipping({
    region,
    subtotal: totals.subtotal,
    totalWeightGrams: totals.totalWeightGrams,
  });

  return NextResponse.json({
    rates: totals.freeShipping ? rates.map((r) => ({ ...r, price: 0, isFree: true })) : rates,
    subtotal: totals.subtotal,
    discountTotal: totals.discountTotal,
    goodsTotal: totals.total,
  });
}
