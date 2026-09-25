"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
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

export async function initiateMomoPinPushAction(args: {
  orderId: string;
  phone: string;
  provider?: "auto" | MomoProvider;
  chargeScope?: "FULL" | "DEPOSIT_50" | "REMAINING_BALANCE";
}): Promise<MomoPushResult> {
  const staff = await requirePermission("orders:write");

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

      revalidatePath(`/admin/orders/${order.id}`);
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

  // Interactive Simulator Mode when Paystack Secret Key is not yet configured
  revalidatePath(`/admin/orders/${order.id}`);
  return {
    ok: true,
    reference,
    status: "pay_offline",
    providerLabel,
    phone: cleanPhone,
    amountFormatted: formatMoney(amountToCharge),
    displayText: `[Demo / Simulator Mode — Add Paystack Secret Key in Settings for Live Telco Push] USSD PIN Prompt (${formatMoney(amountToCharge)}) dispatched to ${cleanPhone} (${providerLabel}). Waiting for customer to type their 4-digit MoMo PIN on their phone...`,
    simulated: true,
  };
}

export async function submitMomoPushOtpAction(args: {
  orderId: string;
  reference: string;
  otp: string;
}): Promise<MomoPushResult> {
  await requirePermission("orders:write");

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

export async function checkOrConfirmMomoPinAction(args: {
  orderId: string;
  reference: string;
  chargeScope?: "FULL" | "DEPOSIT_50" | "REMAINING_BALANCE";
  simulateClientPinEntered?: boolean;
}): Promise<{ ok: boolean; paid: boolean; message: string }> {
  const staff = await requirePermission("orders:write");

  const payment = await db.payment.findUnique({
    where: { reference: args.reference },
    include: { order: true },
  });

  if (!payment) {
    return { ok: false, paid: false, message: "Payment reference not found." };
  }

  if (payment.status === "SUCCESS") {
    return { ok: true, paid: true, message: "MoMo PIN confirmed! Order is already marked as PAID." };
  }

  const paystackConfig = activePaystack(await getIntegrations());

  if (!args.simulateClientPinEntered && paystackConfig.secretKey) {
    try {
      const verified = await verifyTransaction(args.reference);
      if (verified.status === "success") {
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

  if (args.simulateClientPinEntered) {
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
      message: `Client MoMo PIN Confirmed! ${formatMoney(payment.amount)} collected from ${payment.mobileMoneyNumber} and Order ${payment.order.orderNumber} is now marked PAID.`,
    };
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
        ...(args.chargeScope === "REMAINING_BALANCE" ? { balancePaidAt: now } : {}),
        events: {
          create: {
            type: "payment.momo_pin_confirmed",
            message: `Client entered MoMo PIN on ${args.cleanPhone} (${args.providerLabel}). ${formatMoney(args.amountToCharge)} confirmed & order marked PAID (Ref: ${args.reference}).`,
            actorId: args.actorId,
          },
        },
      },
    }),
  ]);

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

  revalidatePath(`/admin/orders/${args.orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/preorders");
  revalidatePath("/admin/analytics");
  revalidatePath("/orders/track");
}
