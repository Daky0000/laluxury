import { NextRequest, NextResponse } from "next/server";
import { rateLimitResponse, requestAddress } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { apiOptionsResponse } from "@/lib/auth/bearer";
import { submitMobileMoneyOtp, detectGhanaMomoProvider, MOMO_PROVIDER_LABELS } from "@/lib/paystack";
import { reconcilePaystackPayment } from "@/lib/checkout-payment";
import { isPaymentSettled } from "@/lib/orders";
import { getIntegrations, activePaystack } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = apiOptionsResponse;

/**
 * GET /api/app/orders/verify?reference=...
 *
 * Verifies a payment with Paystack while the app waits on it. The reference
 * is a random, unguessable value handed only to the payer, and the answer
 * carries no personal details. Settlement goes through the same checks as the
 * webhook (`reconcilePaystackPayment`): a mismatch is held for review.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const reference = searchParams.get("reference")?.trim();

  const limited = rateLimitResponse([
    { key: `app-pay-verify-ip:${await requestAddress()}`, limit: 120, windowMs: 10 * 60 * 1000 },
    ...(reference ? [{ key: `app-pay-verify-ref:${reference}`, limit: 240, windowMs: 10 * 60 * 1000 }] : []),
  ]);
  if (limited) return limited;

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

  const orderSummary = (o: typeof payment.order) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    paymentStatus: o.paymentStatus,
    total: o.total,
    depositAmount: o.depositAmount,
    currency: o.currency,
  });

  // Already marked as paid
  if (payment.status === "SUCCESS") {
    return NextResponse.json({ ok: true, paid: true, order: orderSummary(payment.order) });
  }
  if (payment.heldAt) {
    return NextResponse.json({
      ok: true,
      paid: false,
      status: "held",
      message: "Our team is checking this payment and will be in touch.",
    });
  }

  // Legacy simulated records must never become paid without a real transaction.
  if (payment.provider !== "paystack") {
    return NextResponse.json({ ok: true, paid: false, status: "pending" });
  }

  if (!activePaystack(await getIntegrations()).secretKey) {
    return NextResponse.json({
      ok: true,
      paid: false,
      status: "pending",
      message: "Awaiting payment verification.",
    });
  }

  try {
    const outcome = await reconcilePaystackPayment({
      orderId: payment.orderId,
      orderNumber: payment.order.orderNumber,
      reference,
      amount: payment.amount,
      currency: payment.currency,
      domain: payment.domain,
    });

    if (outcome === "paid") {
      const fresh = await db.order.findUniqueOrThrow({ where: { id: payment.orderId } });
      const provider = detectGhanaMomoProvider(payment.mobileMoneyNumber || "");
      return NextResponse.json({
        ok: true,
        paid: isPaymentSettled(fresh.paymentStatus),
        channel: MOMO_PROVIDER_LABELS[provider] || "Mobile Money",
        order: orderSummary(fresh),
      });
    }
    if (outcome === "held") {
      return NextResponse.json(
        { ok: false, paid: false, status: "held", error: "Payment details did not match this order. Our team has been told." },
        { status: 409 },
      );
    }
    if (outcome === "failed") {
      return NextResponse.json({
        ok: true,
        paid: false,
        status: "failed",
        error: "Payment timed out or was declined on your handset.",
      });
    }

    // "unfinished" or "pending": the app polls from the moment the Paystack
    // page opens, when Paystack already reads "abandoned".
    return NextResponse.json({
      ok: true,
      paid: false,
      status: "pending",
      message: "Waiting for MoMo PIN entry on handset...",
    });
  } catch {
    return NextResponse.json({
      ok: true,
      paid: false,
      status: "pending",
      message: "Checking gateway status...",
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

    const ref = String(reference).trim();
    const perReference = rateLimitResponse([{ key: `momo-otp:${ref}`, limit: 8, windowMs: 15 * 60 * 1000 }]);
    if (perReference) return perReference;

    const pending = await db.payment.findUnique({
      where: { reference: ref },
      select: { status: true, provider: true, domain: true },
    });
    if (!pending || pending.provider !== "paystack" || pending.status !== "PENDING") {
      return NextResponse.json({ ok: false, error: "This payment is no longer awaiting a code." }, { status: 404 });
    }

    const res = await submitMobileMoneyOtp({
      reference: ref,
      otp: String(otp).trim(),
      mode: pending.domain === "test" || pending.domain === "live" ? pending.domain : null,
    });

    return NextResponse.json({
      ok: true,
      status: res.status,
      displayText: res.display_text,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message.replace(/Paystack/gi, "payment provider") : "Failed to submit OTP." },
      { status: 500 },
    );
  }
}
