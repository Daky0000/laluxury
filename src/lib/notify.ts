import { db } from "./db";
import { env } from "./env";
import { formatMoney } from "./money";
import { getSettings } from "./settings";
import { sendEmail } from "./email";
import { sendSms } from "./sms";
import type { Prisma } from "@/generated/prisma";

/**
 * What the shop tells a customer once an order exists.
 *
 * Everything goes out by text first. Most Ghanaian shoppers give a phone number
 * they read all day and an email address they check on Fridays, so a delivery
 * notice that only lands in an inbox is a notice nobody acts on — and a guest
 * checkout may have no account behind it at all. The same words are emailed as
 * well when SMTP is configured, so there is a copy with the detail in it.
 *
 * Every send here is best-effort. An order that has been paid for must never
 * fail because a gateway is down, so nothing throws: the outcome is written to
 * the order timeline instead, where staff can see whether the customer was
 * actually told.
 */

/** Just enough of an order to write to somebody about it. */
const noticeSelect = {
  id: true,
  orderNumber: true,
  email: true,
  phone: true,
  total: true,
  currency: true,
  trackingNumber: true,
  trackingCompany: true,
  shippingAddress: { select: { firstName: true, phone: true } },
  shippingRate: {
    select: { name: true, estimatedDaysMin: true, estimatedDaysMax: true },
  },
} satisfies Prisma.OrderSelect;

type NoticeOrder = Prisma.OrderGetPayload<{ select: typeof noticeSelect }>;

/**
 * The moments worth a message.
 *
 * Placing an unpaid order at checkout is deliberately not one of them: the
 * shopper is still on the Paystack page at that point, and every abandoned
 * attempt would cost a text. The confirmation goes out when the money lands,
 * and it carries the payment reference.
 */
export type OrderNotice =
  | { kind: "order.placed" }
  | { kind: "payment.received"; reference?: string | null; channel?: string | null }
  | { kind: "payment.failed"; reason?: string | null }
  | { kind: "order.processing" }
  | { kind: "order.fulfilled" }
  | { kind: "order.shipped" }
  | { kind: "order.delivered" }
  | { kind: "order.cancelled"; reason?: string | null }
  | { kind: "order.refunded"; amount: number };

type Written = { sms: string; subject: string; body: string };

/** `laluxurys.com` — the bare host, because a URL in a text costs characters. */
function host(): string {
  return env.siteUrl().replace(/^https?:\/\//, "");
}

/** The tracking page wants the order number *and* the email, so both go in. */
function trackingUrl(order: NoticeOrder): string {
  return `${env.siteUrl()}/orders/track?order=${encodeURIComponent(order.orderNumber)}&email=${encodeURIComponent(order.email)}`;
}

function deliveryEstimate(order: NoticeOrder): string | null {
  const rate = order.shippingRate;
  if (!rate) return null;
  if (rate.estimatedDaysMin && rate.estimatedDaysMax) {
    return `${rate.estimatedDaysMin}–${rate.estimatedDaysMax} days`;
  }
  return rate.name || null;
}

function tracking(order: NoticeOrder): string | null {
  if (!order.trackingNumber) return null;
  return order.trackingCompany
    ? `${order.trackingCompany} ${order.trackingNumber}`
    : order.trackingNumber;
}

/**
 * The words themselves.
 *
 * A text is written to sit inside one 160-character page wherever it can: Vynfy
 * bills per page, and a notice that runs to three of them is three times the
 * price for the same sentence. The email is allowed to be longer.
 */
function compose(order: NoticeOrder, notice: OrderNotice, storeName: string): Written {
  const money = formatMoney(order.total, order.currency);
  const name = order.shippingAddress?.firstName;
  const hello = name ? `Hi ${name},` : "Hello,";
  const track = trackingUrl(order);
  const estimate = deliveryEstimate(order);
  const consignment = tracking(order);

  switch (notice.kind) {
    case "order.placed":
      return {
        sms: `${storeName}: order ${order.orderNumber} is reserved for you. Total ${money}. We will confirm it as soon as payment is in.`,
        subject: `Order ${order.orderNumber} — reserved`,
        body:
          `${hello}\n\nWe have put order ${order.orderNumber} aside for you. ` +
          `The total is ${money}, and it is confirmed once payment is in.\n\n` +
          `Track it any time: ${track}`,
      };

    case "payment.received": {
      const reference = notice.reference ? ` Ref ${notice.reference}.` : "";
      return {
        sms:
          `${storeName}: payment received for order ${order.orderNumber}. Total ${money}.${reference} ` +
          `We will call you to arrange delivery.`,
        subject: `Order ${order.orderNumber} — payment received`,
        body:
          `${hello}\n\nThank you — your payment for order ${order.orderNumber} has gone through.\n\n` +
          `Total: ${money}\n` +
          (notice.reference ? `Payment reference: ${notice.reference}\n` : "") +
          (notice.channel ? `Paid by: ${notice.channel}\n` : "") +
          (estimate ? `Estimated delivery: ${estimate}\n` : "") +
          `\nWe will call you to arrange delivery. Track it any time: ${track}`,
      };
    }

    case "payment.failed":
      return {
        sms:
          `${storeName}: that payment for order ${order.orderNumber} did not go through, and nothing was charged. ` +
          `Your bag is saved at ${host()}/checkout.`,
        subject: `Order ${order.orderNumber} — payment did not go through`,
        body:
          `${hello}\n\nThe payment for order ${order.orderNumber} did not complete, so nothing has been charged.\n\n` +
          (notice.reason ? `The bank said: ${notice.reason}\n\n` : "") +
          `Your bag is still saved — you can try again with another method at ${env.siteUrl()}/checkout.`,
      };

    case "order.processing":
      return {
        sms: `${storeName}: order ${order.orderNumber} is being prepared. We will text you the moment it leaves us.`,
        subject: `Order ${order.orderNumber} — being prepared`,
        body:
          `${hello}\n\nOrder ${order.orderNumber} is being prepared now. ` +
          `We will let you know as soon as it is on its way.\n\nTrack it any time: ${track}`,
      };

    case "order.fulfilled":
      return {
        sms: `${storeName}: order ${order.orderNumber} is packed and ready to leave us.`,
        subject: `Order ${order.orderNumber} — packed`,
        body:
          `${hello}\n\nOrder ${order.orderNumber} is packed and ready for dispatch.\n\n` +
          `Track it any time: ${track}`,
      };

    case "order.shipped":
      return {
        sms:
          `${storeName}: order ${order.orderNumber} is on its way.` +
          (consignment ? ` Tracking ${consignment}.` : "") +
          (estimate ? ` Arriving in about ${estimate}.` : ""),
        subject: `Order ${order.orderNumber} — on its way`,
        body:
          `${hello}\n\nOrder ${order.orderNumber} has left us.\n\n` +
          (consignment ? `Tracking: ${consignment}\n` : "") +
          (estimate ? `Estimated arrival: ${estimate}\n` : "") +
          `\nPlease have someone available to receive it. Track it any time: ${track}`,
      };

    case "order.delivered":
      return {
        sms:
          `${storeName}: order ${order.orderNumber} has been delivered. Thank you — ` +
          `tell us straight away if anything is not right.`,
        subject: `Order ${order.orderNumber} — delivered`,
        body:
          `${hello}\n\nOrder ${order.orderNumber} is marked delivered. Thank you for shopping with us.\n\n` +
          `Check the pieces over, and tell us straight away if anything arrived damaged — ` +
          `${env.siteUrl()}/contact.`,
      };

    case "order.cancelled":
      return {
        sms:
          `${storeName}: order ${order.orderNumber} has been cancelled.` +
          (notice.reason ? ` ${notice.reason}` : "") +
          ` Contact us if that is unexpected.`,
        subject: `Order ${order.orderNumber} — cancelled`,
        body:
          `${hello}\n\nOrder ${order.orderNumber} has been cancelled.\n\n` +
          (notice.reason ? `Reason: ${notice.reason}\n\n` : "") +
          `If that is unexpected, contact us at ${env.siteUrl()}/contact and we will sort it out.`,
      };

    case "order.refunded": {
      const amount = formatMoney(notice.amount, order.currency);
      return {
        sms:
          `${storeName}: we have refunded ${amount} against order ${order.orderNumber}. ` +
          `It can take a few days to reach your account.`,
        subject: `Order ${order.orderNumber} — refund of ${amount}`,
        body:
          `${hello}\n\nWe have refunded ${amount} against order ${order.orderNumber}.\n\n` +
          `Depending on your bank or wallet it can take a few days to appear.`,
      };
    }
  }
}

/** The best number we hold for an order: the one on it, else the delivery one. */
function recipientPhone(order: NoticeOrder): string | null {
  return order.phone || order.shippingAddress?.phone || null;
}

/**
 * Texts and emails the customer about their order, and writes what happened to
 * the order timeline.
 *
 * Never throws. Callers are payment webhooks and status changes, and neither
 * may fail because a message did not go out.
 */
export async function notifyOrder(orderId: string, notice: OrderNotice): Promise<void> {
  try {
    const order = await db.order.findUnique({ where: { id: orderId }, select: noticeSelect });
    if (!order) return;

    const settings = await getSettings();
    const written = compose(order, notice, settings.storeName);
    const phone = recipientPhone(order);

    const outcomes: string[] = [];

    if (phone) {
      const sent = await sendSms(phone, written.sms);
      outcomes.push(sent.ok ? "texted" : `text failed (${sent.code})`);
    } else {
      outcomes.push("no phone number on the order");
    }

    if (order.email) {
      const mailed = await sendEmail({
        to: order.email,
        subject: `${settings.storeName} — ${written.subject}`,
        text: `${written.body}\n\n— ${settings.storeName}`,
      });
      // Email being switched off is a setup choice, not a failure worth
      // recording against every single order.
      if (!mailed.skipped) outcomes.push(mailed.ok ? "emailed" : "email failed");
    }

    await db.orderEvent.create({
      data: {
        orderId: order.id,
        type: `notify.${notice.kind}`,
        message: `Customer notice (${notice.kind}): ${outcomes.join(", ")}.`,
      },
    });
  } catch (error) {
    // A notice that cannot even be composed must not take the order with it.
    console.error(`[notify] ${notice.kind} for order ${orderId} failed:`, error);
  }
}
