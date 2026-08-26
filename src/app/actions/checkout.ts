"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getIntegrations, isReady } from "@/lib/integrations";
import { getOrCreateCart } from "@/lib/cart";
import { createOrderFromCart } from "@/lib/orders";
import { getSession } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { initializeTransaction } from "@/lib/paystack";
import { InsufficientStockError } from "@/lib/inventory";
import { GHANA_REGIONS } from "@/lib/constants";

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
  phone: z.string().min(9, "Enter a phone number we can reach you on."),
  line1: z.string().min(1, "Enter a street address."),
  line2: z.string().optional(),
  city: z.string().min(1, "Enter a city or town."),
  region: z.string().refine((v) => GHANA_REGIONS.includes(v as (typeof GHANA_REGIONS)[number]), {
    message: "Choose a region.",
  }),
  postalCode: z.string().optional(),
  shippingRateId: z.string().optional(),
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
  if (!isReady(integrations, "paystack")) {
    return {
      ok: false,
      message: "Payments are not switched on yet. Add your Paystack keys under Settings → Integrations.",
    };
  }

  const data = parsed.data;
  const email = data.email.toLowerCase().trim();

  // The payment choice only narrows what Paystack offers; anything we do not
  // recognise falls back to its full set rather than failing the order.
  const channels = (data.channels ?? "")
    .split(",")
    .map((channel) => channel.trim())
    .filter((channel) => PAYSTACK_CHANNELS.includes(channel));
  const session = await getSession();
  let userId = session?.userId ?? null;

  // Optional account creation at checkout.
  if (!userId && data.createAccount && data.password && data.password.length >= 8) {
    const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (!existing) {
      const created = await db.user.create({
        data: {
          email,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          passwordHash: await hashPassword(data.password),
        },
      });
      userId = created.id;
    }
  }

  const cart = await getOrCreateCart();
  if (cart.items.length === 0) {
    return { ok: false, message: "Your bag is empty." };
  }

  let authorizationUrl: string;

  try {
    const order = await createOrderFromCart({
      cart,
      email,
      phone: data.phone,
      userId,
      shippingAddress: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        line1: data.line1,
        line2: data.line2 ?? null,
        city: data.city,
        region: data.region,
        postalCode: data.postalCode ?? null,
      },
      shippingRateId: data.shippingRateId ?? null,
      customerNote: data.customerNote ?? null,
    });

    // Reference doubles as our payment idempotency key.
    const reference = `${order.orderNumber}-${Date.now().toString(36).toUpperCase()}`;

    await db.payment.create({
      data: {
        orderId: order.id,
        reference,
        amount: order.total,
        currency: order.currency,
        status: "PENDING",
      },
    });

    const init = await initializeTransaction({
      email,
      amount: order.total,
      reference,
      callbackUrl: `${env.siteUrl()}/checkout/confirm`,
      channels: channels.length ? channels : undefined,
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        custom_fields: [
          {
            display_name: "Order",
            variable_name: "order_number",
            value: order.orderNumber,
          },
        ],
      },
    });

    authorizationUrl = init.authorization_url;
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
  redirect(authorizationUrl);
}
