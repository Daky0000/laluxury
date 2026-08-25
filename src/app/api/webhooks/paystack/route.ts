import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyWebhookSignature, describeChannel, type PaystackWebhookEvent } from "@/lib/paystack";
import { markOrderPaid, markPaymentFailed, logOrderEvent } from "@/lib/orders";
import { postAlert } from "@/lib/agent/slack";
import { formatMoney } from "@/lib/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Paystack webhook.
 *
 * Paystack retries on any non-2xx, so this must be idempotent and must answer
 * quickly. Every branch returns 200 once the signature checks out - a 500 here
 * would have Paystack redeliver a message we have already handled.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    // Do not leak whether the secret is configured or the signature was wrong.
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: PaystackWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PaystackWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  try {
    await handleEvent(event);
  } catch (error) {
    // Log and still acknowledge: a retry would hit the same bug.
    console.error("[paystack webhook]", event.event, error);
  }

  return NextResponse.json({ received: true });
}

async function handleEvent(event: PaystackWebhookEvent): Promise<void> {
  const reference = event.data?.reference;
  if (!reference) return;

  const payment = await db.payment.findUnique({
    where: { reference },
    include: { order: true },
  });

  if (!payment) {
    console.warn(`[paystack webhook] no payment for reference ${reference}`);
    return;
  }

  switch (event.event) {
    case "charge.success": {
      // Guard against a tampered or mismatched amount before crediting.
      if (event.data.amount !== payment.order.total) {
        await logOrderEvent({
          orderId: payment.orderId,
          type: "payment.mismatch",
          message: `Paystack reported ${formatMoney(event.data.amount)} but the order total is ${formatMoney(payment.order.total)}. Held for review.`,
          meta: { reference, reported: event.data.amount, expected: payment.order.total },
        });
        await postAlert(
          `:warning: Payment amount mismatch on ${payment.order.orderNumber}. Paystack says ${formatMoney(event.data.amount)}, order total is ${formatMoney(payment.order.total)}.`,
        );
        return;
      }

      const { alreadyPaid } = await markOrderPaid({
        orderId: payment.orderId,
        reference,
        amount: event.data.amount,
        channel: event.data.channel,
        providerTransactionId: String(event.data.id ?? ""),
        cardLast4: event.data.authorization?.last4 ?? null,
        cardBrand: event.data.authorization?.brand ?? null,
        authCode: event.data.authorization?.authorization_code ?? null,
        mobileMoneyNumber: event.data.authorization?.mobile_money_number ?? null,
        raw: event.data as never,
      });

      if (!alreadyPaid) {
        await postAlert(
          `:tada: New order ${payment.order.orderNumber} - ${formatMoney(event.data.amount)} via ${describeChannel(event.data.channel)}.`,
        );
      }
      break;
    }

    case "charge.failed": {
      await markPaymentFailed({
        orderId: payment.orderId,
        reference,
        reason: event.data.gateway_response ?? "Payment failed at Paystack.",
      });
      break;
    }

    case "refund.processed":
    case "refund.failed": {
      await logOrderEvent({
        orderId: payment.orderId,
        type: `paystack.${event.event}`,
        message: `Paystack reported ${event.event.replace(".", " ")}.`,
        meta: { reference },
      });
      break;
    }

    default:
      // Paystack sends many event types; the rest are not actionable here.
      break;
  }
}
