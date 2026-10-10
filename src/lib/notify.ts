import { cartRecoveryBlockReason } from "./notification-policy";
import { orderPath } from "@/lib/order-access";
import { randomUUID } from "node:crypto";
import { enqueueNotification } from "./notifications/queue";
import { db } from "./db";
import { env } from "./env";
import { formatMoney } from "./money";
import { formatPhone, normalisePhone } from "./phone";
import { formatDate } from "./utils";
import { getSettings } from "./settings";
import { sendEmail } from "./email";
import { sendSms } from "./sms";
import {
  getMessageTemplates,
  renderTemplateString,
  formatProductsForSms,
  formatProductsForEmail,
  type MessageTemplate,
} from "./message-templates";
import type { Prisma } from "@/generated/prisma";

/**
 * What the shop tells a customer once an order exists or an action occurs.
 *
 * Everything goes out by text first (Vynfy) and email (SMTP).
 * Templates are fully configurable by the store owner under /admin/settings/messages.
 * Every send is best-effort: failures never crash an order flow, but are recorded
 * in the order timeline.
 */

const noticeSelect = {
  id: true,
  userId: true,
  refundedTotal: true,
  orderNumber: true,
  email: true,
  phone: true,
  subtotal: true,
  shippingTotal: true,
  discountTotal: true,
  total: true,
  currency: true,
  createdAt: true,
  trackingNumber: true,
  trackingCompany: true,
  paymentMethod: true,
  shippingAddress: {
    select: {
      firstName: true,
      lastName: true,
      phone: true,
      line1: true,
      line2: true,
      city: true,
      region: true,
    },
  },
  shippingRate: {
    select: { name: true, estimatedDaysMin: true, estimatedDaysMax: true },
  },
  items: {
    select: {
      productTitle: true,
      variantTitle: true,
      quantity: true,
      unitPrice: true,
      total: true,
    },
  },
  payments: {
    select: {
      channel: true,
      reference: true,
      status: true,
      mobileMoneyNumber: true,
      cardBrand: true,
      cardLast4: true,
    },
    take: 1,
    orderBy: { createdAt: "desc" },
  },
} satisfies Prisma.OrderSelect;

type NoticeOrder = Prisma.OrderGetPayload<{ select: typeof noticeSelect }>;

export type OrderNotice =
  | { kind: "order.placed" }
  | { kind: "payment.received"; reference?: string | null; channel?: string | null }
  | { kind: "order.receipt" }
  | { kind: "payment.failed"; reason?: string | null; reference?: string }
  | { kind: "order.processing" }
  | { kind: "order.fulfilled" }
  | { kind: "order.shipped" }
  | { kind: "order.delivered" }
  | { kind: "order.cancelled"; reason?: string | null }
  | { kind: "order.refunded"; amount: number }
  | { kind: "custom.message"; customText: string };

type WrittenNotice = {
  sms: string;
  smsEnabled: boolean;
  subject: string;
  body: string;
  emailEnabled: boolean;
};

function trackingUrl(order: NoticeOrder): string {
  return `${env.siteUrl()}${orderPath(order.orderNumber, "track")}`;
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

function describePayment(order: NoticeOrder): string {
  const p = order.payments[0];
  if (!p) return order.paymentMethod || "Paystack";
  if (p.channel === "mobile_money") {
    return p.mobileMoneyNumber ? `Mobile Money (${p.mobileMoneyNumber})` : "Mobile Money";
  }
  if (p.channel === "card") {
    return p.cardBrand && p.cardLast4 ? `${p.cardBrand.toUpperCase()} •••• ${p.cardLast4}` : "Card Payment";
  }
  return p.channel || order.paymentMethod || "Online Payment";
}

async function composeOrderNotice(
  order: NoticeOrder,
  notice: OrderNotice,
  storeName: string,
): Promise<WrittenNotice> {
  const templates = await getMessageTemplates();

  const total = formatMoney(order.total, order.currency);
  const subtotal = formatMoney(order.subtotal, order.currency);
  const shipping = order.shippingTotal === 0 ? "Free Delivery" : formatMoney(order.shippingTotal, order.currency);
  const discountLine =
    order.discountTotal > 0
      ? `Discount Savings: -${formatMoney(order.discountTotal, order.currency)}\n`
      : "";
  const customerName = order.shippingAddress?.firstName?.trim() || "there";
  const track = trackingUrl(order);
  const estimate = deliveryEstimate(order) || "Check your order page for delivery updates";
  const carrier = tracking(order) || "Check your order page for carrier updates";
  const receiptLink = `${env.siteUrl()}${orderPath(order.orderNumber, "invoice")}`;
  const addressText = order.shippingAddress
    ? `${order.shippingAddress.line1}${order.shippingAddress.line2 ? ` ${order.shippingAddress.line2}` : ""}, ${order.shippingAddress.city}, ${order.shippingAddress.region}`
    : "Delivery Address on File";
  const paymentMethod = describePayment(order);
  const paymentReference =
    notice.kind === "payment.received" && notice.reference
      ? notice.reference
      : order.payments[0]?.reference || "Confirmed";

  const productsSms = formatProductsForSms(order.items);
  const productsDetailed = formatProductsForEmail(order.items, order.currency);
  const orderDate = formatDate(order.createdAt, true);

  // Common substitutions dictionary
  const baseVars: Record<string, string> = {
    "{store_name}": storeName,
    "{customer_name}": customerName,
    "{order_number}": order.orderNumber,
    "{order_date}": orderDate,
    "{products}": productsSms,
    "{products_detailed}": productsDetailed,
    "{total}": total,
    "{subtotal}": subtotal,
    "{shipping}": shipping,
    "{discount_line}": discountLine,
    "{payment_method}": paymentMethod,
    "{payment_reference}": paymentReference,
    "{track_url}": track,
    "{receipt_url}": receiptLink,
    "{checkout_url}": `${env.siteUrl()}/checkout`,
    "{site_url}": env.siteUrl(),
    "{contact_url}": `${env.siteUrl()}/contact`,
    "{carrier_info}": carrier,
    "{delivery_estimate}": estimate,
    "{delivery_address}": addressText,
  };

  let template: MessageTemplate;
  const specificVars: Record<string, string> = { ...baseVars };

  switch (notice.kind) {
    case "payment.received":
      template = templates.purchase_made;
      break;

    case "order.receipt":
      template = templates.receipt;
      break;

    case "order.placed":
      template = templates.order_placed;
      specificVars["{pay_url}"] = `${env.siteUrl()}/checkout`;
      break;

    case "order.processing":
    case "order.fulfilled":
      template = templates.order_processing;
      break;

    case "order.shipped":
      template = templates.order_shipped;
      break;

    case "order.delivered":
      template = templates.order_delivered;
      break;

    case "order.cancelled":
      template = templates.order_cancelled;
      specificVars["{reason_text}"] = notice.reason ? ` Reason: ${notice.reason}.` : "";
      specificVars["{reason_line}"] = notice.reason ? `Reason: ${notice.reason}\n\n` : "";
      break;

    case "order.refunded":
      template = templates.order_refunded;
      specificVars["{refund_amount}"] = formatMoney(notice.amount, order.currency);
      break;

    case "custom.message":
      template = templates.custom_message;
      specificVars["{custom_text}"] = notice.customText;
      break;

    case "payment.failed":
      return {
        sms: `${storeName}: payment for order ${order.orderNumber} did not go through. Your bag is saved at ${env.siteUrl()}/checkout.`,
        smsEnabled: true,
        subject: `Payment unsuccessful for order ${order.orderNumber}`,
        body: `Hello ${customerName},\n\nThe payment for order ${order.orderNumber} did not complete. Check your order status before retrying; your payment provider may still be processing the attempt.\n\n${notice.reason ? `Gateway note: ${notice.reason}\n\n` : ""}You can finish your order with another payment method anytime: ${env.siteUrl()}/checkout.\n\nWarm regards,\n${storeName}`,
        emailEnabled: true,
      };
  }

  const sms = renderTemplateString(template.smsTemplate, specificVars);
  const subject = renderTemplateString(template.emailSubject, specificVars);
  const body = renderTemplateString(template.emailBody, specificVars);

  return {
    sms,
    smsEnabled: template.smsEnabled,
    subject,
    body,
    emailEnabled: template.emailEnabled,
  };
}

function recipientPhone(order: NoticeOrder): string | null {
  return order.phone || order.shippingAddress?.phone || null;
}

/**
 * Records the customer inbox and queues provider delivery using active templates.
 * Never throws.
 */
export async function notifyOrder(orderId: string, notice: OrderNotice, options: { force?: boolean } = {}): Promise<{ ok: boolean; outcomes: string[] }> {
  try {
    const order = await db.order.findUnique({ where: { id: orderId }, select: noticeSelect });
    if (!order) return { ok: false, outcomes: ["order not found"] };

    const settings = await getSettings();
    const written = await composeOrderNotice(order, notice, settings.storeName);
    // Owner-edited templates can drop the placeholder; the customer always
    // needs the order number to quote back to us.
    if (!written.sms.includes(order.orderNumber)) {
      written.sms = `${written.sms.trim()} Order: ${order.orderNumber}`;
    }
    const phone = recipientPhone(order);

    const title = settings.storeName + " - " + written.subject;
    const deliveries: { channel: "SMS" | "EMAIL" | "PUSH"; destination: string; subject: string; body: string }[] = [];
    if (phone && written.smsEnabled) deliveries.push({ channel: "SMS", destination: phone, subject: title, body: written.sms });
    if (order.email && written.emailEnabled) deliveries.push({ channel: "EMAIL", destination: order.email, subject: title, body: written.body });
    if (order.userId) deliveries.push({ channel: "PUSH", destination: order.userId, subject: title, body: written.sms });
    const manual = options.force || notice.kind === "custom.message" || notice.kind === "order.receipt";
    const identity = manual ? randomUUID()
      : notice.kind === "payment.received" ? notice.reference || order.payments[0]?.reference || "payment"
      : notice.kind === "payment.failed" ? notice.reference || order.payments[0]?.reference || "payment"
      : notice.kind === "order.refunded" ? String(order.refundedTotal)
      : "lifecycle";
    return await enqueueNotification({
      orderId, userId: order.userId, eventKey: notice.kind,
      dedupeKey: orderId + ":" + notice.kind + ":" + identity,
      title: written.subject, body: notice.kind === "custom.message"
        ? notice.customText
        : `Order ${order.orderNumber}: ${written.subject}. View your order for details.`,
      actionUrl: "/orders/track?order=" + encodeURIComponent(order.orderNumber), deliveries,
    });
  } catch {
    console.error("[notify] Notice could not be queued.", { kind: notice.kind, orderId });
    return { ok: false, outcomes: ["Notification could not be queued. Please retry or contact support."] };
  }
}

/** Who the shop texts about a new sale: the alert numbers, or the support phone. */
function orderAlertPhones(settings: { orderAlertPhones?: string; supportPhone: string }): string[] {
  const raw = settings.orderAlertPhones?.trim() || settings.supportPhone;
  const phones = raw
    .split(/[,;\n]/)
    .map((value) => normalisePhone(value.trim()))
    .filter((value): value is string => Boolean(value));
  return [...new Set(phones)];
}

/**
 * Texts the shop owner that an order has been paid, with its order number.
 * Goes through the same queue as customer notices, so it is retried and shows
 * in the delivery log. Never throws.
 */
export async function notifyOwnerOfPaidOrder(orderId: string, reference: string): Promise<void> {
  try {
    const order = await db.order.findUnique({ where: { id: orderId }, select: noticeSelect });
    if (!order) return;

    const settings = await getSettings();
    const phones = orderAlertPhones(settings);
    if (phones.length === 0) {
      console.warn("[notify] No order alert phone set; owner was not texted.");
      return;
    }

    const name = [order.shippingAddress?.firstName, order.shippingAddress?.lastName]
      .filter(Boolean)
      .join(" ");
    const customerPhone = recipientPhone(order);
    const sms =
      `${settings.storeName}: New paid order ${order.orderNumber}. ` +
      `${formatMoney(order.total, order.currency)} via ${describePayment(order)}. ` +
      `Items: ${formatProductsForSms(order.items)}. ` +
      `Customer: ${name || "Guest"}${customerPhone ? ` ${formatPhone(customerPhone)}` : ""}` +
      `${order.shippingAddress ? `, ${order.shippingAddress.city}` : ""}.`;
    const title = `New paid order ${order.orderNumber}`;

    await enqueueNotification({
      orderId,
      userId: null,
      eventKey: "staff.order_paid",
      dedupeKey: `${orderId}:staff.order_paid:${reference}`,
      title,
      body: sms,
      actionUrl: "/account",
      deliveries: phones.map((destination) => ({
        channel: "SMS" as const,
        destination,
        subject: title,
        body: sms,
      })),
    });
  } catch {
    console.error("[notify] Owner order alert could not be queued.", { orderId });
  }
}

/** Sends official receipt via SMS and Email */
export async function sendOrderReceipt(orderId: string): Promise<{ ok: boolean; message: string; outcomes?: string[] }> {
  try {
    const res = await notifyOrder(orderId, { kind: "order.receipt" });
    return {
      ok: res.ok,
      message: `Receipt notice: ${res.outcomes.join(", ")}.`,
      outcomes: res.outcomes,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Failed to send receipt." };
  }
}

/** Sends a custom direct message to the customer of an order */
export async function sendOrderCustomMessage(args: {
  orderId: string;
  customText: string;
  actorId?: string;
}): Promise<{ ok: boolean; message: string }> {
  try {
    const order = await db.order.findUnique({ where: { id: args.orderId }, select: noticeSelect });
    if (!order) return { ok: false, message: "Order not found." };

    const result = await notifyOrder(args.orderId, { kind: "custom.message", customText: args.customText });

    if (args.actorId) {
      await db.orderEvent.create({
        data: {
          orderId: args.orderId,
          type: "notify.custom",
          message: `Custom message attempted by staff: ${result.outcomes.join(", ")}.`,
          actorId: args.actorId,
        },
      });
    }

    return { ok: result.ok, message: `Custom message notice: ${result.outcomes.join(", ")}.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Failed to send message." };
  }
}

/**
 * Recovers an abandoned cart by sending SMS and/or Email to the reachable shopper.
 */
export async function sendCartRecoveryNotice(args: {
  cartId: string;
  sendSmsOverride?: boolean;
  sendEmailOverride?: boolean;
}): Promise<{ ok: boolean; message: string }> {
  try {
    const cart = await db.cart.findUnique({
      where: { id: args.cartId },
      include: {
        user: { select: { firstName: true, phone: true, email: true, isActive: true, acceptsMarketing: true, marketingConsentAt: true } },
        items: {
          include: {
            variant: {
              select: {
                title: true,
                price: true,
                product: { select: { title: true } },
              },
            },
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      return { ok: false, message: "Cart has no items or was not found." };
    }

    const blocked = cartRecoveryBlockReason(cart);
    if (blocked) return { ok: false, message: blocked };

    const phone = cart.user?.phone || null;
    const email = cart.user?.email || cart.email || null;

    if (!phone && !email) {
      return { ok: false, message: "No customer phone or email recorded for this cart." };
    }

    const [settings, templates] = await Promise.all([getSettings(), getMessageTemplates()]);
    const template = templates.cart_abandoned;

    const items = cart.items.map((i) => ({
      productTitle: i.variant.product.title,
      variantTitle: i.variant.title,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      total: i.unitPrice * i.quantity,
    }));

    const totalVal = cart.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    const total = formatMoney(totalVal, "GHS");
    const customerName = cart.user?.firstName?.trim() || "there";
    const checkoutUrl = `${env.siteUrl()}/checkout`;

    const vars: Record<string, string> = {
      "{store_name}": settings.storeName,
      "{customer_name}": customerName,
      "{products}": formatProductsForSms(items),
      "{products_detailed}": formatProductsForEmail(items, "GHS"),
      "{total}": total,
      "{checkout_url}": checkoutUrl,
      "{site_url}": env.siteUrl(),
      "{contact_url}": `${env.siteUrl()}/contact`,
    };

    const smsText = renderTemplateString(template.smsTemplate, vars);
    const emailSubject = renderTemplateString(template.emailSubject, vars);
    const emailBody = renderTemplateString(template.emailBody, vars);

    const outcomes: string[] = [];

    let accepted = false;
    const shouldSendSms = template.smsEnabled && args.sendSmsOverride !== false;
    const shouldSendEmail = template.emailEnabled && args.sendEmailOverride !== false;

    if (phone && shouldSendSms) {
      const res = await sendSms(phone, smsText);
      accepted ||= res.ok;
      outcomes.push(res.ok ? "texted" : `text failed (${res.code})`);
    }

    if (email && shouldSendEmail) {
      const res = await sendEmail({
        to: email,
        subject: `${settings.storeName} — ${emailSubject}`,
        text: `${emailBody}\n\n— ${settings.storeName}`,
      });
      accepted ||= res.ok && !res.skipped;
      outcomes.push(res.skipped ? "email not configured" : res.ok ? "emailed" : "email failed");
    }

    if (accepted) {
      await db.cart.update({
        where: { id: cart.id },
        data: { recoveryEmailSentAt: new Date() },
      });
    }

    return {
      ok: accepted,
      message: `Recovery notice: ${outcomes.join(", ") || "no channels eligible"}.`,
    };
  } catch (error) {
    console.error("[notify] Cart recovery failed:", error);
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Failed to send cart recovery.",
    };
  }
}
