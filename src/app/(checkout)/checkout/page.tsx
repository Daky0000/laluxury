import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { computeCartTotals, readCart } from "@/lib/cart";
import { currentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getIntegrations, isReady } from "@/lib/integrations";
import { CheckoutForm } from "@/components/shop/checkout-form";
import { CartLines, DiscountForm } from "@/components/shop/cart-lines";

export const metadata: Metadata = { title: "Your bag" };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const cart = await readCart();
  if (!cart) redirect("/cart");

  const totals = await computeCartTotals(cart);
  if (totals.lines.length === 0) redirect("/cart");

  const [user, settings, integrations] = await Promise.all([
    currentUser(),
    getSettings(),
    getIntegrations(),
  ]);

  return (
    <div className="lx-container pb-16 pt-11">
      <h1 className="mb-6 text-[clamp(2.25rem,5vw,3.25rem)]">Your bag</h1>

      {!isReady(integrations, "paystack") ? (
        <p className="mb-8 border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">
          Payments are not switched on yet. Add your Paystack keys under Settings →
          Integrations to accept orders.
        </p>
      ) : null}

      <CheckoutForm
        subtotal={totals.subtotal}
        discountTotal={totals.discountTotal}
        goodsTotal={totals.total}
        defaultEmail={user?.email ?? cart.email ?? ""}
        isSignedIn={Boolean(user)}
        freeShippingThreshold={settings.freeShippingThreshold}
        lines={<CartLines lines={totals.lines} />}
        discount={<DiscountForm appliedCode={totals.discountCode} />}
      />
    </div>
  );
}
