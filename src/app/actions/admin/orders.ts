"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { updateOrderStatus, cancelOrder, recordRefund, logOrderEvent } from "@/lib/orders";
import { refundTransaction, PaystackError } from "@/lib/paystack";
import { toMinorUnits } from "@/lib/money";
import { recordAudit } from "@/lib/audit";
import type { OrderStatus } from "@/generated/prisma";
import type { AdminState } from "./products";

function revalidateOrder(orderId: string) {
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin");
}

/**
 * Attaches an order to a customer.
 *
 * Guest checkout and orders taken over WhatsApp arrive with no account behind
 * them, which leaves the customer's history — and the products they have
 * bought — incomplete. This links the two by email, creating the customer
 * record when there is not one yet, using the details already on the order.
 */
export async function assignOrderCustomerAction(
  orderId: string,
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  const actor = await requirePermission("orders:write");

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      email: true,
      phone: true,
      userId: true,
      shippingAddress: { select: { firstName: true, lastName: true } },
    },
  });
  if (!order) return { ok: false, message: "That order no longer exists." };

  // Detaching is a valid outcome: an order attributed to the wrong person.
  if (formData.get("detach") === "1") {
    await db.order.update({ where: { id: orderId }, data: { userId: null } });
    await recordAudit({
      actorId: actor.id,
      action: "order.customer.detach",
      entity: "Order",
      entityId: orderId,
    });
    revalidateOrder(orderId);
    return { ok: true, message: "Order detached from that customer." };
  }

  const email = String(formData.get("email") || order.email).trim().toLowerCase();
  if (!email.includes("@")) return { ok: false, message: "Enter a valid email address." };

  let customer = await db.user.findUnique({ where: { email }, select: { id: true, role: true } });

  if (!customer) {
    if (formData.get("create") !== "1") {
      return {
        ok: false,
        message: `Nobody has ${email}. Tick “create the customer” to make one from this order.`,
      };
    }

    customer = await db.user.create({
      data: {
        email,
        firstName: order.shippingAddress?.firstName ?? null,
        lastName: order.shippingAddress?.lastName ?? null,
        phone: order.phone,
        role: "CUSTOMER",
      },
      select: { id: true, role: true },
    });
  }

  await db.order.update({ where: { id: orderId }, data: { userId: customer.id } });

  await logOrderEvent({
    orderId,
    type: "note",
    message: `Assigned to the customer account for ${email}.`,
    actorId: actor.id,
  });

  await recordAudit({
    actorId: actor.id,
    action: "order.customer.assign",
    entity: "Order",
    entityId: orderId,
    after: { email },
  });

  revalidateOrder(orderId);
  revalidatePath(`/admin/customers/${customer.id}`);
  revalidatePath("/admin/customers");

  return { ok: true, message: `Order assigned to ${email}.` };
}

export async function updateOrderStatusAction(
  orderId: string,
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  const actor = await requirePermission("orders:write");

  const status = String(formData.get("status") || "") as OrderStatus;
  const trackingNumber = String(formData.get("trackingNumber") || "").trim();
  const trackingCompany = String(formData.get("trackingCompany") || "").trim();

  try {
    if (status === "CANCELLED") {
      await cancelOrder(
        orderId,
        String(formData.get("reason") || "Cancelled by staff."),
        actor.id,
      );
    } else {
      await updateOrderStatus({
        orderId,
        status,
        actorId: actor.id,
        trackingNumber: trackingNumber || undefined,
        trackingCompany: trackingCompany || undefined,
      });
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not update." };
  }

  revalidateOrder(orderId);
  return { ok: true, message: `Order marked ${status.toLowerCase()}.` };
}

export async function addOrderNoteAction(
  orderId: string,
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  const actor = await requirePermission("orders:write");

  const note = String(formData.get("note") || "").trim();
  if (!note) return { ok: false, message: "Write something first." };

  await db.order.update({ where: { id: orderId }, data: { staffNote: note } });
  await logOrderEvent({
    orderId,
    type: "note.added",
    message: note,
    actorId: actor.id,
  });

  revalidateOrder(orderId);
  return { ok: true, message: "Note saved." };
}

/**
 * Refunds through Paystack, then records it locally.
 *
 * The local record is written even when Paystack rejects the call, because the
 * money may have been returned by hand — but the message says plainly which
 * half succeeded so nobody assumes it went through.
 */
export async function refundOrderAction(
  orderId: string,
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  const actor = await requirePermission("orders:write");

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { payments: { where: { status: "SUCCESS" }, orderBy: { createdAt: "desc" } } },
  });
  if (!order) return { ok: false, message: "Order not found." };

  const payment = order.payments[0];
  if (!payment) return { ok: false, message: "There is no successful payment to refund." };

  const amountRaw = Number(formData.get("amount"));
  if (!Number.isFinite(amountRaw) || amountRaw <= 0) {
    return { ok: false, message: "Enter an amount to refund." };
  }

  const amount = toMinorUnits(amountRaw);
  const outstanding = order.total - order.refundedTotal;
  if (amount > outstanding) {
    return { ok: false, message: `You can refund at most ${(outstanding / 100).toFixed(2)}.` };
  }

  const reason = String(formData.get("reason") || "Refunded by staff.");
  const restock = formData.get("restock") === "on";

  let providerMessage = "";
  try {
    await refundTransaction({ reference: payment.reference, amount, reason });
    providerMessage = "Paystack refund submitted.";
  } catch (error) {
    if (error instanceof PaystackError) {
      providerMessage = `Paystack refused the refund (${error.message}). Recorded locally only — check the Paystack dashboard.`;
    } else {
      throw error;
    }
  }

  await recordRefund({ orderId, amount, reason, restock, actorId: actor.id });

  await recordAudit({
    actorId: actor.id,
    action: "order.refund",
    entity: "Order",
    entityId: orderId,
    after: { amount, reason, restock },
  });

  revalidateOrder(orderId);
  return { ok: true, message: `Refund of ${(amount / 100).toFixed(2)} recorded. ${providerMessage}` };
}
