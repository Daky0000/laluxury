import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { computeCartTotals, readCart } from "@/lib/cart";
import { formatMoney } from "@/lib/money";
import { CartLines, DiscountForm } from "@/components/shop/cart-lines";
import { EmptyState, LinkButton, Card, Alert } from "@/components/ui";

export const metadata: Metadata = { title: "Your bag" };
export const dynamic = "force-dynamic";

export default async function CartPage() {
  const cart = await readCart();
  const totals = cart ? await computeCartTotals(cart) : null;

  if (!totals || totals.lines.length === 0) {
    return (
      <div className="lx-container py-20">
        <EmptyState
          icon={<ShoppingBag className="h-8 w-8" aria-hidden />}
          title="Your bag is empty"
          description="Once you add something it will show up here."
          action={
            <LinkButton href="/shop" className="mt-2">
              Start shopping
            </LinkButton>
          }
        />
      </div>
    );
  }

  return (
    <div className="lx-container py-10">
      <h1 className="mb-8 text-3xl md:text-4xl">Your bag</h1>

      <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
        <div>
          {totals.problems.length > 0 ? (
            <div className="mb-6">
              <Alert tone="warning">
                Some items need attention before you can check out.
              </Alert>
            </div>
          ) : null}
          <CartLines lines={totals.lines} />
        </div>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <Card className="p-5">
            <h2 className="lx-eyebrow mb-4">Summary</h2>

            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--text-secondary)]">
                  Subtotal ({totals.itemCount} {totals.itemCount === 1 ? "item" : "items"})
                </dt>
                <dd className="tabular-nums">{formatMoney(totals.subtotal)}</dd>
              </div>

              {totals.discountTotal > 0 ? (
                <div className="flex justify-between text-success">
                  <dt>Discount</dt>
                  <dd className="tabular-nums">-{formatMoney(totals.discountTotal)}</dd>
                </div>
              ) : null}

              <div className="flex justify-between">
                <dt className="text-[var(--text-secondary)]">Delivery</dt>
                <dd className="text-[var(--text-secondary)]">
                  {totals.freeShipping ? "Free" : "At checkout"}
                </dd>
              </div>
            </dl>

            <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm">Total</span>
                <span className="font-display text-2xl tabular-nums">
                  {formatMoney(totals.total)}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Delivery added at checkout.</p>
            </div>

            <div className="mt-5">
              <DiscountForm appliedCode={totals.discountCode} />
            </div>

            <LinkButton
              href="/checkout"
              size="lg"
              className="mt-5 w-full"
              aria-disabled={totals.problems.length > 0}
            >
              Checkout
            </LinkButton>

            <Link
              href="/shop"
              className="mt-3 block text-center text-xs text-[var(--text-secondary)] underline-offset-4 hover:underline"
            >
              Continue shopping
            </Link>
          </Card>
        </aside>
      </div>
    </div>
  );
}
