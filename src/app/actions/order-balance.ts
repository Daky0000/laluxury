"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getIntegrations, isReady } from "@/lib/integrations";
import { initializeTransaction } from "@/lib/paystack";
import { logOrderEvent } from "@/lib/orders";
import { formatMoney } from "@/lib/money";

export async function payRemainingBalanceAction(formData: FormData): Promise<void> {
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return;

  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || !order.depositAmount || order.balancePaidAt) return;

  const remainingAmount = Math.max(0, order.total - order.depositAmount);
  if (remainingAmount <= 0) return;

  const integrations = await getIntegrations();
  const paystackConfigured = isReady(integrations, "paystack");
  const reference = `${order.orderNumber}-BAL-${Date.now().toString(36).toUpperCase()}`;

  if (paystackConfigured) {
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
  } else {
    await db.payment.create({
      data: {
        orderId: order.id,
        reference,
        provider: "direct",
        channel: "balance_settlement",
        amount: remainingAmount,
        currency: order.currency,
        status: "SUCCESS",
        paidAt: new Date(),
      },
    });

    await db.order.update({
      where: { id: order.id },
      data: {
        balancePaidAt: new Date(),
        paymentStatus: "SUCCESS",
        status: order.status === "PENDING" ? "PAID" : order.status,
      },
    });

    await logOrderEvent({
      orderId: order.id,
      type: "order.balance_paid",
      message: `Remaining 50% Pre-Order balance (${formatMoney(remainingAmount, order.currency)}) settled.`,
    });

    revalidatePath("/orders/track");
    revalidatePath(`/orders/${order.orderNumber}/invoice`);
    revalidatePath("/admin/preorders");
    revalidatePath(`/admin/orders/${order.id}`);
  }
}
