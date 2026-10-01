"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import {
  getMessageTemplates,
  updateMessageTemplates,
  resetMessageTemplate,
  renderTemplateString,
  type MessageTemplateKey,
  type MessageTemplate,
} from "@/lib/message-templates";
import {
  sendOrderReceipt,
  sendOrderCustomMessage,
  sendCartRecoveryNotice,
} from "@/lib/notify";
import { sendSms } from "@/lib/sms";
import { sendEmail } from "@/lib/email";
import { getSettings } from "@/lib/settings";
import { recordAudit } from "@/lib/audit";

export type AdminState = { ok: boolean; message?: string; fieldErrors?: Record<string, string> };

/**
 * Updates all or specific message templates configured by the owner.
 */
export async function updateMessageTemplatesAction(
  templatesPatch: Partial<Record<MessageTemplateKey, Partial<MessageTemplate>>>,
): Promise<AdminState> {
  const actor = await requirePermission("settings:manage");

  try {
    await updateMessageTemplates(templatesPatch);
    await recordAudit({
      actorId: actor.id,
      action: "templates.update",
      entity: "Setting",
      entityId: "message_templates",
      source: "admin",
    });

    revalidatePath("/admin/settings/messages");
    revalidatePath("/admin/settings");
    return { ok: true, message: "Message templates updated successfully." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Failed to update templates." };
  }
}


/**
 * Resets a single message template back to its default system draft.
 */
export async function resetMessageTemplateAction(key: MessageTemplateKey): Promise<AdminState> {
  const actor = await requirePermission("settings:manage");

  try {
    await resetMessageTemplate(key);
    await recordAudit({
      actorId: actor.id,
      action: "templates.reset",
      entity: "Setting",
      entityId: key,
      source: "admin",
    });

    revalidatePath("/admin/settings/messages");
    return { ok: true, message: "Template reset to system default draft." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Failed to reset template." };
  }
}

/**
 * Sends official order receipt to customer via SMS and Email.
 */
export async function sendOrderReceiptAction(orderId: string): Promise<AdminState> {
  await requirePermission("orders:write");

  const result = await sendOrderReceipt(orderId);
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  return result;
}

/**
 * Sends custom message from admin console directly to an order customer.
 */
export async function sendOrderCustomMessageAction(
  orderId: string,
  customText: string,
): Promise<AdminState> {
  const actor = await requirePermission("orders:write");
  const trimmed = customText.trim();
  if (!trimmed) {
    return { ok: false, message: "Please enter a message to send." };
  }

  const result = await sendOrderCustomMessage({
    orderId,
    customText: trimmed,
    actorId: actor.id,
  });

  revalidatePath(`/admin/orders/${orderId}`);
  return result;
}

/**
 * Sends recovery SMS / Email for an abandoned cart.
 */
export async function sendCartRecoveryAction(
  cartId: string,
  options?: { sendSms?: boolean; sendEmail?: boolean },
): Promise<AdminState> {
  await requirePermission("orders:write");

  const result = await sendCartRecoveryNotice({
    cartId,
    sendSmsOverride: options?.sendSms,
    sendEmailOverride: options?.sendEmail,
  });

  revalidatePath("/admin/carts");
  return result;
}

/**
 * Tests sending a template to the owner's phone or email.
 */
export async function testMessageTemplateAction(args: {
  key: MessageTemplateKey;
  phone?: string;
  email?: string;
}): Promise<AdminState> {
  await requirePermission("settings:manage");

  const [settings, templates] = await Promise.all([getSettings(), getMessageTemplates()]);
  const template = templates[args.key];
  if (!template) return { ok: false, message: "Template not found." };

  // Sample data for test preview
  const sampleVars: Record<string, string> = {
    "{store_name}": settings.storeName,
    "{customer_name}": "Kofi Mensah",
    "{order_number}": "LX-SAMPLE",
    "{order_date}": new Date().toLocaleDateString("en-GB"),
    "{products}": "1x Adinkra Ceramic Lamp (Ivory), 2x Linen Pillow",
    "{products_detailed}":
      "• Adinkra Ceramic Lamp (Ivory) × 1 — ₵890.00\n• Linen Pillow (Natural) × 2 — ₵300.00",
    "{total}": "₵1,190.00",
    "{subtotal}": "₵1,190.00",
    "{shipping}": "Free Delivery",
    "{discount_line}": "Courtesy Discount (5%): -₵59.50\n",
    "{payment_method}": "Mobile Money (MTN)",
    "{payment_reference}": "test_ref_9872",
    "{track_url}": "https://laluxurys.com/orders/track?order=LX-SAMPLE",
    "{receipt_url}": "https://laluxurys.com/print/orders/sample",
    "{checkout_url}": "https://laluxurys.com/checkout",
    "{site_url}": "https://laluxurys.com",
    "{contact_url}": "https://laluxurys.com/contact",
    "{carrier_info}": "Accra Dispatch Express (TRK-2026-GH)",
    "{delivery_estimate}": "1-2 business days",
    "{delivery_address}": "Plot 14, Airport Residential Area, Accra, Greater Accra",
    "{reason_text}": " Customer requested cancellation.",
    "{reason_line}": "Reason: Customer requested cancellation.\n\n",
    "{refund_amount}": "₵1,190.00",
    "{custom_text}": "We wanted to let you know your bespoke fabric sample has arrived safely at our Accra showroom.",
  };

  const outcomes: string[] = [];

  if (args.phone) {
    const sms = renderTemplateString(template.smsTemplate, sampleVars);
    const sent = await sendSms(args.phone, sms);
    outcomes.push(sent.ok ? `SMS sent to ${args.phone}` : `SMS failed (${sent.code})`);
  }

  if (args.email) {
    const subject = renderTemplateString(template.emailSubject, sampleVars);
    const body = renderTemplateString(template.emailBody, sampleVars);
    const sent = await sendEmail({
      to: args.email,
      subject: `[TEST] ${subject}`,
      text: `${body}\n\n— ${settings.storeName}`,
    });
    outcomes.push(sent.ok ? `Email sent to ${args.email}` : "Email failed (check SMTP settings)");
  }

  if (outcomes.length === 0) {
    return { ok: false, message: "Enter a phone number or email to send a test." };
  }

  return { ok: true, message: outcomes.join(" · ") };
}
