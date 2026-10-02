import { cache } from "react";
import { db } from "./db";
import { formatMoney } from "./money";

export type MessageTemplateKey =
  | "purchase_made"
  | "receipt"
  | "cart_abandoned"
  | "order_placed"
  | "order_processing"
  | "order_shipped"
  | "order_delivered"
  | "order_cancelled"
  | "order_refunded"
  | "custom_message";

export type TemplateTag = {
  tag: string;
  description: string;
};

export type MessageTemplate = {
  key: MessageTemplateKey;
  label: string;
  category: "Orders" | "Recovery" | "Concierge";
  description: string;
  smsEnabled: boolean;
  smsTemplate: string;
  emailEnabled: boolean;
  emailSubject: string;
  emailBody: string;
  tags: TemplateTag[];
};

export type MessageTemplatesConfig = Record<MessageTemplateKey, MessageTemplate>;

const COMMON_TAGS: TemplateTag[] = [
  { tag: "{store_name}", description: "Your shop name (e.g. Nobel Enclave)" },
  { tag: "{customer_name}", description: "Customer first name or 'there'" },
  { tag: "{site_url}", description: "Public storefront link" },
  { tag: "{contact_url}", description: "Contact & concierge page link" },
];

const ORDER_TAGS: TemplateTag[] = [
  ...COMMON_TAGS,
  { tag: "{order_number}", description: "Order reference number (e.g. LX-8FK2QW)" },
  { tag: "{products}", description: "Compact list of pieces for SMS (e.g. 1x Table Lamp, 2x Pillow)" },
  { tag: "{products_detailed}", description: "Itemized breakdown with quantities & prices for Email" },
  { tag: "{total}", description: "Total order amount (e.g. ₵1,200.00)" },
  { tag: "{subtotal}", description: "Subtotal amount before shipping" },
  { tag: "{shipping}", description: "Delivery fee or 'Free Delivery'" },
  { tag: "{discount_line}", description: "Discount code & amount saved" },
  { tag: "{payment_method}", description: "Payment channel (e.g. Mobile Money, Card)" },
  { tag: "{payment_reference}", description: "Gateway transaction ID" },
  { tag: "{track_url}", description: "Direct customer order tracking link" },
  { tag: "{receipt_url}", description: "Printable receipt / invoice link" },
  { tag: "{delivery_address}", description: "Customer delivery address" },
  { tag: "{delivery_estimate}", description: "Estimated delivery timeline" },
];

export const DEFAULT_MESSAGE_TEMPLATES: MessageTemplatesConfig = {
  purchase_made: {
    key: "purchase_made",
    label: "Purchase Made (Order Confirmation)",
    category: "Orders",
    description: "Sent automatically the moment payment is verified and confirmed.",
    smsEnabled: true,
    smsTemplate:
      "{store_name}: Payment received! Order #{order_number} confirmed. Items: {products}. Total: {total}. We will arrange delivery. Track: {track_url}",
    emailEnabled: true,
    emailSubject: "Order #{order_number} Confirmed — {store_name}",
    emailBody: `Hello {customer_name},

Thank you for shopping with {store_name}! Your payment has gone through and your order #{order_number} is officially confirmed.

ORDER DETAILS:
{products_detailed}

Subtotal: {subtotal}
Delivery: {shipping}
{discount_line}Total Paid: {total}

Payment Method: {payment_method}
Payment Reference: {payment_reference}
Estimated Delivery: {delivery_estimate}

Track your order anytime:
{track_url}

View or print your receipt:
{receipt_url}

Warm regards,
{store_name}`,
    tags: ORDER_TAGS,
  },

  receipt: {
    key: "receipt",
    label: "Official Receipt & Invoice",
    category: "Orders",
    description: "Official tax receipt and invoice sent upon request or after checkout.",
    smsEnabled: true,
    smsTemplate:
      "{store_name} Receipt for #{order_number}: Total {total} paid via {payment_method}. Products: {products}. View full receipt: {receipt_url}",
    emailEnabled: true,
    emailSubject: "Official Receipt for Order #{order_number} — {store_name}",
    emailBody: `Hello {customer_name},

Thank you for your purchase with {store_name}. Please find your official receipt details below.

==============================================
RECEIPT / INVOICE: #{order_number}
==============================================
Date: {order_date}
Payment Method: {payment_method}
Reference: {payment_reference}

ITEMS PURCHASED:
{products_detailed}

Subtotal: {subtotal}
Delivery: {shipping}
{discount_line}TOTAL AMOUNT PAID: {total}

Delivery Address:
{delivery_address}

You can print or download your full branded PDF receipt anytime:
{receipt_url}

Thank you for choosing {store_name}. For any assistance, reach us at {contact_url}.

Warm regards,
{store_name} Accounts Team`,
    tags: [
      ...ORDER_TAGS,
      { tag: "{order_date}", description: "Date and time the order was placed" },
    ],
  },

  cart_abandoned: {
    key: "cart_abandoned",
    label: "Cart Left Unattended / Abandoned Checkout",
    category: "Recovery",
    description: "Sent to shoppers who left curated items in their bag without finishing checkout.",
    smsEnabled: true,
    smsTemplate:
      "{store_name}: You left items in your bag! {products} ({total}). Complete your order with 5% off code BAG5: {checkout_url}",
    emailEnabled: true,
    emailSubject: "Did you leave something behind at {store_name}?",
    emailBody: `Hello {customer_name},

We noticed you left some lovely pieces in your shopping bag at {store_name}:

{products_detailed}

Total Value: {total}

Your pieces are safely reserved. To make them yours today, enjoy a private 5% concierge courtesy discount with code: BAG5 at checkout.

Complete your purchase here:
{checkout_url}

Need help with fabric selections, custom sizing, or delivery scheduling? Reply directly to this message or reach our concierge team at {contact_url}.

Warmly,
{store_name} Concierge`,
    tags: [
      ...COMMON_TAGS,
      { tag: "{products}", description: "Pieces in the abandoned bag" },
      { tag: "{products_detailed}", description: "Detailed list of items and prices" },
      { tag: "{total}", description: "Total value of items left in bag" },
      { tag: "{checkout_url}", description: "Direct checkout recovery link" },
    ],
  },

  order_placed: {
    key: "order_placed",
    label: "Order Placed / Reserved (Unpaid)",
    category: "Orders",
    description: "Sent when an order is created or reserved awaiting payment.",
    smsEnabled: true,
    smsTemplate:
      "{store_name}: Order #{order_number} is reserved for you. Items: {products}. Total: {total}. We confirm once payment arrives: {track_url}",
    emailEnabled: true,
    emailSubject: "Order #{order_number} Reserved — {store_name}",
    emailBody: `Hello {customer_name},

We have put order #{order_number} aside for you.

RESERVED PIECES:
{products_detailed}

Total: {total}

Your order is confirmed the moment payment is received. 

Track or complete payment anytime:
{track_url}

Warm regards,
{store_name}`,
    tags: ORDER_TAGS,
  },

  order_processing: {
    key: "order_processing",
    label: "Order Processing / Packing",
    category: "Orders",
    description: "Sent when our fulfillment team begins preparing and packaging the pieces.",
    smsEnabled: true,
    smsTemplate:
      "{store_name}: Order #{order_number} ({products}) is being carefully prepared. We will text you the moment it leaves us.",
    emailEnabled: true,
    emailSubject: "Order #{order_number} is Being Prepared — {store_name}",
    emailBody: `Hello {customer_name},

Order #{order_number} is now being carefully prepared and packaged by our team.

PIECES IN PREPARATION:
{products_detailed}

We will notify you immediately once your parcel is on its way to your destination.

Track status: {track_url}

Warm regards,
{store_name}`,
    tags: ORDER_TAGS,
  },

  order_shipped: {
    key: "order_shipped",
    label: "Order Shipped / Dispatched",
    category: "Orders",
    description: "Sent when the parcel leaves the warehouse with the rider or courier.",
    smsEnabled: true,
    smsTemplate:
      "{store_name}: Order #{order_number} is on the way! {carrier_info}. Pieces: {products}. Track: {track_url}",
    emailEnabled: true,
    emailSubject: "Your Order #{order_number} is On The Way — {store_name}",
    emailBody: `Hello {customer_name},

Great news — order #{order_number} has left our facility and is on its way to you!

DISPATCHED PIECES:
{products_detailed}

Carrier / Consignment: {carrier_info}
Estimated Arrival: {delivery_estimate}

Please ensure someone is available at your delivery location to receive the parcel.

Track your delivery in real-time:
{track_url}

Warm regards,
{store_name}`,
    tags: [
      ...ORDER_TAGS,
      { tag: "{carrier_info}", description: "Courier company and tracking number" },
    ],
  },

  order_delivered: {
    key: "order_delivered",
    label: "Order Delivered",
    category: "Orders",
    description: "Sent when the rider marks the order delivered at the customer address.",
    smsEnabled: true,
    smsTemplate:
      "{store_name}: Order #{order_number} has been delivered. We hope you love your pieces ({products})! Contact us straight away if anything is needed: {contact_url}",
    emailEnabled: true,
    emailSubject: "Order #{order_number} Delivered — {store_name}",
    emailBody: `Hello {customer_name},

Your order #{order_number} has been delivered!

DELIVERED PIECES:
{products_detailed}

Please inspect your pieces. If anything arrived damaged or if you have any questions, reach out to us straight away at {contact_url}.

Thank you for bringing {store_name} into your home.

Warm regards,
{store_name}`,
    tags: ORDER_TAGS,
  },

  order_cancelled: {
    key: "order_cancelled",
    label: "Order Cancelled",
    category: "Orders",
    description: "Sent if an order has been cancelled by customer or staff.",
    smsEnabled: true,
    smsTemplate:
      "{store_name}: Order #{order_number} ({products}) has been cancelled.{reason_text} Contact us if unexpected: {contact_url}",
    emailEnabled: true,
    emailSubject: "Order #{order_number} Cancelled — {store_name}",
    emailBody: `Hello {customer_name},

Order #{order_number} has been cancelled.

CANCELLED ITEMS:
{products_detailed}
{reason_line}
If this was unexpected or if you would like to place a new order, please get in touch with our concierge team at {contact_url}.

Warm regards,
{store_name}`,
    tags: [
      ...ORDER_TAGS,
      { tag: "{reason_text}", description: "Reason for cancellation" },
      { tag: "{reason_line}", description: "Formatted reason block for email" },
    ],
  },

  order_refunded: {
    key: "order_refunded",
    label: "Order Refunded",
    category: "Orders",
    description: "Sent when a refund has been issued to the customer.",
    smsEnabled: true,
    smsTemplate:
      "{store_name}: A refund of {refund_amount} has been processed for order #{order_number}. It can take 2-5 business days to reach your account.",
    emailEnabled: true,
    emailSubject: "Refund Processed for Order #{order_number} — {store_name}",
    emailBody: `Hello {customer_name},

We have processed a refund of {refund_amount} against your order #{order_number}.

Depending on your bank, card issuer, or mobile money provider, the credit typically appears in your account within 2 to 5 business days.

If you have any questions regarding this transaction, contact us at {contact_url}.

Warm regards,
{store_name} Accounts`,
    tags: [
      ...ORDER_TAGS,
      { tag: "{refund_amount}", description: "Amount refunded in currency (e.g. ₵500.00)" },
    ],
  },

  custom_message: {
    key: "custom_message",
    label: "Direct Custom Message",
    category: "Concierge",
    description: "Default format when staff sends a custom message or update to a customer.",
    smsEnabled: true,
    smsTemplate: "{store_name}: {custom_text} (Ref: #{order_number})",
    emailEnabled: true,
    emailSubject: "Update regarding your order #{order_number} — {store_name}",
    emailBody: `Hello {customer_name},

{custom_text}

Order Reference: #{order_number}

If you have any questions or require further assistance, simply reply directly to this email or reach us at {contact_url}.

Warm regards,
{store_name} Concierge Team`,
    tags: [
      ...ORDER_TAGS,
      { tag: "{custom_text}", description: "Custom message entered by staff" },
    ],
  },
};

const SETTINGS_KEY = "message_templates";
let cachedTemplates: { data: MessageTemplatesConfig; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60 * 1000;

export function invalidateMessageTemplatesCache(): void {
  cachedTemplates = null;
}

export async function fetchMessageTemplates(): Promise<MessageTemplatesConfig> {
  const now = Date.now();
  if (cachedTemplates && cachedTemplates.expiresAt > now) {
    return cachedTemplates.data;
  }

  try {
    const row = await db.setting.findUnique({ where: { key: SETTINGS_KEY } });
    if (!row || !row.value || typeof row.value !== "object") {
      cachedTemplates = { data: DEFAULT_MESSAGE_TEMPLATES, expiresAt: now + CACHE_TTL_MS };
      return DEFAULT_MESSAGE_TEMPLATES;
    }

    const stored = row.value as Record<string, Partial<MessageTemplate>>;
    const merged: MessageTemplatesConfig = { ...DEFAULT_MESSAGE_TEMPLATES };

    for (const key of Object.keys(DEFAULT_MESSAGE_TEMPLATES) as MessageTemplateKey[]) {
      if (stored[key]) {
        merged[key] = {
          ...DEFAULT_MESSAGE_TEMPLATES[key],
          ...stored[key],
          tags: DEFAULT_MESSAGE_TEMPLATES[key].tags,
        };
      }
    }

    cachedTemplates = { data: merged, expiresAt: now + CACHE_TTL_MS };
    return merged;
  } catch (error) {
    console.error("[message-templates] Failed to read templates from db:", error);
    return DEFAULT_MESSAGE_TEMPLATES;
  }
}

export const getMessageTemplates = cache(fetchMessageTemplates);

export async function updateMessageTemplates(
  patch: Partial<Record<MessageTemplateKey, Partial<MessageTemplate>>>,
): Promise<MessageTemplatesConfig> {
  invalidateMessageTemplatesCache();
  const current = await fetchMessageTemplates();

  const next: MessageTemplatesConfig = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    const templateKey = key as MessageTemplateKey;
    if (next[templateKey] && value) {
      next[templateKey] = {
        ...next[templateKey],
        ...value,
        tags: DEFAULT_MESSAGE_TEMPLATES[templateKey].tags,
      };
    }
  }

  await db.setting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: next },
    update: { value: next },
  });

  cachedTemplates = { data: next, expiresAt: Date.now() + CACHE_TTL_MS };
  return next;
}

export async function resetMessageTemplate(key: MessageTemplateKey): Promise<MessageTemplatesConfig> {
  return updateMessageTemplates({ [key]: DEFAULT_MESSAGE_TEMPLATES[key] });
}

export function renderTemplateString(template: string, vars: Record<string, string | number | null | undefined>): string {
  let result = template;
  for (const [key, val] of Object.entries(vars)) {
    const regex = new RegExp(key.replace(/[{}]/g, "\\$&"), "g");
    result = result.replace(regex, val !== null && val !== undefined ? String(val) : "");
  }
  return result;
}

export function formatProductsForSms(
  items: Array<{ productTitle: string; variantTitle?: string | null; quantity: number }>,
  maxChars = 90,
): string {
  if (!items || items.length === 0) return "your items";

  const parts = items.map((item) => {
    const name = item.productTitle.trim();
    return `${item.quantity}x ${name}`;
  });

  const full = parts.join(", ");
  if (full.length <= maxChars) return full;

  let truncated = "";
  for (let i = 0; i < parts.length; i++) {
    const candidate = truncated ? `${truncated}, ${parts[i]}` : parts[i];
    const remainingCount = items.length - (i + 1);
    const suffix = remainingCount > 0 ? ` (+${remainingCount} more)` : "";
    if (candidate.length + suffix.length > maxChars) {
      return truncated ? `${truncated}${suffix}` : `${parts[0].slice(0, maxChars - 12)}...`;
    }
    truncated = candidate;
  }
  return truncated || "your items";
}

export function formatProductsForEmail(
  items: Array<{
    productTitle: string;
    variantTitle?: string | null;
    quantity: number;
    unitPrice: number;
    total: number;
  }>,
  currency = "GHS",
): string {
  if (!items || items.length === 0) return "• No items specified";

  return items
    .map((item) => {
      const variant = item.variantTitle && item.variantTitle !== "Default" ? ` (${item.variantTitle})` : "";
      const price = formatMoney(item.unitPrice, currency);
      const total = formatMoney(item.total, currency);
      return `• ${item.productTitle}${variant} × ${item.quantity} — ${total} (${price} each)`;
    })
    .join("\n");
}
