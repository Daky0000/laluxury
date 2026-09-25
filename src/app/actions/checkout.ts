"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getIntegrations, isReady } from "@/lib/integrations";
import { clearCart, getOrCreateCart } from "@/lib/cart";
import { createOrderFromCart, logOrderEvent } from "@/lib/orders";
import { createSessionCookie, getSession } from "@/lib/auth/session";
import { hashPassword, passwordProblems } from "@/lib/auth/password";
import { initializeTransaction } from "@/lib/paystack";
import { InsufficientStockError } from "@/lib/inventory";
import { GHANA_REGIONS } from "@/lib/constants";
import { normalisePhone } from "@/lib/phone";
import { formatMoney } from "@/lib/money";

/** Everything Paystack supports for GHS; see lib/paystack. */
const PAYSTACK_CHANNELS = ["card", "mobile_money", "bank_transfer", "ussd", "bank", "qr"];

export type CheckoutState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
};

const schema = z.object({
  email: z.string().email("Enter a valid email address."),
  firstName: z.string().min(1, "Enter a first name."),
  lastName: z.string().min(1, "Enter a last name."),
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
  paymentMethod: z.string().optional(),
  preorderDepositOption: z.enum(["full", "deposit_50"]).optional(),
  /** Paystack channels, comma separated. Whitelisted below before it is sent. */
  channels: z.string().optional(),
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
    preorderDepositOption: formData.get("preorderDepositOption") || undefined,
    channels: formData.get("channels") || undefined,
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

  const data = parsed.data;
  const email = data.email.toLowerCase().trim();
  const phone = normalisePhone(data.phone)!;

  const channels = (data.channels ?? "")
    .split(",")
    .map((channel) => channel.trim())
    .filter((channel) => PAYSTACK_CHANNELS.includes(channel));

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

  const paymentMethod = data.paymentMethod ?? "momo";
  const isDirectMethod =
    !paystackConfigured ||
    paymentMethod === "direct_momo" ||
    paymentMethod === "pay_on_delivery";
  const depositPercent = data.preorderDepositOption === "deposit_50" ? 50 : null;

  let redirectUrl: string;

  try {
    const order = await createOrderFromCart({
      cart,
      email,
      phone,
      userId,
      shippingAddress: {
        firstName: data.firstName,
        lastName: data.lastName,
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

    await db.payment.create({
      data: {
        orderId: order.id,
        reference,
        provider: isDirectMethod ? "direct" : "paystack",
        channel: paymentMethod,
        amount: chargeAmount,
        currency: order.currency,
        status: "PENDING",
      },
    });

    if (isDirectMethod) {
      await clearCart(cart.id);

      const methodLabel =
        paymentMethod === "pay_on_delivery"
          ? "Pay on delivery / concierge verification"
          : paymentMethod === "direct_momo"
            ? "Direct MoMo / Bank transfer"
            : "Concierge checkout (direct settlement)";

      await logOrderEvent({
        orderId: order.id,
        type: "order.confirmed_direct",
        message: `Order confirmed via ${methodLabel}. Amount due: ${formatMoney(chargeAmount, order.currency)}${order.depositAmount ? ` (50% pre-order deposit; total ${formatMoney(order.total, order.currency)})` : ""}.`,
        actorId: userId,
      });

      if (userId) {
        await db.customerInteraction.create({
          data: {
            userId,
            type: "ORDER_PLACED",
            subject: `Order ${order.orderNumber}`,
            body: `Placed order (${formatMoney(order.total, order.currency)}) via ${methodLabel}.`,
            meta: { orderId: order.id, orderNumber: order.orderNumber },
          },
        });
      }

      redirectUrl = `/checkout/confirm?reference=${encodeURIComponent(reference)}&mode=direct`;
    } else {
      const init = await initializeTransaction({
        email,
        amount: chargeAmount,
        reference,
        callbackUrl: `${env.siteUrl()}/checkout/confirm`,
        channels: channels.length ? channels : undefined,
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

      redirectUrl = init.authorization_url;
    }
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return { ok: false, message: error.message };
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : "We could not start that payment.",
    };
  }

  // Outside the try: redirect() throws a control-flow signal by design.
  redirect(redirectUrl);
}
