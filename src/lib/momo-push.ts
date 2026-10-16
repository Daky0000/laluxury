import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  chargeMobileMoney,
  checkPendingCharge,
  currentPaystackMode,
  submitMobileMoneyOtp,
  detectGhanaMomoProvider,
  normaliseGhanaMomoPhone,
  MOMO_PROVIDER_LABELS,
  PaystackError,
  type MomoProvider,
  type PaystackChargeResult,
  type PaystackChargeStatus,
} from "@/lib/paystack";
import { isMomoNetworkId } from "@/lib/momo-networks";
import { getIntegrations, activePaystack } from "@/lib/integrations";
import { formatMoney } from "@/lib/money";
import { logAudit } from "@/lib/audit";
import { isPaymentSettled, outstandingBalance, type PaymentPurpose } from "@/lib/orders";
import { reconcilePaystackPayment } from "@/lib/checkout-payment";
import { newPaymentReference } from "@/lib/payment-reference";
import { DEFAULT_DEPOSIT_PERCENT, depositAmountFor } from "@/lib/deposits";
import { rateLimit } from "@/lib/rate-limit";

function modeOf(domain: string | null | undefined): "live" | "test" | null {
  return domain === "live" || domain === "test" ? domain : null;
}

/**
 * How long a prompt is left alone before it may be sent again. MTN prompts
 * lapse after about a minute, but the request stays in the wallet's approvals
 * menu; sending a second one too soon is how people end up approving both.
 */
const RESEND_AFTER_MS = 60 * 1000;

export type MomoActor = {
  id: string;
  email?: string | null;
  role?: string | null;
};

// --- Direct charge state -----------------------------------------------------
//
// A direct charge moves through Paystack's states (pending → send_otp or
// pay_offline → success). The latest one, the network it went to and
// Paystack's own instruction text are kept on the payment row, so every page
// that shows the charge can say exactly what the payer has to do next.

export type DirectChargeState = {
  provider: MomoProvider | null;
  status: PaystackChargeStatus | null;
  displayText: string | null;
};

type StoredDirectCharge = {
  directCharge?: { provider?: string; status?: string; displayText?: string | null };
};

const CHARGE_STATUSES: readonly PaystackChargeStatus[] = ["pay_offline", "send_otp", "success", "pending", "failed"];

/** The stored direct-charge state on a payment row, if any. */
export function readDirectCharge(raw: unknown): DirectChargeState {
  const stored = (raw && typeof raw === "object" ? (raw as StoredDirectCharge).directCharge : null) ?? {};
  return {
    provider: isMomoNetworkId(stored.provider) ? stored.provider : null,
    status: CHARGE_STATUSES.includes(stored.status as PaystackChargeStatus)
      ? (stored.status as PaystackChargeStatus)
      : null,
    displayText: typeof stored.displayText === "string" ? stored.displayText : null,
  };
}

/** Keeps what Paystack last said about a direct charge on its payment row. */
export async function recordDirectCharge(
  reference: string,
  provider: MomoProvider,
  charge: Pick<PaystackChargeResult, "status" | "display_text">,
): Promise<void> {
  await db.payment
    .updateMany({
      // A settled payment keeps its verification payload.
      where: { reference, status: { not: "SUCCESS" } },
      data: {
        rawResponse: {
          directCharge: { provider, status: charge.status, displayText: charge.display_text ?? null },
        },
      },
    })
    .catch((error) => console.error("[momo] could not record charge state", reference, error));
}

/**
 * Asks Paystack where an unsettled direct charge stands (`GET /charge/:reference`)
 * and records it. A charge that answered `pending` can turn into `send_otp`
 * later, and only this endpoint says so. Returns the stored state when
 * Paystack cannot be reached.
 */
export async function refreshDirectCharge(reference: string): Promise<DirectChargeState> {
  const payment = await db.payment.findUnique({
    where: { reference },
    select: { rawResponse: true, mobileMoneyNumber: true, status: true, domain: true },
  });
  const stored = readDirectCharge(payment?.rawResponse);
  const provider = stored.provider ?? detectGhanaMomoProvider(payment?.mobileMoneyNumber ?? "");
  if (!payment || payment.status !== "PENDING") return { ...stored, provider };

  try {
    const charge = await checkPendingCharge(reference, modeOf(payment.domain));
    if (!CHARGE_STATUSES.includes(charge.status)) return { ...stored, provider };
    // Paystack leaves out the text on a repeat check; keep the earlier one.
    const displayText = charge.display_text ?? (charge.status === stored.status ? stored.displayText : null);
    if (charge.status !== stored.status || displayText !== stored.displayText) {
      await recordDirectCharge(reference, provider, { status: charge.status, display_text: displayText ?? undefined });
    }
    return { provider, status: charge.status, displayText };
  } catch (error) {
    console.error("[momo] could not check pending charge", reference, error);
    return { ...stored, provider };
  }
}

/**
 * Sends the prompt for a storefront Direct Debit again, to the same wallet and
 * network, for the same amount. MTN prompts lapse after about a minute and
 * are easy to miss, which is where most "the prompt never came" reports start.
 *
 * Whoever holds the payment reference can already see this order on the
 * confirmation page; this only repeats a request the payer started, to the
 * number they gave, so it asks for no more proof than that. Rate limited.
 */
export async function resendDirectDebitPrompt(
  reference: string,
): Promise<{ ok: true; reference: string } | { ok: false; error: string }> {
  const payment = await db.payment.findUnique({ where: { reference }, include: { order: true } });
  if (!payment?.mobileMoneyNumber || payment.provider !== "paystack") {
    return { ok: false, error: "This payment cannot be sent to a phone again." };
  }
  const order = payment.order;
  if (payment.status === "SUCCESS" || (isPaymentSettled(order.paymentStatus) && outstandingBalance(order) === 0)) {
    return { ok: false, error: "This order is already paid." };
  }
  if (order.status === "CANCELLED" || order.status === "REFUNDED") {
    return { ok: false, error: "This order was cancelled. Go back to your bag to check out again." };
  }
  const limited = rateLimit(`momo-resend:${order.id}`, { limit: 5, windowMs: 15 * 60 * 1000 });
  if (!limited.ok) {
    return { ok: false, error: "That is a lot of prompts in a row. Wait a few minutes, or choose another way to pay." };
  }

  // Money that already landed on the earlier prompt must not be asked for twice.
  try {
    const outcome = await reconcilePaystackPayment(
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        reference,
        amount: payment.amount,
        currency: payment.currency,
        domain: payment.domain,
      },
      { recordFailure: false },
    );
    if (outcome === "paid" || outcome === "held") {
      return { ok: false, error: "Your earlier approval just came through. Refresh this page." };
    }
  } catch {
    // Unknown to Paystack (never started) or unreachable: the new charge decides.
  }

  // A prompt still out there is left to run its course first.
  const stored = readDirectCharge(payment.rawResponse);
  const live = payment.status === "PENDING" && stored.status !== "failed";
  if (live && Date.now() - payment.createdAt.getTime() < RESEND_AFTER_MS) {
    return {
      ok: false,
      error: "The first prompt may still be on its way. Check your approvals menu, and send it again after a minute if nothing came.",
    };
  }

  const provider = stored.provider ?? detectGhanaMomoProvider(payment.mobileMoneyNumber);
  const nextReference = newPaymentReference(order.orderNumber);
  const mode = await currentPaystackMode();

  // The earlier attempt stays on file as it is: if it is approved after all,
  // it is still recorded (and, as a second payment, raised for a refund).
  await db.$transaction([
    db.payment.create({
      data: {
        orderId: order.id,
        reference: nextReference,
        provider: "paystack",
        channel: "mobile_money",
        amount: payment.amount,
        currency: payment.currency,
        status: "PENDING",
        mobileMoneyNumber: payment.mobileMoneyNumber,
        purpose: payment.purpose,
        domain: mode,
      },
    }),
    db.orderEvent.create({
      data: {
        orderId: order.id,
        type: "momo.push_sent",
        message: `Customer asked for the ${MOMO_PROVIDER_LABELS[provider]} prompt again (${formatMoney(payment.amount, payment.currency)}) on ${payment.mobileMoneyNumber} (Ref: ${nextReference}).`,
      },
    }),
  ]);

  try {
    const charge = await chargeMobileMoney({
      email: order.email,
      amount: payment.amount,
      phone: payment.mobileMoneyNumber,
      provider,
      reference: nextReference,
      metadata: { orderId: order.id, orderNumber: order.orderNumber, source: "web_storefront", channel: "direct_debit", resend: true },
    });
    if (charge.status === "failed") {
      throw new Error(charge.display_text || charge.message || "That MoMo number could not be charged.");
    }
    await recordDirectCharge(nextReference, provider, charge);
    return { ok: true, reference: nextReference };
  } catch (error) {
    // No answer: the prompt may have gone out, so the attempt stays pending.
    if (error instanceof PaystackError && error.timedOut) return { ok: true, reference: nextReference };
    await db.payment.update({ where: { reference: nextReference }, data: { status: "FAILED" } }).catch(() => {});
    const message = error instanceof Error ? error.message.replace(/Paystack/gi, "payment provider") : "";
    return { ok: false, error: message || "We could not send the prompt again. Try again shortly." };
  }
}

export type MomoPushResult = {
  ok: boolean;
  reference?: string;
  status?: "pay_offline" | "send_otp" | "success" | "pending" | "failed";
  providerLabel?: string;
  phone?: string;
  amountFormatted?: string;
  displayText?: string;
  simulated?: boolean;
  error?: string;
};

/**
 * Server-only MoMo PIN push. Callers must authenticate the actor first; this
 * module is deliberately not a server action so the actor cannot be supplied
 * by a browser.
 */
export async function initiateMomoPinPush(args: {
  orderId: string;
  phone: string;
  provider?: "auto" | MomoProvider;
  chargeScope?: "FULL" | "DEPOSIT_50" | "REMAINING_BALANCE";
  actor: MomoActor;
  /** Only staff may turn a full-price order into a deposit order. */
  allowDepositChange?: boolean;
}): Promise<MomoPushResult> {
  const staff = args.actor;

  const order = await db.order.findUnique({
    where: { id: args.orderId },
  });
  if (!order) {
    return { ok: false, error: "Order not found." };
  }
  if (order.status === "CANCELLED" || order.status === "REFUNDED") {
    return { ok: false, error: "This order has been cancelled or refunded." };
  }
  const settled = isPaymentSettled(order.paymentStatus);
  if (settled && outstandingBalance(order) === 0) {
    return { ok: false, error: "This order is already paid. Refresh the order status." };
  }
  if (settled && args.chargeScope !== "REMAINING_BALANCE") {
    return { ok: false, error: "The deposit is already paid. Select the remaining balance." };
  }
  // The balance comes after the deposit, never instead of it.
  if (!settled && args.chargeScope === "REMAINING_BALANCE") {
    return { ok: false, error: "The deposit has not been paid yet. Collect the deposit first." };
  }

  const cleanPhone = normaliseGhanaMomoPhone(args.phone || order.phone || "");
  if (cleanPhone.length < 10) {
    return { ok: false, error: "Please enter a valid 10-digit Ghana Mobile Money number (e.g. 0244123456)." };
  }

  const provider: MomoProvider =
    !args.provider || args.provider === "auto"
      ? detectGhanaMomoProvider(cleanPhone)
      : args.provider;
  const providerLabel = MOMO_PROVIDER_LABELS[provider];

  let amountToCharge = order.total;
  if (
    (args.chargeScope === "DEPOSIT_50" || args.chargeScope === "REMAINING_BALANCE") &&
    !order.depositAmount &&
    !args.allowDepositChange
  ) {
    return { ok: false, error: "This order is not a deposit order." };
  }
  if (args.chargeScope === "DEPOSIT_50") {
    amountToCharge = order.depositAmount ?? depositAmountFor(order.total, DEFAULT_DEPOSIT_PERCENT) ?? order.total;
  } else if (args.chargeScope === "REMAINING_BALANCE") {
    amountToCharge = outstandingBalance(order);
  }

  if (amountToCharge <= 0) {
    return { ok: false, error: "No remaining balance to charge on this order." };
  }

  const reference = newPaymentReference(order.orderNumber, "MOMO");
  const purpose: PaymentPurpose =
    args.chargeScope === "REMAINING_BALANCE" ? "BALANCE" : args.chargeScope === "DEPOSIT_50" ? "DEPOSIT" : "FULL";
  const mode = await currentPaystackMode();

  // Save the phone on the order if not already set, and create a PENDING Payment row
  await db.$transaction([
    db.order.update({
      where: { id: order.id },
      data: {
        // The paying wallet is often not the delivery contact; keep the latter.
        ...(order.phone ? {} : { phone: cleanPhone }),
        paymentMethod: "mobile_money_push",
        ...(args.chargeScope === "DEPOSIT_50" && !order.depositAmount
          ? { depositAmount: amountToCharge, hasPreorderItems: true }
          : {}),
        events: {
          create: {
            type: "momo.push_sent",
            message: `Direct ${providerLabel} PIN prompt (${formatMoney(amountToCharge, order.currency)}) pushed to ${cleanPhone} (Ref: ${reference}). Waiting for client to enter MoMo PIN.`,
            actorId: staff.id || null,
          },
        },
      },
    }),
    db.payment.create({
      data: {
        orderId: order.id,
        provider: "paystack",
        reference,
        amount: amountToCharge,
        currency: order.currency,
        status: "PENDING",
        channel: "mobile_money",
        mobileMoneyNumber: cleanPhone,
        purpose,
        domain: mode,
      },
    }),
  ]);

  const paystackConfig = activePaystack(await getIntegrations());

  // If live/test Paystack secret key is configured, call Paystack's real POST /charge API
  if (paystackConfig.secretKey) {
    try {
      const charge = await chargeMobileMoney({
        email: order.email,
        amount: amountToCharge,
        phone: cleanPhone,
        provider,
        reference,
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          chargeScope: args.chargeScope ?? "FULL",
          initiatedByStaff: staff.email,
        },
      });
      if (charge.status === "failed") {
        throw new Error(
          charge.display_text || charge.message || "That MoMo number could not be charged. Check the number and network.",
        );
      }
      await recordDirectCharge(reference, provider, charge);

      if (charge.status === "success") {
        await checkMomoPin({ orderId: order.id, reference, chargeScope: args.chargeScope, actor: staff });
      }

      try {
        revalidatePath(`/admin/orders/${order.id}`);
      } catch {
        // Safe to ignore outside Next.js Server Action context
      }
      return {
        ok: true,
        reference,
        status: charge.status,
        providerLabel,
        phone: cleanPhone,
        amountFormatted: formatMoney(amountToCharge, order.currency),
        displayText:
          charge.display_text ??
          `Live ${providerLabel} PIN prompt sent to ${cleanPhone}. Ask the client to check their phone screen (or dial *170# > My Wallet > My Approvals for MTN) and enter their 4-digit MoMo PIN.`,
        simulated: false,
      };
    } catch (err) {
      if (err instanceof PaystackError && err.timedOut) {
        // No answer: the prompt may have gone out. Keep watching it.
        return {
          ok: true,
          reference,
          status: "pending",
          providerLabel,
          phone: cleanPhone,
          amountFormatted: formatMoney(amountToCharge, order.currency),
          displayText: "The network is slow to answer. If a prompt arrives, approve it; this page will pick it up.",
          simulated: false,
        };
      }
      // No prompt went out, so this attempt is over; it must not linger as pending.
      await db.payment.update({ where: { reference }, data: { status: "FAILED" } }).catch(() => {});
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to trigger Paystack Mobile Money charge.",
      };
    }
  }

  // Without a gateway no prompt was sent, so nothing can be confirmed later.
  await db.payment.update({ where: { reference }, data: { status: "FAILED" } });
  return {
    ok: false,
    error: "Mobile Money is not configured. Add the Paystack secret key in Settings.",
  };
}

export async function submitMomoPushOtp(args: {
  orderId: string;
  reference: string;
  otp: string;
}): Promise<MomoPushResult> {
  const payment = await db.payment.findUnique({
    where: { reference: args.reference },
    select: { orderId: true, rawResponse: true, mobileMoneyNumber: true, status: true, domain: true },
  });
  if (!payment || payment.orderId !== args.orderId) {
    return { ok: false, error: "Payment reference not found." };
  }
  if (payment.status !== "PENDING") {
    return { ok: false, error: "This payment is no longer awaiting a code." };
  }
  const provider =
    readDirectCharge(payment.rawResponse).provider ?? detectGhanaMomoProvider(payment.mobileMoneyNumber ?? "");

  try {
    const res = await submitMobileMoneyOtp({
      reference: args.reference,
      otp: args.otp,
      mode: modeOf(payment.domain),
    });
    if (res.status === "failed") {
      return { ok: false, error: res.display_text || res.message || "That code was not accepted." };
    }
    await recordDirectCharge(args.reference, provider, res);

    return {
      ok: true,
      reference: args.reference,
      status: res.status,
      displayText:
        res.display_text ??
        "Code accepted. The payment prompt is now on the customer's phone, waiting for their MoMo PIN.",
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not verify OTP.",
    };
  }
}

export type MomoCheckResult = {
  ok: boolean;
  paid: boolean;
  message: string;
  chargeStatus?: PaystackChargeStatus | null;
  displayText?: string | null;
};

/**
 * Where a direct MoMo charge stands, for whoever is watching it (staff on the
 * order page, the customer on the tracking page or in the app). Settlement
 * goes through the same checks as every other path; a mismatch is held for
 * review rather than reported as paid.
 */
export async function checkDirectCharge(args: { orderId: string; reference: string }): Promise<MomoCheckResult> {
  const payment = await db.payment.findUnique({
    where: { reference: args.reference },
    include: { order: true },
  });

  if (!payment || payment.orderId !== args.orderId) {
    return { ok: false, paid: false, message: "Payment reference not found." };
  }
  if (payment.status === "SUCCESS") {
    return { ok: true, paid: true, message: `Payment of ${formatMoney(payment.amount, payment.currency)} confirmed.` };
  }
  if (payment.heldAt) {
    return { ok: false, paid: false, message: "This payment is being checked by our team. We will be in touch." };
  }

  const paystackConfig = activePaystack(await getIntegrations());
  if (!paystackConfig.secretKey) {
    return { ok: true, paid: false, message: "Waiting for the MoMo PIN to be entered on the phone..." };
  }

  try {
    const outcome = await reconcilePaystackPayment(
      {
        orderId: payment.orderId,
        orderNumber: payment.order.orderNumber,
        reference: args.reference,
        amount: payment.amount,
        currency: payment.currency,
        domain: payment.domain,
      },
      { recordFailure: false },
    );
    if (outcome === "paid") {
      try {
        revalidatePath(`/admin/orders/${payment.orderId}`);
        revalidatePath("/admin/orders");
        revalidatePath("/orders/track");
      } catch {
        // Outside a request (e.g. API route background), nothing to revalidate.
      }
      return {
        ok: true,
        paid: true,
        message: `Payment of ${formatMoney(payment.amount, payment.currency)} confirmed via Mobile Money.`,
      };
    }
    if (outcome === "held") {
      return { ok: false, paid: false, message: "Payment details did not match this order. Our team has been told." };
    }

    // Not settled. Paystack also calls a prompt not yet approved
    // "abandoned", so the charge itself says whether it is over or wants a code.
    const charge = await refreshDirectCharge(args.reference);
    if (charge.status === "failed") {
      return {
        ok: true,
        paid: false,
        chargeStatus: "failed",
        message: "The prompt timed out or was declined. It can be sent again.",
      };
    }
    return {
      ok: true,
      paid: false,
      chargeStatus: charge.status,
      displayText: charge.displayText,
      message:
        charge.status === "send_otp"
          ? (charge.displayText ?? "The network needs a code before it sends the prompt. Enter it to continue.")
          : "Still waiting for the 4-digit MoMo PIN to be entered on the phone...",
    };
  } catch {
    return {
      ok: false,
      paid: false,
      message: "Could not confirm the payment status just now. Check again in a moment before resending.",
    };
  }
}

/** Staff check on a prompt they pushed; recorded in the audit log when it lands. */
export async function checkMomoPin(args: {
  orderId: string;
  reference: string;
  chargeScope?: "FULL" | "DEPOSIT_50" | "REMAINING_BALANCE";
  actor: MomoActor;
}): Promise<MomoCheckResult> {
  const before = await db.payment.findUnique({ where: { reference: args.reference }, select: { status: true } });
  const result = await checkDirectCharge(args);
  if (result.paid && before && before.status !== "SUCCESS") {
    await logAudit({
      actorId: args.actor.id,
      action: "order.momo_push_paid",
      entity: "Order",
      entityId: args.orderId,
      after: { reference: args.reference },
    });
  }
  return result;
}
