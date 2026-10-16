import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  verifyWebhookSignature,
  webhookReference,
  type PaystackWebhookEvent,
} from "@/lib/paystack";
import { markPaymentFailed, logOrderEvent } from "@/lib/orders";
import { settleProviderSuccess } from "@/lib/checkout-payment";
import { applyRefundWebhook } from "@/lib/refunds";
import { postAlert } from "@/lib/agent/slack";
import { formatMoney } from "@/lib/money";
import type { PaystackMode } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Paystack webhook.
 *
 * Paystack retries on any non-2xx, so this must be idempotent and must answer
 * quickly. Processing is idempotent. A transient processing failure returns
 * 500 so Paystack retries instead of silently losing a successful payment.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  // Signed with the live or the test key; which one says where the money is.
  const signedBy = await verifyWebhookSignature(rawBody, signature);
  if (!signedBy) {
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
    await handleEvent(event, signedBy);
  } catch (error) {
    console.error("[paystack webhook]", event.event, error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleEvent(event: PaystackWebhookEvent, signedBy: PaystackMode): Promise<void> {
  const reference = webhookReference(event);
  if (!reference) {
    console.warn(`[paystack webhook] ${event.event} without a transaction reference`);
    return;
  }

  const payment = await db.payment.findUnique({
    where: { reference },
    include: { order: { select: { id: true, orderNumber: true, currency: true } } },
  });

  if (!payment) {
    console.warn(`[paystack webhook] no payment for reference ${reference}`);
    return;
  }

  const data = event.data;

  switch (event.event) {
    case "charge.success": {
      // An event signed with the test key never moved real money, whatever
      // its body says.
      await settleProviderSuccess(
        {
          orderId: payment.orderId,
          orderNumber: payment.order.orderNumber,
          reference,
          amount: payment.amount,
          currency: payment.currency,
          domain: payment.domain,
        },
        { ...data, domain: signedBy === "test" ? "test" : (data.domain ?? "live") },
      );
      break;
    }

    case "charge.failed": {
      await markPaymentFailed({
        orderId: payment.orderId,
        reference,
        reason: data.gateway_response ?? "Payment failed at Paystack.",
      });
      break;
    }

    case "refund.pending":
    case "refund.processing":
    case "refund.processed":
    case "refund.failed": {
      await applyRefundWebhook({
        event: event.event,
        reference,
        amount: typeof data.amount === "number" ? data.amount : null,
        providerRefundId:
          data.id !== undefined && data.id !== null
            ? String(data.id)
            : typeof data.refund_reference === "string"
              ? data.refund_reference
              : null,
        reason:
          typeof data.message === "string"
            ? data.message
            : typeof data.gateway_response === "string"
              ? data.gateway_response
              : null,
      });
      break;
    }

    case "charge.dispute.create":
    case "charge.dispute.remind":
    case "charge.dispute.resolve": {
      await recordDispute(event, payment.order, reference);
      break;
    }

    default:
      // Paystack sends many event types; the rest are not actionable here.
      break;
  }
}

/**
 * A chargeback. While it is open the order is held back from fulfilment
 * (see `updateOrderStatus`), and the team is told each time Paystack writes.
 */
async function recordDispute(
  event: PaystackWebhookEvent,
  order: { id: string; orderNumber: string; currency: string },
  reference: string,
): Promise<void> {
  const data = event.data as PaystackWebhookEvent["data"] & {
    refund_amount?: number;
    resolution?: string | null;
    due_at?: string | null;
  };
  const resolved = event.event === "charge.dispute.resolve";
  const status = resolved ? `resolved:${data.resolution ?? "unknown"}` : "open";
  await db.order.update({ where: { id: order.id }, data: { disputeStatus: status } });

  const amount = typeof data.refund_amount === "number" ? ` (${formatMoney(data.refund_amount, order.currency)})` : "";
  const message = resolved
    ? `Paystack dispute resolved: ${data.resolution ?? "no resolution given"}.`
    : `The customer's bank has disputed this payment${amount}. Do not ship until it is resolved; respond in the Paystack dashboard${data.due_at ? ` by ${data.due_at}` : ""}.`;
  await logOrderEvent({ orderId: order.id, type: `payment.${event.event.replace("charge.", "")}`, message, meta: { reference } });
  await postAlert(`${resolved ? ":white_check_mark:" : ":rotating_light:"} ${order.orderNumber}: ${message}`);
}
