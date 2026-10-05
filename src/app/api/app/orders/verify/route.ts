import { NextRequest, NextResponse } from "next/server";
import { rateLimitResponse, requestAddress } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { apiOptionsResponse } from "@/lib/auth/bearer";
import {
  verifyTransaction,
  submitMobileMoneyOtp,
  detectGhanaMomoProvider,
  MOMO_PROVIDER_LABELS,
} from "@/lib/paystack";
import { markOrderPaid, markPaymentFailed } from "@/lib/orders";
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
  const limited = rateLimitResponse([
    { key: `app-pay-verify-ip:${await requestAddress()}`, limit: 120, windowMs: 10 * 60 * 1000 },
  ]);
  if (limited) return limited;
  const { searchParams } = new URL(request.url);
  const reference = searchParams.get("reference")?.trim();

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

  // Legacy simulated records must never become paid without a real transaction.
  if (payment.provider === "test_simulation") {
    return NextResponse.json({ ok: true, paid: false, status: "pending" });
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
      const expectedCurrency = payment.currency.toUpperCase();
      const actualCurrency = verified.currency.toUpperCase();
      if (verified.amount !== payment.amount || actualCurrency !== expectedCurrency) {
        console.error("[payment.verify] amount or currency mismatch", {
          reference,
          expectedAmount: payment.amount,
          actualAmount: verified.amount,
          expectedCurrency,
          actualCurrency,
        });
        return NextResponse.json(
          { ok: false, paid: false, error: "Payment details did not match this order." },
          { status: 409 },
        );
      }
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
      await markPaymentFailed({
        orderId: payment.orderId,
        reference,
        reason: verified.gateway_response || `Payment ${verified.status}.`,
      });
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
  const limited = rateLimitResponse([
    { key: `app-pay-otp-ip:${await requestAddress()}`, limit: 20, windowMs: 10 * 60 * 1000 },
  ]);
  if (limited) return limited;
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
