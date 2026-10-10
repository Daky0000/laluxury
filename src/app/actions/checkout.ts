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
import { createSessionCookie, getSession } from "@/lib/auth/session";
import { hashPassword, passwordProblems } from "@/lib/auth/password";
import {
  chargeMobileMoney,
  detectGhanaMomoProvider,
  initializeTransaction,
  normaliseGhanaMomoPhone,
} from "@/lib/paystack";
import { InsufficientStockError } from "@/lib/inventory";
import { GHANA_REGIONS } from "@/lib/constants";
import { MOMO_NETWORKS, networkOf, normalisePhone } from "@/lib/phone";

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
  line1: z.string().min(1, "Enter a street address."),
  line2: z.string().optional(),
  city: z.string().min(1, "Enter a city or town."),
  region: z.string().refine((v) => GHANA_REGIONS.includes(v as (typeof GHANA_REGIONS)[number]), {
    message: "Choose a region.",
  }),
  postalCode: z.string().optional(),
  shippingRateId: z.string().optional(),
  paymentMethod: z.enum(["direct_debit", "mobile_money", "bank_card"]).optional(),
  momoPhone: z.string().trim().optional(),
  preorderDepositOption: z.enum(["full", "deposit_50"]).optional(),
  customerNote: z.string().optional(),
  createAccount: z.boolean().optional(),
  password: z.string().optional(),
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
    line1: formData.get("line1"),
    line2: formData.get("line2") || undefined,
    city: formData.get("city"),
    region: formData.get("region"),
    postalCode: formData.get("postalCode") || undefined,
    shippingRateId: formData.get("shippingRateId") || undefined,
    paymentMethod: formData.get("paymentMethod") || undefined,
    momoPhone: formData.get("momoPhone") || undefined,
    preorderDepositOption: formData.get("preorderDepositOption") || undefined,
    customerNote: formData.get("customerNote") || undefined,
    createAccount: formData.get("createAccount") === "on",
    password: formData.get("password") || undefined,
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

  // Direct Debit pushes the prompt to the wallet the shopper names, which is
  // not always the delivery phone. Checked before any account is created.
  const momoNumber = data.momoPhone || data.phone;
  const momoNetwork = networkOf(momoNumber);
  if (data.paymentMethod === "direct_debit" && !(momoNetwork && MOMO_NETWORKS.includes(momoNetwork))) {
    return {
      ok: false,
      fieldErrors: {
        momoPhone: "Enter the MTN, Telecel or AirtelTigo MoMo number that will pay, like 024 000 0000.",
      },
    };
  }

  const session = await getSession();
  let userId = session?.userId ?? null;

  // Optional 1-click account creation at checkout for guests.
  if (!userId && data.createAccount) {
    const problems = passwordProblems(data.password ?? "");
    if (problems.length) return { ok: false, fieldErrors: { password: problems[0] } };

    const existing = await db.user.findFirst({
      where: { OR: [{ email }, { phone }] },
      select: { id: true },
    });
    if (existing) {
      return {
        ok: false,
        message:
          "There is already an account with that email or phone number. Sign in first, or untick 'Create my account' to check out as a guest.",
      };
    }

    const created = await db.user.create({
      data: {
        email,
        firstName: data.firstName,
        lastName: data.lastName,
        phone,
        phoneVerified: new Date(),
        passwordHash: await hashPassword(data.password ?? ""),
      },
    });
    userId = created.id;

    // Save their default delivery address and log them in immediately.
    await db.address.create({
      data: {
        userId: created.id,
        firstName: data.firstName,
        lastName: data.lastName,
        phone,
        line1: data.line1,
        line2: data.line2 ?? null,
        city: data.city,
        region: data.region,
        postalCode: data.postalCode ?? null,
        country: "GH",
        isDefault: true,
      },
    });

    await createSessionCookie({ userId: created.id, role: created.role });
  } else if (!userId) {
    // Guest checkout: if an existing user matches this email or phone, link the
    // order to their profile so it appears in their order history later.
    const existing = await db.user.findFirst({
      where: { OR: [{ email }, { phone }] },
      select: { id: true },
    });
    if (existing) {
      userId = existing.id;
    }
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

  const paymentMethod = data.paymentMethod ?? "mobile_money";
  const isDirectDebit = paymentMethod === "direct_debit";
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
        line1: data.line1,
        line2: data.line2 ?? null,
        city: data.city,
        region: data.region,
        postalCode: data.postalCode ?? null,
      },
      shippingRateId: data.shippingRateId ?? null,
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
        await chargeMobileMoney({
          email,
          amount: chargeAmount,
          phone: momoPhone,
          provider: detectGhanaMomoProvider(momoPhone),
          reference,
          metadata: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            source: "web_storefront",
            channel: "direct_debit",
          },
        });
        await notifyOrder(order.id, { kind: "order.placed" }).catch((err) =>
          console.error("[notify] web direct debit order.placed error:", err),
        );
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
