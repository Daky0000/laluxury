"use server";

import { revalidatePath } from "next/cache";
import { canViewOrder, orderAccessToken } from "@/lib/order-access";
import { getCommerceSettings } from "@/lib/settings";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getIntegrations, isReady } from "@/lib/integrations";
import {
  initializeTransaction,
  chargeMobileMoney,
  currentPaystackMode,
  submitMobileMoneyOtp,
  normaliseGhanaMomoPhone,
  detectGhanaMomoProvider,
  MOMO_PROVIDER_LABELS,
  PaystackError,
  type MomoProvider,
} from "@/lib/paystack";
import { formatMoney } from "@/lib/money";
import { isPaymentSettled, outstandingBalance, type PaymentPurpose } from "@/lib/orders";
import { checkDirectCharge, readDirectCharge, recordDirectCharge, resendDirectDebitPrompt } from "@/lib/momo-push";
import { newPaymentReference } from "@/lib/payment-reference";
import { checkoutUnavailableReason } from "@/lib/checkout-payment";
import { rateLimit } from "@/lib/rate-limit";
import type { DirectChargeStatus } from "@/lib/momo-networks";
import type { Order } from "@/generated/prisma";

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
 * The tracking and confirmation pages open with a signed link, the order
 * email, or the owner's session; paying from them, sending a code or asking
 * for a prompt needs the same proof, not just an order id or a reference.
 */
async function loadPayableOrder(orderId: string, token: string) {
  if (!orderId) return null;
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return null;
  return (await canViewOrder(order, { token })) ? order : null;
}

/**
 * What a customer still owes now: the deposit, the whole total, or the
 * balance once the deposit is in. Null when nothing is due.
 */
function amountDue(order: Order): { amount: number; purpose: PaymentPurpose } | null {
  if (order.status === "CANCELLED" || order.status === "REFUNDED") return null;
  if (isPaymentSettled(order.paymentStatus)) {
    const balance = outstandingBalance(order);
    return balance > 0 ? { amount: balance, purpose: "BALANCE" } : null;
  }
  if (order.depositAmount && order.depositAmount < order.total) {
    return { amount: order.depositAmount, purpose: "DEPOSIT" };
  }
  return order.total > 0 ? { amount: order.total, purpose: "FULL" } : null;
}

/** Each order may start a handful of payments in a row, not hundreds. */
function attemptLimited(orderId: string, phone?: string): string | null {
  if (!rateLimit(`pay-attempt:${orderId}`, { limit: 6, windowMs: 15 * 60 * 1000 }).ok) {
    return "That is a lot of payment attempts in a row. Wait a few minutes and try again.";
  }
  if (phone && !rateLimit(`pay-phone:${phone}`, { limit: 6, windowMs: 15 * 60 * 1000 }).ok) {
    return "That number has had several prompts already. Wait a few minutes and try again.";
  }
  return null;
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

  const due = amountDue(order);
  if (!due) return { ok: false, error: "This order is already paid. Refresh the order status." };

  const unavailable = await checkoutUnavailableReason();
  if (unavailable) return { ok: false, error: unavailable };
  const limited = attemptLimited(order.id);
  if (limited) return { ok: false, error: limited };

  const reference = newPaymentReference(order.orderNumber, due.purpose === "BALANCE" ? "BAL" : undefined);

  await db.payment.create({
    data: {
      orderId: order.id,
      reference,
      provider: "paystack",
      channel: paymentMethod,
      amount: due.amount,
      currency: order.currency,
      status: "PENDING",
      purpose: due.purpose,
      domain: await currentPaystackMode(),
    },
  });

  try {
    const init = await initializeTransaction({
      email: order.email,
      amount: due.amount,
      reference,
      currency: order.currency,
      callbackUrl: `${env.siteUrl()}/checkout/confirm?t=${orderAccessToken(order.orderNumber)}`,
      channels: paymentMethod === "mobile_money" ? ["mobile_money"] : ["card"],
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        isBalancePayment: due.purpose === "BALANCE",
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
  const due = amountDue(order);
  if (!due) {
    return { ok: false, error: "This order is already paid. Refresh the order status." };
  }

  const cleanPhone = normaliseGhanaMomoPhone(args.phone || order.phone || "");
  if (cleanPhone.length < 10) {
    return {
      ok: false,
      error: "Please enter a valid 10-digit Ghana Mobile Money number (e.g. 0244123456).",
    };
  }

  const integrations = await getIntegrations();
  if (!isReady(integrations, "paystack")) {
    return { ok: false, error: "Online payment is temporarily unavailable. Please try again shortly." };
  }
  const limited = attemptLimited(order.id, cleanPhone);
  if (limited) return { ok: false, error: limited };

  const provider: MomoProvider = args.provider;
  const providerLabel = MOMO_PROVIDER_LABELS[provider];
  const reference = newPaymentReference(order.orderNumber, "MOMO");

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
            message: `Customer initiated ${providerLabel} PIN prompt (${formatMoney(due.amount, order.currency)}) to ${cleanPhone} (Ref: ${reference}).`,
          },
        },
      },
    }),
    db.payment.create({
      data: {
        orderId: order.id,
        provider: "paystack",
        reference,
        amount: due.amount,
        currency: order.currency,
        status: "PENDING",
        channel: "mobile_money",
        mobileMoneyNumber: cleanPhone,
        purpose: due.purpose,
        domain: await currentPaystackMode(),
      },
    }),
  ]);

  try {
    const charge = await chargeMobileMoney({
      email: order.email,
      amount: due.amount,
      phone: cleanPhone,
      provider,
      reference,
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        isBalancePayment: due.purpose === "BALANCE",
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
      amountFormatted: formatMoney(due.amount, order.currency),
      displayText:
        charge.display_text ??
        `Live ${providerLabel} prompt sent to ${cleanPhone}. Please check your approvals and enter your 4-digit MoMo PIN to authorize.`,
    };
  } catch (err) {
    if (err instanceof PaystackError && err.timedOut) {
      // No answer: the prompt may have gone out, so keep watching this attempt.
      return {
        ok: true,
        reference,
        status: "pending",
        providerLabel,
        phone: cleanPhone,
        amountFormatted: formatMoney(due.amount, order.currency),
        displayText: "Your network is slow to answer. If a prompt arrives, approve it; this page will pick it up.",
      };
    }
    // No prompt went out, so this attempt is over; it must not linger as pending.
    await db.payment.update({ where: { reference }, data: { status: "FAILED" } }).catch(() => {});
    return {
      ok: false,
      error: err instanceof Error ? err.message.replace(/Paystack/gi, "payment provider") : "Failed to dispatch Mobile Money prompt.",
    };
  }
}

/**
 * 3. Customer submits telco SMS OTP if prompted before USSD pop-up
 */
export async function customerSubmitMomoOtpAction(args: {
  orderId: string;
  token: string;
  reference: string;
  otp: string;
}): Promise<CustomerMomoPushResult> {
  const order = await loadPayableOrder(args.orderId, args.token);
  if (!order) return { ok: false, error: "We could not open this order. Reload the page and try again." };
  if (!rateLimit(`momo-otp:${args.reference}`, { limit: 8, windowMs: 15 * 60 * 1000 }).ok) {
    return { ok: false, error: "Too many codes tried. Generate a new one and wait a few minutes." };
  }

  const payment = await db.payment.findUnique({
    where: { reference: args.reference },
    select: { orderId: true, status: true, rawResponse: true, mobileMoneyNumber: true, domain: true },
  });
  if (!payment || payment.orderId !== order.id || payment.status !== "PENDING") {
    return { ok: false, error: "This payment is no longer awaiting a code." };
  }

  try {
    const res = await submitMobileMoneyOtp({
      reference: args.reference,
      otp: args.otp,
      mode: payment.domain === "test" || payment.domain === "live" ? payment.domain : null,
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
      error: err instanceof Error ? err.message.replace(/Paystack/gi, "payment provider") : "Could not verify OTP.",
    };
  }
}

/**
 * 4. Polling endpoint for customer tracking page to check PIN authorization status
 */
export async function customerCheckMomoPinAction(args: {
  orderId: string;
  token: string;
  reference: string;
}): Promise<{
  ok: boolean;
  paid: boolean;
  message: string;
  /** Paystack's charge state while unpaid; "send_otp" means a code is wanted. */
  chargeStatus?: DirectChargeStatus | null;
  displayText?: string | null;
}> {
  const order = await loadPayableOrder(args.orderId, args.token);
  if (!order) return { ok: false, paid: false, message: "We could not open this order. Reload the page." };
  if (!rateLimit(`momo-check:${args.reference}`, { limit: 240, windowMs: 10 * 60 * 1000 }).ok) {
    return { ok: false, paid: false, message: "Checking too often. Wait a moment." };
  }
  const result = await checkDirectCharge({ orderId: order.id, reference: args.reference });
  if (result.paid) revalidatePath("/orders/track");
  return result;
}

/**
 * 5. The confirmation page's "Send the prompt again": same wallet, same
 * network, same amount, a new reference. Returns where to look next.
 */
export async function resendCheckoutPromptAction(
  reference: string,
  token: string,
): Promise<{ ok: true; reference: string } | { ok: false; error: string }> {
  if (!reference || typeof reference !== "string") return { ok: false, error: "Missing payment reference." };
  const payment = await db.payment.findUnique({
    where: { reference },
    select: { order: { select: { orderNumber: true, email: true, userId: true } } },
  });
  if (!payment || !(await canViewOrder(payment.order, { token }))) {
    return { ok: false, error: "We could not open this payment. Reload the page and try again." };
  }
  const result = await resendDirectDebitPrompt(reference);
  if (result.ok) revalidatePath("/checkout/confirm");
  return result;
}
