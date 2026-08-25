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
