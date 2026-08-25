import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { verifyTransaction, describeChannel } from "@/lib/paystack";
import { markOrderPaid, markPaymentFailed } from "@/lib/orders";
import { formatMoney } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { Card, LinkButton, Divider } from "@/components/ui";

export const metadata: Metadata = { title: "Order confirmation" };
export const dynamic = "force-dynamic";

/**
 * Paystack redirects here after payment.
 *
 * The webhook is the authoritative path, but the shopper arrives here first
 * and expects an answer, so this verifies directly too. Both routes funnel
 * into the same idempotent `markOrderPaid`, so whichever lands first wins and
 * the second is a no-op.
 */
export default async function ConfirmPage({ searchParams }: PageProps<"/checkout/confirm">) {
  const params = await searchParams;
  const raw = params.reference ?? params.trxref;
  const reference = Array.isArray(raw) ? raw[0] : raw;

  const settings = await getSettings();

  if (!reference) {
    return (
      <Shell
        icon={<XCircle className="h-10 w-10 text-danger" aria-hidden />}
        title="No payment reference"
        body="We could not tell which order this was. If you were charged, contact us and we will sort it out immediately."
      />
    );
  }

  const payment = await db.payment.findUnique({
    where: { reference },
    include: { order: { include: { items: true, shippingAddress: true } } },
  });

  if (!payment) {
    return (
      <Shell
        icon={<XCircle className="h-10 w-10 text-danger" aria-hidden />}
        title="We do not recognise that payment"
        body={`Reference ${reference} is not on our records. Contact ${settings.supportEmail} and we will look into it.`}
      />
    );
  }

  const order = payment.order;

  // Verify unless the webhook has already settled it.
  if (payment.status !== "SUCCESS") {
    try {
      const transaction = await verifyTransaction(reference);

      if (transaction.status === "success" && transaction.amount === order.total) {
        await markOrderPaid({
          orderId: order.id,
          reference,
          amount: transaction.amount,
          channel: transaction.channel,
          providerTransactionId: String(transaction.id),
          cardLast4: transaction.authorization?.last4 ?? null,
          cardBrand: transaction.authorization?.brand ?? null,
          authCode: transaction.authorization?.authorization_code ?? null,
          mobileMoneyNumber: transaction.authorization?.mobile_money_number ?? null,
          raw: transaction as never,
        });
      } else if (transaction.status === "failed" || transaction.status === "abandoned") {
        await markPaymentFailed({
          orderId: order.id,
          reference,
          reason: transaction.gateway_response ?? "Payment did not complete.",
        });
      }
    } catch (error) {
      console.error("[checkout confirm] verify failed", error);
    }
  }

  // Re-read so the page reflects whatever just happened.
  const fresh = await db.order.findUnique({
    where: { id: order.id },
    include: { items: true, shippingAddress: true, payments: { orderBy: { createdAt: "desc" } } },
  });
  if (!fresh) return null;

  const latestPayment = fresh.payments[0];

  if (fresh.paymentStatus === "SUCCESS") {
    return (
      <div className="lx-container max-w-2xl py-16">
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden />
          <h1 className="mt-4 text-3xl">Thank you</h1>
          <p className="mt-2 text-[var(--text-secondary)]">
            Order <span className="font-medium text-[var(--text-primary)]">{fresh.orderNumber}</span> is
            confirmed. A receipt is on its way to {fresh.email}.
          </p>
        </div>

        <Card className="mt-10 p-6">
          <h2 className="lx-eyebrow mb-4">What you ordered</h2>
          <ul className="divide-y divide-[var(--border-subtle)]">
            {fresh.items.map((item) => (
              <li key={item.id} className="flex items-center gap-4 py-3">
                <span className="lx-media h-16 w-14 shrink-0 rounded-[--radius-card]">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt="" />
                  ) : null}
                </span>
                <span className="flex-1">
                  <span className="block text-sm">{item.productTitle}</span>
                  {item.variantTitle !== "Default" ? (
                    <span className="block text-xs text-[var(--text-secondary)]">
                      {item.variantTitle}
                    </span>
                  ) : null}
                  <span className="block text-xs text-[var(--text-muted)]">
                    Qty {item.quantity}
                  </span>
                </span>
                <span className="text-sm tabular-nums">{formatMoney(item.total)}</span>
              </li>
            ))}
          </ul>

          <Divider className="my-4" />

          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--text-secondary)]">Subtotal</dt>
              <dd className="tabular-nums">{formatMoney(fresh.subtotal)}</dd>
            </div>
            {fresh.discountTotal > 0 ? (
              <div className="flex justify-between text-success">
                <dt>Discount</dt>
                <dd className="tabular-nums">-{formatMoney(fresh.discountTotal)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-[var(--text-secondary)]">Delivery</dt>
              <dd className="tabular-nums">
                {fresh.shippingTotal === 0 ? "Free" : formatMoney(fresh.shippingTotal)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-[var(--border-subtle)] pt-2 text-base">
              <dt>Paid</dt>
              <dd className="font-display text-xl tabular-nums">{formatMoney(fresh.total)}</dd>
            </div>
          </dl>

          {latestPayment?.channel ? (
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              Paid by {describeChannel(latestPayment.channel)}
              {latestPayment.cardLast4 ? ` ending ${latestPayment.cardLast4}` : ""}.
            </p>
          ) : null}

          {fresh.shippingAddress ? (
            <div className="mt-6 border-t border-[var(--border-subtle)] pt-4">
              <h2 className="lx-eyebrow mb-2">Delivering to</h2>
              <address className="text-sm not-italic text-[var(--text-secondary)]">
                {fresh.shippingAddress.firstName} {fresh.shippingAddress.lastName}
                <br />
                {fresh.shippingAddress.line1}
                {fresh.shippingAddress.line2 ? `, ${fresh.shippingAddress.line2}` : ""}
                <br />
                {fresh.shippingAddress.city}, {fresh.shippingAddress.region}
                <br />
                {fresh.shippingAddress.phone}
              </address>
            </div>
          ) : null}
        </Card>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <LinkButton href="/shop" variant="secondary">
            Keep shopping
          </LinkButton>
          <LinkButton href={`/orders/track?order=${fresh.orderNumber}`}>Track this order</LinkButton>
        </div>
      </div>
    );
  }

  if (fresh.paymentStatus === "FAILED") {
    return (
      <Shell
        icon={<XCircle className="h-10 w-10 text-danger" aria-hidden />}
        title="That payment did not go through"
        body="Nothing has been charged. Your bag is still saved, so you can try again with another method."
        action={<LinkButton href="/checkout">Try again</LinkButton>}
      />
    );
  }

  return (
    <Shell
      icon={<Clock className="h-10 w-10 text-warning" aria-hidden />}
      title="Payment is still processing"
      body={`We are waiting on confirmation for ${fresh.orderNumber}. Refresh in a moment — we will email you as soon as it clears.`}
      action={<LinkButton href={`/checkout/confirm?reference=${reference}`}>Refresh</LinkButton>}
    />
  );
}

function Shell({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="lx-container max-w-lg py-24 text-center">
      <div className="flex justify-center">{icon}</div>
      <h1 className="mt-4 text-3xl">{title}</h1>
      <p className="mt-2 text-[var(--text-secondary)]">{body}</p>
      <div className="mt-6 flex justify-center gap-3">
        {action}
        <Link href="/contact" className="self-center text-sm underline-offset-4 hover:underline">
          Contact us
        </Link>
      </div>
    </div>
  );
}
