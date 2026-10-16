"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getIntegrations, isReady } from "@/lib/integrations";
import { getOrCreateCart } from "@/lib/cart";
import { createOrderFromCart } from "@/lib/orders";
import { settleEarlierCheckout } from "@/lib/checkout-payment";
import { notifyOrder } from "@/lib/notify";
import { getSession } from "@/lib/auth/session";
import { recordDirectCharge } from "@/lib/momo-push";
import {
  chargeMobileMoney,
  detectGhanaMomoProvider,
  initializeTransaction,
  normaliseGhanaMomoPhone,
} from "@/lib/paystack";
import { InsufficientStockError } from "@/lib/inventory";
import { GHANA_REGIONS } from "@/lib/constants";
import { MOMO_NETWORKS, networkOf, normalisePhone } from "@/lib/phone";
import { getCommerceSettings } from "@/lib/settings";
import { pickupAddressLines } from "@/lib/pickup-locations";

export type CheckoutState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
};

const schema = z.object({
  email: z.string().email("Enter a valid email address."),
  firstName: z.string().trim().min(1, "Enter a first name."),
  lastName: z.string().trim().optional().default(""),
  phone: z
    .string()
    .min(1, "Enter a phone number we can reach you on.")
    .refine((value) => normalisePhone(value) !== null, {
      message:
        "Enter a Ghanaian number like 024 000 0000, or one from elsewhere with its country code.",
    }),
  fulfilment: z.enum(["delivery", "pickup"]).default("delivery"),
  pickupLocationId: z.string().optional(),
  // Address fields are only required for delivery; checked after parsing.
  line1: z.string().trim().optional(),
  city: z.string().trim().optional(),
  region: z.string().optional(),
  shippingRateId: z.string().optional(),
  payWith: z.enum(["mtn", "vod", "atl", "card"], { message: "Choose how you will pay." }),
  /** For a network that offers both: the phone prompt, or Paystack's page. */
  momoRoute: z.enum(["direct", "hosted"]).optional(),
  momoPhone: z.string().trim().optional(),
  preorderDepositOption: z.enum(["full", "deposit_50"]).optional(),
  customerNote: z.string().optional(),
});

export async function placeOrderAction(
  _prev: CheckoutState | null,
  formData: FormData,
): Promise<CheckoutState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phone: formData.get("phone"),
    fulfilment: formData.get("fulfilment") || undefined,
    pickupLocationId: formData.get("pickupLocationId") || undefined,
    line1: formData.get("line1") || undefined,
    city: formData.get("city") || undefined,
    region: formData.get("region") || undefined,
    shippingRateId: formData.get("shippingRateId") || undefined,
    payWith: formData.get("payWith") || undefined,
    momoRoute: formData.get("momoRoute") || undefined,
    momoPhone: formData.get("momoPhone") || undefined,
    preorderDepositOption: formData.get("preorderDepositOption") || undefined,
    customerNote: formData.get("customerNote") || undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const integrations = await getIntegrations();
  const paystackConfigured = isReady(integrations, "paystack");

  if (!paystackConfigured) {
    return { ok: false, message: "Online payment is temporarily unavailable. Please try again shortly." };
  }

  const data = parsed.data;
  const email = data.email.toLowerCase().trim();
  const phone = normalisePhone(data.phone)!;

  const settings = await getCommerceSettings();

  // Collected from a pickup location, or delivered to an address.
  const isPickup = data.fulfilment === "pickup";
  const pickupLocation = isPickup
    ? settings.pickupLocations.find((l) => l.id === data.pickupLocationId)
    : null;
  if (isPickup && !pickupLocation) {
    return { ok: false, fieldErrors: { pickupLocationId: "Choose where you will collect your order." } };
  }
  if (!isPickup) {
    const addressErrors: Record<string, string> = {};
    if (!data.line1) addressErrors.line1 = "Enter your address or digital address.";
    if (!data.city) addressErrors.city = "Enter a city or town.";
    if (!GHANA_REGIONS.includes(data.region as (typeof GHANA_REGIONS)[number])) {
      addressErrors.region = "Choose a region.";
    }
    if (Object.keys(addressErrors).length) return { ok: false, fieldErrors: addressErrors };
  }
  const shippingAddress = pickupLocation
    ? {
        ...pickupAddressLines(pickupLocation),
        city: pickupLocation.city,
        region: pickupLocation.region,
      }
    : { line1: data.line1!, line2: null, city: data.city!, region: data.region! };

  // The shopper names their network first. A network on the store's direct
  // list lets them choose the phone prompt or Paystack's page; any other
  // network, and cards, always use Paystack's page.
  const network = data.payWith === "card" ? null : data.payWith;
  const paymentMethod = network
    ? data.momoRoute === "direct" && settings.momoDirectNetworks.includes(network)
      ? "direct_debit"
      : "mobile_money"
    : "bank_card";
  const isDirectDebit = paymentMethod === "direct_debit";

  // Direct Debit pushes the prompt to the wallet the shopper names, which is
  // not always the delivery phone. Checked before any account is created.
  const momoNumber = data.momoPhone || data.phone;
  const momoNetwork = networkOf(momoNumber);
  if (isDirectDebit && !(momoNetwork && MOMO_NETWORKS.includes(momoNetwork))) {
    return {
      ok: false,
      fieldErrors: {
        momoPhone: "Enter the MTN, Telecel or AirtelTigo MoMo number that will pay, like 024 000 0000.",
      },
    };
  }

  // No sign-in at checkout. A signed-in shopper's order goes on their account;
  // a guest's goes on the account that already has this email or phone. A
  // first-time buyer gets an account made from this order once it is paid
  // (see `markOrderPaid`), and is texted that they can sign in.
  const session = await getSession();
  let userId = session?.userId ?? null;
  if (!userId) {
    const existing = await db.user.findFirst({
      where: { OR: [{ phone }, { email }] },
      select: { id: true },
    });
    userId = existing?.id ?? null;
  }

  const cart = await getOrCreateCart();
  if (cart.items.length === 0) {
    return { ok: false, message: "Your bag is empty." };
  }

  // This bag already went to payment once (a MoMo prompt never approved, or a
  // failed attempt). Settle that attempt first so money that did land is not
  // taken twice, and its stock hold does not block this order.
  if (cart.convertedOrderId) {
    const { paidReference } = await settleEarlierCheckout(cart.convertedOrderId);
    if (paidReference) redirect(`/checkout/confirm?reference=${encodeURIComponent(paidReference)}`);
  }

  const depositPercent = data.preorderDepositOption === "deposit_50" ? 50 : null;

  let redirectUrl = "";

  try {
    const order = await createOrderFromCart({
      cart,
      email,
      phone,
      userId,
      shippingAddress: {
        firstName: data.firstName.trim() || "Customer",
        lastName: data.lastName?.trim() || data.firstName.trim() || "Customer",
        phone,
        ...shippingAddress,
      },
      shippingRateId: isPickup ? null : (data.shippingRateId ?? null),
      pickup: isPickup,
      customerNote: data.customerNote ?? null,
      paymentMethod,
      depositPercent,
    });

    const chargeAmount = order.depositAmount ?? order.total;
    const reference = `${order.orderNumber}-${Date.now().toString(36).toUpperCase()}`;

    try {
      await db.payment.create({
        data: {
          orderId: order.id,
          reference,
          provider: "paystack",
          channel: paymentMethod,
          amount: chargeAmount,
          currency: order.currency,
          status: "PENDING",
        },
      });

      if (isDirectDebit) {
        const momoPhone = normaliseGhanaMomoPhone(momoNumber);
        await db.payment.update({
          where: { reference },
          data: { channel: "mobile_money", mobileMoneyNumber: momoPhone },
        });
        const charge = await chargeMobileMoney({
          email,
          amount: chargeAmount,
          phone: momoPhone,
          // Ported numbers keep their old prefix, so the shopper's choice wins.
          provider: network ?? detectGhanaMomoProvider(momoPhone),
          reference,
          metadata: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            source: "web_storefront",
            channel: "direct_debit",
          },
        });
        if (charge.status === "failed") {
          throw new Error(
            charge.display_text ||
              charge.message ||
              "That MoMo number could not be charged. Check the number and network, or choose another payment method.",
          );
        }
        await recordDirectCharge(reference, network ?? detectGhanaMomoProvider(momoPhone), charge);
        await notifyOrder(order.id, { kind: "order.placed" }).catch((err) =>
          console.error("[notify] web direct debit order.placed error:", err),
        );
        // The confirmation page reads the charge's state itself: a code to
        // enter (Telecel's voucher), a prompt to approve, or still pending.
        redirectUrl = `/checkout/confirm?reference=${encodeURIComponent(reference)}`;
      } else {
        const init = await initializeTransaction({
              email,
              amount: chargeAmount,
              reference,
              callbackUrl: `${env.siteUrl()}/checkout/confirm`,
              channels: paymentMethod === "mobile_money" ? ["mobile_money"] : ["card"],
              metadata: {
                orderId: order.id,
                orderNumber: order.orderNumber,
                depositAmount: order.depositAmount,
                custom_fields: [
                  {
                    display_name: "Order",
                    variable_name: "order_number",
                    value: order.orderNumber,
                  },
                ],
              },
            });

        if (init?.authorization_url) {
          redirectUrl = init.authorization_url;
        } else {
          throw new Error("Unable to obtain a payment authorization link.");
        }
      }
    } catch (gatewayError) {
      // Compensate: cancel order immediately to release reserved stock and restore discounts
      await db.payment
        .updateMany({ where: { reference, status: "PENDING" }, data: { status: "FAILED" } })
        .catch(() => {});
      const { cancelOrder } = await import("@/lib/orders");
      await cancelOrder(order.id, "Payment gateway initialization failed.", null, { notify: false }).catch((err) =>
        console.error("[checkout] failed to cancel order after gateway error:", err),
      );
      // Re-enable cart
      await db.cart.update({ where: { id: cart.id }, data: { convertedOrderId: null } }).catch(() => {});
      throw gatewayError;
    }
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return { ok: false, message: error.message };
    }
    const rawMsg = error instanceof Error ? error.message : "We could not start that payment.";
    const friendlyMsg = rawMsg.toLowerCase().includes("invalid key")
      ? "Online payment is temporarily unavailable. Please try again shortly."
      : rawMsg.replace(/Paystack/gi, "payment provider");
    return {
      ok: false,
      message: friendlyMsg,
    };
  }

  // Outside the try: redirect() throws a control-flow signal by design.
  redirect(redirectUrl);
}
