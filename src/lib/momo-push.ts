import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  chargeMobileMoney,
  submitMobileMoneyOtp,
  verifyTransaction,
  detectGhanaMomoProvider,
  normaliseGhanaMomoPhone,
  MOMO_PROVIDER_LABELS,
  type MomoProvider,
} from "@/lib/paystack";
import { getIntegrations, activePaystack } from "@/lib/integrations";
import { formatMoney } from "@/lib/money";
import { logAudit } from "@/lib/audit";
import { markOrderPaid } from "@/lib/orders";

export type MomoActor = {
  id: string;
  email?: string | null;
  role?: string | null;
};

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
        phone: cleanPhone,
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
    select: { orderId: true },
  });
  if (!payment || payment.orderId !== args.orderId) {
    return { ok: false, error: "Payment reference not found." };
  }

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
        "OTP accepted! The USSD PIN prompt is now on the customer's phone screen awaiting their 4-digit MoMo PIN.",
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
}): Promise<{ ok: boolean; paid: boolean; message: string }> {
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
      if (verified.status === "failed" || verified.status === "abandoned") {
        return {
          ok: true,
          paid: false,
          message: `Customer cancelled or PIN prompt timed out (${verified.gateway_response ?? verified.status}). You can re-send the prompt anytime.`,
        };
      }
      return {
        ok: true,
        paid: false,
        message: "Still waiting for customer to enter their 4-digit MoMo PIN on their handset...",
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
