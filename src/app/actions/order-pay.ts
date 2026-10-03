"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getIntegrations, isReady, activePaystack } from "@/lib/integrations";
import {
  initializeTransaction,
  chargeMobileMoney,
  verifyTransaction,
  submitMobileMoneyOtp,
  normaliseGhanaMomoPhone,
  detectGhanaMomoProvider,
  MOMO_PROVIDER_LABELS,
  type MomoProvider,
} from "@/lib/paystack";
import { formatMoney } from "@/lib/money";

export type CustomerMomoPushResult = {
  ok: boolean;
  reference?: string;
  status?: "pay_offline" | "send_otp" | "success" | "pending" | "failed";
  providerLabel?: string;
  phone?: string;
  amountFormatted?: string;
  displayText?: string;
  error?: string;
};

/**
 * 1. Customer initiates online checkout payment via Paystack (Card, MoMo, Bank)
 */
export async function customerPayOnlineAction(formData: FormData): Promise<void> {
  const orderId = String(formData.get("orderId") ?? "");
  const paymentMethod = String(formData.get("paymentMethod") ?? "mobile_money");
  if (!(["mobile_money", "bank_card"] as const).includes(paymentMethod as "mobile_money" | "bank_card")) {
    throw new Error("Choose a valid payment method.");
  }
  if (!orderId) throw new Error("Order ID is required.");

  const order = await db.order.findUnique({
    where: { id: orderId },
  });

  if (!order) throw new Error("Order not found.");
  if (order.status === "CANCELLED" || order.status === "REFUNDED") {
    throw new Error("This order has been cancelled or refunded.");
  }

  // Calculate amount:
  // If pre-order initial deposit: depositAmount
  // If pre-order remaining balance: total - depositAmount
  // Else: full order total
  const isBalancePayment = Boolean(order.depositAmount && order.paidAt && !order.balancePaidAt);
  const amountToPay = isBalancePayment
    ? Math.max(0, order.total - order.depositAmount!)
    : order.hasPreorderItems && order.depositAmount && !order.paidAt
      ? order.depositAmount
      : order.total;

  if (amountToPay <= 0) {
    throw new Error("No outstanding balance on this order.");
  }

  const integrations = await getIntegrations();
  const paystackConfigured = isReady(integrations, "paystack");

  const reference = `${order.orderNumber}-${isBalancePayment ? "BAL" : "PAY"}-${Date.now().toString(36).toUpperCase()}`;

  await db.payment.create({
    data: {
      orderId: order.id,
      reference,
      provider: "paystack",
      channel: paymentMethod,
      amount: amountToPay,
      currency: order.currency,
      status: "PENDING",
    },
  });

  if (paystackConfigured) {
    const init = await initializeTransaction({
      email: order.email,
      amount: amountToPay,
      reference,
      callbackUrl: `${env.siteUrl()}/checkout/confirm`,
      channels: paymentMethod === "mobile_money" ? ["mobile_money"] : ["card"],
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        isBalancePayment,
        source: "customer_tracking",
      },
    });

    redirect(init.authorization_url);
  } else {
    throw new Error("Online payment gateway is currently unavailable. Please contact concierge support.");
  }
}

/**
 * 2. Customer triggers direct Mobile Money USSD / PIN push to their phone
 */
export async function customerInitiateMomoPushAction(args: {
  orderId: string;
  phone: string;
  provider?: "auto" | MomoProvider;
}): Promise<CustomerMomoPushResult> {
  const order = await db.order.findUnique({
    where: { id: args.orderId },
  });

  if (!order) {
    return { ok: false, error: "Order not found." };
  }
  if (order.status === "CANCELLED" || order.status === "REFUNDED") {
    return { ok: false, error: "This order has been cancelled or refunded." };
  }

  const cleanPhone = normaliseGhanaMomoPhone(args.phone || order.phone || "");
  if (cleanPhone.length < 10) {
    return {
      ok: false,
      error: "Please enter a valid 10-digit Ghana Mobile Money number (e.g. 0244123456).",
    };
  }

  const provider: MomoProvider =
    !args.provider || args.provider === "auto"
      ? detectGhanaMomoProvider(cleanPhone)
      : args.provider;
  const providerLabel = MOMO_PROVIDER_LABELS[provider];

  const isBalancePayment = Boolean(order.depositAmount && order.paidAt && !order.balancePaidAt);
  const amountToPay = isBalancePayment
    ? Math.max(0, order.total - order.depositAmount!)
    : order.hasPreorderItems && order.depositAmount && !order.paidAt
      ? order.depositAmount
      : order.total;

  if (amountToPay <= 0) {
    return { ok: false, error: "No outstanding amount to pay on this order." };
  }

  const reference = `MOMO-${order.orderNumber}-${Date.now().toString().slice(-6)}`;

  // Save the phone on the order if not already set, and create a PENDING Payment row
  await db.$transaction([
    db.order.update({
      where: { id: order.id },
      data: {
        phone: cleanPhone,
        paymentMethod: "mobile_money_push",
        events: {
          create: {
            type: "momo.push_sent",
            message: `Customer initiated ${providerLabel} PIN prompt (${formatMoney(amountToPay)}) to ${cleanPhone} (Ref: ${reference}).`,
          },
        },
      },
    }),
    db.payment.create({
      data: {
        orderId: order.id,
        provider: "paystack",
        reference,
        amount: amountToPay,
        currency: order.currency,
        status: "PENDING",
        channel: "mobile_money",
        mobileMoneyNumber: cleanPhone,
      },
    }),
  ]);

  const integrations = await getIntegrations();
  const paystackConfig = activePaystack(integrations);

  if (paystackConfig.secretKey) {
    try {
      const charge = await chargeMobileMoney({
        email: order.email,
        amount: amountToPay,
        phone: cleanPhone,
        provider,
        reference,
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          isBalancePayment,
          source: "customer_tracking",
        },
      });

      revalidatePath(`/orders/track`);
      return {
        ok: true,
        reference,
        status: charge.status,
        providerLabel,
        phone: cleanPhone,
        amountFormatted: formatMoney(amountToPay),
        displayText:
          charge.display_text ??
          `Live ${providerLabel} prompt sent to ${cleanPhone}. Please check your phone screen (or dial *170# > 6 > 3 for MTN) and enter your 4-digit MoMo PIN to authorize.`,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to dispatch Mobile Money prompt.",
      };
    }
  }

  return { ok: false, error: "Online payment is temporarily unavailable. Please try again shortly." };
}

/**
 * 3. Customer submits telco SMS OTP if prompted before USSD pop-up
 */
export async function customerSubmitMomoOtpAction(args: {
  orderId: string;
  reference: string;
  otp: string;
}): Promise<CustomerMomoPushResult> {
  try {
    const res = await submitMobileMoneyOtp({
      reference: args.reference,
      otp: args.otp,
    });

    return {
      ok: true,
      reference: args.reference,
      status: res.status,
      displayText:
        res.display_text ??
        "OTP verified! The MoMo PIN pop-up is now on your phone screen. Please enter your 4-digit PIN.",
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not verify OTP.",
    };
  }
}

/**
 * 4. Polling endpoint for customer tracking page to check PIN authorization status
 */
export async function customerCheckMomoPinAction(args: {
  orderId: string;
  reference: string;
}): Promise<{ ok: boolean; paid: boolean; message: string }> {
  const payment = await db.payment.findUnique({
    where: { reference: args.reference },
    include: { order: true },
  });

  if (!payment) {
    return { ok: false, paid: false, message: "Payment record not found." };
  }

  if (payment.status === "SUCCESS") {
    return { ok: true, paid: true, message: "Payment confirmed! Your order is now PAID." };
  }

  const integrations = await getIntegrations();
  const paystackConfig = activePaystack(integrations);

  const isBalancePayment = Boolean(payment.order.depositAmount && payment.order.paidAt && !payment.order.balancePaidAt);

  if (paystackConfig.secretKey) {
    try {
      const verified = await verifyTransaction(args.reference);
      if (verified.status === "success") {
        if (
          verified.amount !== payment.amount ||
          verified.currency.toUpperCase() !== payment.currency.toUpperCase()
        ) {
          return { ok: false, paid: false, message: "Payment details did not match this order." };
        }
        const provider = detectGhanaMomoProvider(payment.mobileMoneyNumber ?? "");
        await finalizeCustomerMomoPayment({
          orderId: payment.orderId,
          reference: args.reference,
          amountToPay: payment.amount,
          cleanPhone: payment.mobileMoneyNumber ?? "",
          providerLabel: MOMO_PROVIDER_LABELS[provider],
          isBalancePayment,
        });

        return {
          ok: true,
          paid: true,
          message: `Payment of ${formatMoney(payment.amount)} confirmed via Mobile Money! Your order is now PAID.`,
        };
      }

      if (verified.status === "failed" || verified.status === "abandoned") {
        return {
          ok: true,
          paid: false,
          message: `Payment timed out or cancelled (${verified.gateway_response ?? verified.status}). Please try sending the prompt again.`,
        };
      }

      return {
        ok: true,
        paid: false,
        message: "Waiting for you to enter your 4-digit MoMo PIN on your phone...",
      };
    } catch {
      return {
        ok: true,
        paid: false,
        message: "Waiting for your 4-digit MoMo PIN authorization...",
      };
    }
  }

  return {
    ok: true,
    paid: false,
    message: "Waiting for you to enter your MoMo PIN on your phone...",
  };
}

async function finalizeCustomerMomoPayment(args: {
  orderId: string;
  reference: string;
  amountToPay: number;
  cleanPhone: string;
  providerLabel: string;
  isBalancePayment: boolean;
}) {
  const now = new Date();

  await db.$transaction([
    db.payment.update({
      where: { reference: args.reference },
      data: {
        status: "SUCCESS",
        paidAt: now,
      },
    }),
    db.order.update({
      where: { id: args.orderId },
      data: {
        status: "PAID",
        paymentStatus: "SUCCESS",
        paidAt: now,
        ...(args.isBalancePayment ? { balancePaidAt: now } : {}),
        events: {
          create: {
            type: "payment.momo_pin_confirmed",
            message: `Customer entered MoMo PIN on ${args.cleanPhone} (${args.providerLabel}). ${formatMoney(args.amountToPay)} received (Ref: ${args.reference}).`,
          },
        },
      },
    }),
  ]);

  revalidatePath("/orders/track");
  revalidatePath(`/admin/orders/${args.orderId}`);
  revalidatePath("/admin/orders");
}
