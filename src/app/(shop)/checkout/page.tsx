import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { computeCartTotals, readCart } from "@/lib/cart";
import { currentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { CheckoutForm } from "@/components/shop/checkout-form";
import { Alert } from "@/components/ui";

export const metadata: Metadata = { title: "Checkout" };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const cart = await readCart();
  if (!cart) redirect("/cart");

  const totals = await computeCartTotals(cart);
  if (totals.lines.length === 0) redirect("/cart");

  const user = await currentUser();

  return (
    <div className="lx-container py-10">
      <h1 className="mb-8 text-3xl md:text-4xl">Checkout</h1>

      {!env.paystack.isConfigured() ? (
        <div className="mb-8">
          <Alert tone="warning">
            Payments are not switched on yet. Add PAYSTACK_SECRET_KEY and
            NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY to accept orders.
          </Alert>
        </div>
      ) : null}

      <CheckoutForm
        subtotal={totals.subtotal}
        discountTotal={totals.discountTotal}
        goodsTotal={totals.total}
        defaultEmail={user?.email ?? cart.email ?? ""}
        isSignedIn={Boolean(user)}
      />
    </div>
  );
}
