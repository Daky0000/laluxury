import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiOptionsResponse } from "@/lib/auth/bearer";
import {
  verifyTransaction,
  submitMobileMoneyOtp,
  detectGhanaMomoProvider,
  MOMO_PROVIDER_LABELS,
} from "@/lib/paystack";
import { markOrderPaid } from "@/lib/orders";
import { getIntegrations, activePaystack } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = apiOptionsResponse;

/**
 * GET /api/app/orders/verify?reference=...
 *
 * Verifies Mobile Money PIN payment status with Paystack.
 * Automatically marks order as PAID and dispatches SMS + Email receipts
 * as soon as the customer authorizes the transaction on their phone.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const reference = searchParams.get("reference")?.trim();
  const simulate = searchParams.get("simulate") === "true";

  if (!reference) {
    return NextResponse.json({ ok: false, error: "Payment reference is required." }, { status: 400 });
  }

  const payment = await db.payment.findUnique({
    where: { reference },
    include: { order: true },
  });

  if (!payment) {
    return NextResponse.json({ ok: false, error: "Payment record not found." }, { status: 404 });
  }

  // Already marked as paid
  if (payment.status === "SUCCESS") {
    return NextResponse.json({
      ok: true,
      paid: true,
      order: {
        id: payment.order.id,
        orderNumber: payment.order.orderNumber,
        status: payment.order.status,
        paymentStatus: payment.order.paymentStatus,
        total: payment.order.total,
        depositAmount: payment.order.depositAmount,
        currency: payment.order.currency,
      },
    });
  }

  // Test simulation path
  if (simulate || payment.provider === "test_simulation") {
    await markOrderPaid({
      orderId: payment.orderId,
      reference,
      amount: payment.amount,
      channel: "test_simulation",
      providerTransactionId: `SIM-${Date.now()}`,
    });

    return NextResponse.json({
      ok: true,
      paid: true,
      simulated: true,
      order: {
        id: payment.order.id,
        orderNumber: payment.order.orderNumber,
        status: "PAID",
        paymentStatus: "SUCCESS",
        total: payment.order.total,
        depositAmount: payment.order.depositAmount,
        currency: payment.order.currency,
      },
    });
  }

  // Live / Test Paystack verification
  const paystackConfig = activePaystack(await getIntegrations());
  if (!paystackConfig.secretKey) {
    return NextResponse.json({
      ok: true,
      paid: false,
      status: "pending",
      message: "Awaiting payment verification.",
    });
  }

  try {
    const verified = await verifyTransaction(reference);

    if (verified.status === "success") {
      const provider = detectGhanaMomoProvider(payment.mobileMoneyNumber || "");
      const channelLabel = MOMO_PROVIDER_LABELS[provider] || "Mobile Money";

      await markOrderPaid({
        orderId: payment.orderId,
        reference,
        amount: verified.amount,
        channel: verified.channel || "mobile_money",
        providerTransactionId: String(verified.id),
        mobileMoneyNumber: verified.authorization?.mobile_money_number || payment.mobileMoneyNumber,
        raw: verified as never,
      });

      return NextResponse.json({
        ok: true,
        paid: true,
        channel: channelLabel,
        order: {
          id: payment.order.id,
          orderNumber: payment.order.orderNumber,
          status: "PAID",
          paymentStatus: "SUCCESS",
          total: payment.order.total,
          depositAmount: payment.order.depositAmount,
          currency: payment.order.currency,
        },
      });
    }

    if (verified.status === "failed" || verified.status === "abandoned") {
      return NextResponse.json({
        ok: true,
        paid: false,
        status: "failed",
        error: verified.gateway_response || "Payment timed out or was declined on your handset.",
      });
    }

    return NextResponse.json({
      ok: true,
      paid: false,
      status: verified.status,
      message: "Waiting for MoMo PIN entry on handset...",
    });
  } catch (err) {
    return NextResponse.json({
      ok: true,
      paid: false,
      status: "pending",
      message: err instanceof Error ? err.message : "Checking gateway status...",
    });
  }
}

/**
 * POST /api/app/orders/verify
 *
 * Submits an SMS OTP or voucher code (required for some networks like Telecel Cash).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reference, otp } = body;

    if (!reference || !otp) {
      return NextResponse.json(
        { ok: false, error: "Reference and OTP are required." },
        { status: 400 },
      );
    }

    const res = await submitMobileMoneyOtp({
      reference: reference.trim(),
      otp: otp.trim(),
    });

    return NextResponse.json({
      ok: true,
      status: res.status,
      displayText: res.display_text,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to submit OTP." },
      { status: 500 },
    );
  }
}
