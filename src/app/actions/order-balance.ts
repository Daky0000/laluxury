"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getIntegrations, isReady } from "@/lib/integrations";
import { initializeTransaction } from "@/lib/paystack";
import { canViewOrder } from "@/lib/order-access";

export async function payRemainingBalanceAction(formData: FormData): Promise<void> {
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return;

  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || !order.depositAmount || order.balancePaidAt) return;

  const token = String(formData.get("token") ?? "");
  const email = String(formData.get("email") ?? "");
  const allowed = await canViewOrder(order, { token, email });
  if (!allowed) {
    throw new Error("Authorization required to pay remaining balance on this order.");
  }

  const remainingAmount = Math.max(0, order.total - order.depositAmount);
  if (remainingAmount <= 0) return;

  const integrations = await getIntegrations();
  const paystackConfigured = isReady(integrations, "paystack");
  const reference = `${order.orderNumber}-BAL-${Date.now().toString(36).toUpperCase()}`;

  // Money only counts once a gateway says so; there is no offline shortcut.
  if (!paystackConfigured) return;

  await db.payment.create({
    data: {
      orderId: order.id,
      reference,
      provider: "paystack",
      channel: "balance_payment",
      amount: remainingAmount,
      currency: order.currency,
      status: "PENDING",
    },
  });

  const init = await initializeTransaction({
    email: order.email,
    amount: remainingAmount,
    reference,
    callbackUrl: `${env.siteUrl()}/checkout/confirm`,
    metadata: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      isBalancePayment: true,
    },
  });

  redirect(init.authorization_url);
}
