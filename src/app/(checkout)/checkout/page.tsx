import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { computeCartTotals, readCart } from "@/lib/cart";
import { currentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatPhone } from "@/lib/phone";
import { isPickupAddress } from "@/lib/pickup-locations";
import { CheckoutForm, type CheckoutDefaults } from "@/components/shop/checkout-form";
import { DiscountForm } from "@/components/shop/cart-lines";

export const metadata: Metadata = { title: "Checkout" };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const cart = await readCart();
  if (!cart) redirect("/cart");

  const totals = await computeCartTotals(cart);
  if (totals.lines.length === 0) redirect("/cart");

  const [user, settings] = await Promise.all([
    currentUser(),
    getSettings(),
  ]);

  // Every order's address is kept on the account, pickup orders included, so
  // the list is cleaned: pickup points are not delivery addresses, and the
  // same address used for several orders is offered once.
  const savedAddresses = user
    ? dedupeAddresses(
        (
          await db.address.findMany({
            where: { userId: user.id },
            orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
            take: 40,
          })
        ).filter((a) => !isPickupAddress(a.line1)),
      ).slice(0, 6)
    : [];

  // A bag coming back from an unfinished payment keeps what was typed last time,
  // so a guest retrying does not fill the delivery form in again.
  const earlierOrder = cart.convertedOrderId
    ? await db.order.findUnique({
        where: { id: cart.convertedOrderId },
        select: { email: true, shippingAddress: true },
      })
    : null;
  const earlierDelivery =
    earlierOrder?.shippingAddress && !isPickupAddress(earlierOrder.shippingAddress.line1)
      ? earlierOrder.shippingAddress
      : null;
  const lastAddress = earlierDelivery ?? savedAddresses[0] ?? null;

  const defaults: CheckoutDefaults = {
    email: user?.email ?? earlierOrder?.email ?? cart.email ?? "",
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
  return (
    <div className="lx-container py-6 sm:py-12">
      <h1 className="mb-5 text-[clamp(1.75rem,5vw,2.75rem)] sm:mb-8">Checkout</h1>

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
        freeShippingThreshold={settings.freeShippingThreshold}
        directNetworks={settings.momoDirectNetworks}
        pickupLocations={settings.pickupLocations}
        items={totals.lines.map((line) => ({
          id: line.id,
          title: line.productTitle,
          variantTitle: line.variantTitle,
          imageUrl: line.imageUrl,
          quantity: line.quantity,
          lineTotal: line.lineTotal,
          isPreorder: line.isPreorder,
          stockProblem: line.stockProblem,
        }))}
        discount={<DiscountForm appliedCode={totals.discountCode} />}
      />
    </div>
  );
}

/** Keeps the first of each address that differs only by which order saved it. */
function dedupeAddresses<T extends { line1: string; line2: string | null; city: string; region: string }>(
  addresses: T[],
): T[] {
  const seen = new Set<string>();
  return addresses.filter((a) => {
    const key = [a.line1, a.line2 ?? "", a.city, a.region].map((s) => s.trim().toLowerCase()).join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
