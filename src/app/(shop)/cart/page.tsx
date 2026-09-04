import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { computeCartTotals, readCart } from "@/lib/cart";
import { formatPrice } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { CartLines, DiscountForm } from "@/components/shop/cart-lines";

export const metadata: Metadata = { title: "Your bag" };
export const dynamic = "force-dynamic";

export default async function CartPage() {
  const cart = await readCart();
  const totals = cart ? await computeCartTotals(cart) : null;

  if (!totals || totals.lines.length === 0) {
    return (
      <div className="lx-container py-24 text-center">
        <h1 className="text-[clamp(2.25rem,5vw,3.25rem)]">Your bag</h1>
        <p className="mt-4 text-[15px] font-light text-[var(--text-muted)]">
          Your bag is empty.{" "}
          <Link href="/shop" className="text-[var(--accent)] underline underline-offset-4">
            Browse all products →
          </Link>
        </p>
      </div>
    );
  }

  const settings = await getSettings();
  const freeGap =
    settings.freeShippingThreshold && totals.total < settings.freeShippingThreshold
      ? settings.freeShippingThreshold - totals.total
      : 0;

  return (
    <div className="lx-container pb-16 pt-11">
      <h1 className="mb-6 text-[clamp(2.25rem,5vw,3.25rem)]">Your bag</h1>

      <div className="grid items-start gap-10 lg:grid-cols-[1fr_400px] lg:gap-13">
        <div>
          {totals.problems.length > 0 ? (
            <p className="mb-5 border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">
              Some items need attention before you can check out.
            </p>
          ) : null}

          <CartLines lines={totals.lines} />
        </div>

        <aside className="border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6 lg:sticky lg:top-28">
          <h2 className="mb-5 font-display text-2xl">Order summary</h2>

          <DiscountForm appliedCode={totals.discountCode} />

          <dl className="mt-4">
            <div className="flex justify-between py-2 text-sm text-[var(--text-secondary)]">
              <dt>
                Subtotal ({totals.itemCount} {totals.itemCount === 1 ? "item" : "items"})
              </dt>
              <dd className="tabular-nums">{formatPrice(totals.subtotal)}</dd>
            </div>

            {totals.discountTotal > 0 ? (
              <div className="flex justify-between py-2 text-sm text-sage-600">
                <dt>Discount</dt>
                <dd className="tabular-nums">-{formatPrice(totals.discountTotal)}</dd>
              </div>
            ) : null}

            <div className="flex justify-between py-2 text-sm text-[var(--text-secondary)]">
              <dt>Delivery</dt>
              <dd>{totals.freeShipping ? "Free" : "At checkout"}</dd>
            </div>
          </dl>

          {freeGap > 0 ? (
            <p className="pb-2 text-sm text-sage-600">
              Add {formatPrice(freeGap)} more for free delivery
            </p>
          ) : null}

          <div className="mt-2.5 flex items-baseline justify-between border-t border-[var(--border-strong)] pt-4">
            <span className="text-sm uppercase tracking-[0.06em]">Total</span>
            <span className="text-3xl tabular-nums">{formatPrice(totals.total)}</span>
          </div>

          <Link
            href="/checkout"
            aria-disabled={totals.problems.length > 0}
            className="mt-5 flex w-full items-center justify-center bg-[var(--accent)] px-6 py-4 text-sm font-medium uppercase tracking-[0.14em] text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)]"
          >
            Checkout
          </Link>

          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
            <Lock className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
            Encrypted &amp; secure
          </p>

          <Link
            href="/shop"
            className="mt-3 block text-center text-sm text-[var(--text-secondary)] underline-offset-4 hover:underline"
          >
            Continue shopping
          </Link>
        </aside>
      </div>
    </div>
  );
}
