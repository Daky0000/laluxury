"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateCart } from "@/lib/cart";
import { createOrderFromCart } from "@/lib/orders";
import {
  checkoutUnavailableReason,
  settleEarlierCheckout,
  startCheckoutPayment,
} from "@/lib/checkout-payment";
import { getSession } from "@/lib/auth/session";
import { orderAccessToken } from "@/lib/order-access";
import { normaliseGhanaMomoPhone } from "@/lib/paystack";
import { InsufficientStockError } from "@/lib/inventory";
import { rateLimit, requestAddress, retryMessage } from "@/lib/rate-limit";
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
  // Not asked for at checkout: carried over from the account or an earlier order.
  email: z.union([z.literal(""), z.string().email()]).optional().default(""),
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
    email: formData.get("email") ?? "",
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

  const unavailable = await checkoutUnavailableReason();
  if (unavailable) return { ok: false, message: unavailable };

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
  // not always the delivery phone.
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

  // Checkout is a public form that sends payment prompts to phones and holds
  // stock, so it is limited per address, per contact number and per wallet.
  const address = await requestAddress();
  for (const [key, limit] of [
    // Generous: Ghanaian mobile networks put many phones behind one address.
    [`checkout-ip:${address}`, 40],
    [`checkout-phone:${phone}`, 6],
    ...(isDirectDebit ? [[`checkout-momo:${normaliseGhanaMomoPhone(momoNumber)}`, 5]] : []),
  ] as [string, number][]) {
    const limited = rateLimit(key, { limit, windowMs: 15 * 60 * 1000 });
    if (!limited.ok) return { ok: false, message: retryMessage(limited.retryAfterSeconds) };
  }

  // No sign-in at checkout. A signed-in shopper's order goes on their account.
  // A guest's order stays a guest order until it is paid: typing an email or
  // phone proves nothing about who is typing it, so it never files an order
  // (or a delivery address) under someone's account. `markOrderPaid` then
  // links a paid order to the matching customer account, or makes one.
  const session = await getSession();
  const userId = session?.userId ?? null;
  // Per-customer code limits still apply to a guest using a customer's details.
  const discountUserId = userId
    ? null
    : ((
        await db.user.findFirst({
          where: { OR: email ? [{ phone }, { email }] : [{ phone }], role: "CUSTOMER" },
          select: { id: true },
        })
      )?.id ?? null);

  const cart = await getOrCreateCart();
  if (cart.items.length === 0) {
    return { ok: false, message: "Your bag is empty." };
  }

  // This bag already went to payment once (a MoMo prompt never approved, or a
  // failed attempt). Settle that attempt first so money that did land is not
  // taken twice, and its stock hold does not block this order.
  if (cart.convertedOrderId) {
    const { paidReference } = await settleEarlierCheckout(cart.convertedOrderId);
    if (paidReference) {
      const earlier = await db.order.findUnique({
        where: { id: cart.convertedOrderId },
        select: { orderNumber: true },
      });
      const t = earlier ? `&t=${orderAccessToken(earlier.orderNumber)}` : "";
      redirect(`/checkout/confirm?reference=${encodeURIComponent(paidReference)}${t}`);
    }
  }

  let redirectUrl = "";

  try {
    const order = await createOrderFromCart({
      cart,
      email,
      phone,
      userId,
      discountUserId,
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
      payDeposit: data.preorderDepositOption === "deposit_50",
      source: "checkout",
    });

    const token = orderAccessToken(order.orderNumber);
    try {
      const started = await startCheckoutPayment(order, {
        method: paymentMethod,
        momoPhone: isDirectDebit ? momoNumber : null,
        network,
        source: "web_storefront",
      });
      // Direct Debit and free orders land on the confirmation page, which reads
      // the charge's state itself; the hosted page comes back there too.
      redirectUrl =
        started.kind === "hosted"
          ? started.url
          : `/checkout/confirm?reference=${encodeURIComponent(started.reference)}&t=${token}`;
    } catch (gatewayError) {
      // The order was cancelled; give the bag back for another try.
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
