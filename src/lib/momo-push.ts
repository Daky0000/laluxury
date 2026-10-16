import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  chargeMobileMoney,
  checkPendingCharge,
  submitMobileMoneyOtp,
  verifyTransaction,
  detectGhanaMomoProvider,
  normaliseGhanaMomoPhone,
  MOMO_PROVIDER_LABELS,
  type MomoProvider,
  type PaystackChargeResult,
  type PaystackChargeStatus,
} from "@/lib/paystack";
import { isMomoNetworkId } from "@/lib/momo-networks";
import { getIntegrations, activePaystack } from "@/lib/integrations";
import { formatMoney } from "@/lib/money";
import { logAudit } from "@/lib/audit";
import { markOrderPaid } from "@/lib/orders";
import { rateLimit } from "@/lib/rate-limit";

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
    select: { rawResponse: true, mobileMoneyNumber: true, status: true },
  });
  const stored = readDirectCharge(payment?.rawResponse);
  const provider = stored.provider ?? detectGhanaMomoProvider(payment?.mobileMoneyNumber ?? "");
  if (!payment || payment.status !== "PENDING") return { ...stored, provider };

  try {
    const charge = await checkPendingCharge(reference);
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
  if (order.paymentStatus === "SUCCESS" || payment.status === "SUCCESS") {
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
    const verified = await verifyTransaction(reference);
    if (verified.status === "success") {
      return { ok: false, error: "Your earlier approval just came through. Refresh this page." };
    }
  } catch {
    // Unknown to Paystack (never started) or unreachable: the new charge decides.
  }

  const stored = readDirectCharge(payment.rawResponse);
  const provider = stored.provider ?? detectGhanaMomoProvider(payment.mobileMoneyNumber);
  const nextReference = `${order.orderNumber}-${Date.now().toString(36).toUpperCase()}`;

  await db.$transaction([
    db.payment.updateMany({ where: { reference, status: "PENDING" }, data: { status: "FAILED" } }),
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
      },
    }),
    db.orderEvent.create({
      data: {
        orderId: order.id,
        type: "momo.push_sent",
        message: `Customer asked for the ${MOMO_PROVIDER_LABELS[provider]} prompt again (${formatMoney(payment.amount)}) on ${payment.mobileMoneyNumber} (Ref: ${nextReference}).`,
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
    if (charge.status === "success") {
      await markOrderPaid({
        orderId: order.id,
        reference: nextReference,
        amount: payment.amount,
        channel: "mobile_money",
        mobileMoneyNumber: payment.mobileMoneyNumber,
      });
    }
    return { ok: true, reference: nextReference };
  } catch (error) {
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
  if (order.paidAt && (!order.depositAmount || order.balancePaidAt || order.depositAmount >= order.total)) {
    return { ok: false, error: "This order is already paid. Refresh the order status." };
  }
  if (order.paidAt && args.chargeScope !== "REMAINING_BALANCE") {
    return { ok: false, error: "The deposit is already paid. Select the remaining balance." };
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
    amountToCharge = order.depositAmount ?? Math.round(order.total * 0.5);
  } else if (args.chargeScope === "REMAINING_BALANCE") {
    const dep = order.depositAmount ?? Math.round(order.total * 0.5);
    amountToCharge = Math.max(0, order.total - dep);
  }

  if (amountToCharge <= 0) {
    return { ok: false, error: "No remaining balance to charge on this order." };
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
        ...(args.chargeScope === "DEPOSIT_50" && !order.depositAmount
          ? { depositAmount: amountToCharge, hasPreorderItems: true }
          : {}),
        events: {
          create: {
            type: "momo.push_sent",
            message: `Direct ${providerLabel} PIN prompt (${formatMoney(amountToCharge)}) pushed to ${cleanPhone} (Ref: ${reference}). Waiting for client to enter MoMo PIN.`,
            actorId: staff.id,
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
        currency: "GHS",
        status: "PENDING",
        channel: "mobile_money",
        mobileMoneyNumber: cleanPhone,
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
        await finalizeMomoOrderPayment({
          orderId: order.id,
          reference,
          amountToCharge,
          cleanPhone,
          providerLabel,
          chargeScope: args.chargeScope,
          actorId: staff.id,
        });
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
        amountFormatted: formatMoney(amountToCharge),
        displayText:
          charge.display_text ??
          `Live ${providerLabel} PIN prompt sent to ${cleanPhone}. Ask the client to check their phone screen (or dial *170# > My Wallet > My Approvals for MTN) and enter their 4-digit MoMo PIN.`,
        simulated: false,
      };
    } catch (err) {
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
    select: { orderId: true, rawResponse: true, mobileMoneyNumber: true },
  });
  if (!payment || payment.orderId !== args.orderId) {
    return { ok: false, error: "Payment reference not found." };
  }
  const provider =
    readDirectCharge(payment.rawResponse).provider ?? detectGhanaMomoProvider(payment.mobileMoneyNumber ?? "");

  try {
    const res = await submitMobileMoneyOtp({
      reference: args.reference,
      otp: args.otp,
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

export async function checkMomoPin(args: {
  orderId: string;
  reference: string;
  chargeScope?: "FULL" | "DEPOSIT_50" | "REMAINING_BALANCE";
  actor: MomoActor;
}): Promise<{ ok: boolean; paid: boolean; message: string; chargeStatus?: PaystackChargeStatus | null; displayText?: string | null }> {
  const staff = args.actor;

  const payment = await db.payment.findUnique({
    where: { reference: args.reference },
    include: { order: true },
  });

  if (!payment || payment.orderId !== args.orderId) {
    return { ok: false, paid: false, message: "Payment reference not found." };
  }

  if (payment.status === "SUCCESS") {
    return { ok: true, paid: true, message: "MoMo PIN confirmed! Order is already marked as PAID." };
  }

  const paystackConfig = activePaystack(await getIntegrations());

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
        await finalizeMomoOrderPayment({
          orderId: payment.orderId,
          reference: args.reference,
          amountToCharge: payment.amount,
          cleanPhone: payment.mobileMoneyNumber ?? "",
          providerLabel: MOMO_PROVIDER_LABELS[provider],
          chargeScope: args.chargeScope,
          actorId: staff.id,
        });
        return {
          ok: true,
          paid: true,
          message: `MoMo PIN verified via Paystack! ${formatMoney(payment.amount)} received and Order ${payment.order.orderNumber} is now PAID.`,
        };
      }
      // Not settled. Paystack also calls a prompt not yet approved
      // "abandoned", so the charge itself says whether it is over or wants a code.
      const charge = await refreshDirectCharge(args.reference);
      if (verified.status === "failed" || charge.status === "failed") {
        return {
          ok: true,
          paid: false,
          chargeStatus: "failed",
          message: `Customer cancelled or PIN prompt timed out (${verified.gateway_response ?? "not approved"}). You can re-send the prompt anytime.`,
        };
      }
      return {
        ok: true,
        paid: false,
        chargeStatus: charge.status,
        displayText: charge.displayText,
        message:
          charge.status === "send_otp"
            ? charge.displayText ?? "The network needs a code before it sends the prompt. Enter it to continue."
            : "Still waiting for customer to enter their 4-digit MoMo PIN on their handset...",
      };
    } catch {
      return {
        ok: true,
        paid: false,
        message: "Waiting for customer to complete MoMo PIN prompt...",
      };
    }
  }

  return {
    ok: true,
    paid: false,
    message: "Waiting for customer to enter their MoMo PIN on their handset...",
  };
}

async function finalizeMomoOrderPayment(args: {
  orderId: string;
  reference: string;
  amountToCharge: number;
  cleanPhone: string;
  providerLabel: string;
  chargeScope?: "FULL" | "DEPOSIT_50" | "REMAINING_BALANCE";
  actorId: string;
}) {
  // One finalizer for every payment path: stock, discounts, carts, alerts
  // and customer notices all happen in markOrderPaid, exactly once.
  await markOrderPaid({
    orderId: args.orderId,
    reference: args.reference,
    amount: args.amountToCharge,
    channel: "mobile_money",
    mobileMoneyNumber: args.cleanPhone || null,
  });

  await logAudit({
    actorId: args.actorId,
    action: "order.momo_push_paid",
    entity: "Order",
    entityId: args.orderId,
    after: {
      reference: args.reference,
      amount: args.amountToCharge,
      phone: args.cleanPhone,
      providerLabel: args.providerLabel,
    },
  });

  try {
    revalidatePath(`/admin/orders/${args.orderId}`);
    revalidatePath("/admin/orders");
    revalidatePath("/admin/preorders");
    revalidatePath("/admin/analytics");
    revalidatePath("/orders/track");
  } catch {
    // Outside a request (e.g. API route background), nothing to revalidate.
  }
}
