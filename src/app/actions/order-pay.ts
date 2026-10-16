"use server";

import { revalidatePath } from "next/cache";
import { canViewOrder } from "@/lib/order-access";
import { getCommerceSettings } from "@/lib/settings";
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
import { markOrderPaid } from "@/lib/orders";
import {
  readDirectCharge,
  recordDirectCharge,
  refreshDirectCharge,
  resendDirectDebitPrompt,
} from "@/lib/momo-push";
import type { DirectChargeStatus } from "@/lib/momo-networks";

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
 * The tracking page opens with a signed link, the order email, or the owner's
 * session; paying from it needs the same proof, not just an order id.
 */
async function loadPayableOrder(orderId: string, token: string) {
  if (!orderId) return null;
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return null;
  return (await canViewOrder(order, { token })) ? order : null;
}

/**
 * 1. Customer pays on Paystack's hosted page (card, or a MoMo network that
 * does not take the direct prompt). Returns the page to open, or why not.
 */
export async function customerPayOnlineAction(args: {
  orderId: string;
  token: string;
  paymentMethod: "mobile_money" | "bank_card";
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const paymentMethod = args.paymentMethod;
  if (paymentMethod !== "mobile_money" && paymentMethod !== "bank_card") {
    return { ok: false, error: "Choose a valid payment method." };
  }

  const order = await loadPayableOrder(args.orderId, args.token);
  if (!order) return { ok: false, error: "We could not open this order. Reload the page and try again." };
  if (order.status === "CANCELLED" || order.status === "REFUNDED") {
    return { ok: false, error: "This order has been cancelled or refunded." };
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

  if (order.paidAt && (!order.depositAmount || order.balancePaidAt || order.depositAmount >= order.total)) {
    return { ok: false, error: "This order is already paid. Refresh the order status." };
  }
  if (amountToPay <= 0) {
    return { ok: false, error: "No outstanding balance on this order." };
  }

  const integrations = await getIntegrations();
  if (!isReady(integrations, "paystack")) {
    return { ok: false, error: "Online payment is temporarily unavailable. Please try again shortly." };
  }

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

  try {
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
    return { ok: true, url: init.authorization_url };
  } catch (error) {
    await db.payment.update({ where: { reference }, data: { status: "FAILED" } }).catch(() => {});
    const raw = error instanceof Error ? error.message : "";
    return {
      ok: false,
      error:
        raw && !/key/i.test(raw)
          ? raw.replace(/Paystack/gi, "payment provider")
          : "We could not open the payment page. Please try again shortly.",
    };
  }
}

/**
 * 2. Customer triggers direct Mobile Money USSD / PIN push to their phone
 */
export async function customerInitiateMomoPushAction(args: {
  orderId: string;
  token: string;
  phone: string;
  provider: MomoProvider;
}): Promise<CustomerMomoPushResult> {
  const order = await loadPayableOrder(args.orderId, args.token);

  if (!order) {
    return { ok: false, error: "We could not open this order. Reload the page and try again." };
  }
  const { momoDirectNetworks } = await getCommerceSettings();
  if (!momoDirectNetworks.includes(args.provider)) {
    return { ok: false, error: "This network pays on the secure payment page. Choose Pay online." };
  }
  if (order.status === "CANCELLED" || order.status === "REFUNDED") {
    return { ok: false, error: "This order has been cancelled or refunded." };
  }
  if (order.paidAt && (!order.depositAmount || order.balancePaidAt || order.depositAmount >= order.total)) {
    return { ok: false, error: "This order is already paid. Refresh the order status." };
  }

  const cleanPhone = normaliseGhanaMomoPhone(args.phone || order.phone || "");
  if (cleanPhone.length < 10) {
    return {
      ok: false,
      error: "Please enter a valid 10-digit Ghana Mobile Money number (e.g. 0244123456).",
    };
  }

  const provider: MomoProvider = args.provider;
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
        // The paying wallet is often not the delivery contact; keep the latter.
        ...(order.phone ? {} : { phone: cleanPhone }),
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
      if (charge.status === "failed") {
        throw new Error(
          charge.display_text || charge.message || "That MoMo number could not be charged. Check the number and network.",
        );
      }
      await recordDirectCharge(reference, provider, charge);

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
          `Live ${providerLabel} prompt sent to ${cleanPhone}. Please check your approvals and enter your 4-digit MoMo PIN to authorize.`,
      };
    } catch (err) {
      // No prompt went out, so this attempt is over; it must not linger as pending.
      await db.payment.update({ where: { reference }, data: { status: "FAILED" } }).catch(() => {});
      return {
        ok: false,
        error: err instanceof Error ? err.message.replace(/Paystack/gi, "payment provider") : "Failed to dispatch Mobile Money prompt.",
      };
    }
  }

  await db.payment.update({ where: { reference }, data: { status: "FAILED" } }).catch(() => {});
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
  const payment = await db.payment.findUnique({
    where: { reference: args.reference },
    select: { orderId: true, status: true, rawResponse: true, mobileMoneyNumber: true },
  });
  if (!payment || payment.orderId !== args.orderId || payment.status !== "PENDING") {
    return { ok: false, error: "This payment is no longer awaiting a code." };
  }

  try {
    const res = await submitMobileMoneyOtp({
      reference: args.reference,
      otp: args.otp,
    });
    if (res.status === "failed") {
      return {
        ok: false,
        error: res.display_text || res.message || "That code was not accepted. Generate a new one and try again.",
      };
    }
    await recordDirectCharge(
      args.reference,
      readDirectCharge(payment.rawResponse).provider ?? detectGhanaMomoProvider(payment.mobileMoneyNumber ?? ""),
      res,
    );

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
}): Promise<{
  ok: boolean;
  paid: boolean;
  message: string;
  /** Paystack's charge state while unpaid; "send_otp" means a code is wanted. */
  chargeStatus?: DirectChargeStatus | null;
  displayText?: string | null;
}> {
  const payment = await db.payment.findUnique({
    where: { reference: args.reference },
    include: { order: true },
  });

  if (!payment || payment.orderId !== args.orderId) {
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

      // Paystack also calls a prompt not yet approved "abandoned", so only the
      // charge itself can say the attempt is over.
      const charge = await refreshDirectCharge(args.reference);
      if (verified.status === "failed" || charge.status === "failed") {
        return {
          ok: true,
          paid: false,
          chargeStatus: "failed",
          message: `Payment timed out or was declined (${verified.gateway_response ?? "not approved"}). Please send the prompt again.`,
        };
      }

      return {
        ok: true,
        paid: false,
        chargeStatus: charge.status,
        displayText: charge.displayText,
        message:
          charge.status === "send_otp"
            ? (charge.displayText ?? "Your network needs a code before it sends the prompt. Enter it below.")
            : "Waiting for you to approve the payment with your MoMo PIN on your phone.",
      };
    } catch {
      return {
        ok: false,
        paid: false,
        message: "Could not confirm payment status. Check your approvals and try checking again before resending.",
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
  // Same finalizer as the webhook, so the outcome never depends on which
  // path saw the payment first. It recognises balance payments itself.
  await markOrderPaid({
    orderId: args.orderId,
    reference: args.reference,
    amount: args.amountToPay,
    channel: "mobile_money",
    mobileMoneyNumber: args.cleanPhone || null,
  });

  revalidatePath("/orders/track");
  revalidatePath(`/admin/orders/${args.orderId}`);
  revalidatePath("/admin/orders");
}

/**
 * 5. The confirmation page's "Send the prompt again": same wallet, same
 * network, same amount, a new reference. Returns where to look next.
 */
export async function resendCheckoutPromptAction(
  reference: string,
): Promise<{ ok: true; reference: string } | { ok: false; error: string }> {
  if (!reference || typeof reference !== "string") return { ok: false, error: "Missing payment reference." };
  const result = await resendDirectDebitPrompt(reference);
  if (result.ok) revalidatePath("/checkout/confirm");
  return result;
}
