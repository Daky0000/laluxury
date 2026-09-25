import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { computeCartTotals, readCart } from "@/lib/cart";
import { currentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getIntegrations, isReady } from "@/lib/integrations";
import { formatPhone } from "@/lib/phone";
import { CheckoutForm, type CheckoutDefaults } from "@/components/shop/checkout-form";
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

  const savedAddresses = user
    ? await db.address.findMany({
        where: { userId: user.id },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
        take: 6,
      })
    : [];

  const lastAddress = savedAddresses[0] ?? null;

  const defaults: CheckoutDefaults = {
    email: user?.email ?? cart.email ?? "",
    firstName: lastAddress?.firstName ?? user?.firstName ?? "",
    lastName: lastAddress?.lastName ?? user?.lastName ?? "",
    phone: formatPhone(lastAddress?.phone ?? user?.phone ?? ""),
    line1: lastAddress?.line1 ?? "",
    line2: lastAddress?.line2 ?? "",
    city: lastAddress?.city ?? "",
    region: lastAddress?.region ?? "",
    postalCode: lastAddress?.postalCode ?? "",
  };

  const hasPreorderItems = totals.lines.some((line) => line.isPreorder);
  const paystackReady = isReady(integrations, "paystack");

  return (
    <div className="lx-container py-12 sm:py-16">
      <h1 className="mb-8 text-[clamp(2rem,5vw,3rem)]">Your bag &amp; checkout</h1>

      <CheckoutForm
        subtotal={totals.subtotal}
        discountTotal={totals.discountTotal}
        goodsTotal={totals.total}
        defaults={defaults}
        savedAddresses={savedAddresses.map((a) => ({
          id: a.id,
          label: `${a.city}, ${a.region}`,
          firstName: a.firstName,
          lastName: a.lastName,
          phone: formatPhone(a.phone),
          line1: a.line1,
          line2: a.line2 ?? "",
          city: a.city,
          region: a.region,
          postalCode: a.postalCode ?? "",
        }))}
        isSignedIn={Boolean(user)}
        hasPreorderItems={hasPreorderItems}
        paystackReady={paystackReady}
        freeShippingThreshold={settings.freeShippingThreshold}
        lines={<CartLines lines={totals.lines} />}
        discount={<DiscountForm appliedCode={totals.discountCode} />}
      />
    </div>
  );
}
