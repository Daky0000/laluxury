import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  ApiAuthError,
  apiOptionsResponse,
  requireBearerPermission,
  requireBearerUser,
  withApiAuth,
} from "@/lib/auth/bearer";
import { can, isStaff } from "@/lib/auth/rbac";
import { cancelOrder, logOrderEvent, markOrderPaid, orderInclude, updateOrderStatus } from "@/lib/orders";
import type { OrderStatus } from "@/generated/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = apiOptionsResponse;

/**
 * GET /api/app/orders/[id]
 * Fetch detailed order information including items, images, customer, delivery, payments and timeline.
 */
export const GET = withApiAuth(async (
  _request: Request,
  context?: { params: Promise<{ id: string }> },
) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Order ID is required." }, { status: 400 });
  }

  const order = await db.order.findFirst({
    where: {
      OR: [{ id }, { orderNumber: id.toUpperCase() }],
    },
    include: orderInclude,
  });

  // Staff with order access see any order; customers only their own. A
  // missing and a foreign order answer the same, so IDs cannot be probed.
  const viewer = await requireBearerUser();
  const allowed =
    order && ((isStaff(viewer.role) && can(viewer.role, "orders:read")) || order.userId === viewer.id);
  if (!order || !allowed) {
    return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      paymentMethod: order.paymentMethod,
      currency: order.currency,
      email: order.email,
      phone: order.phone,
      subtotal: order.subtotal,
      discountTotal: order.discountTotal,
      shippingTotal: order.shippingTotal,
      total: order.total,
      depositAmount: order.depositAmount,
      balancePaidAt: order.balancePaidAt?.toISOString() || null,
      hasPreorderItems: order.hasPreorderItems,
      preorderStage: order.preorderStage,
      customerNote: order.customerNote,
      staffNote: order.staffNote,
      trackingNumber: order.trackingNumber,
      trackingCompany: order.trackingCompany,
      placedAt: order.placedAt.toISOString(),
      paidAt: order.paidAt?.toISOString() || null,
      shippedAt: order.shippedAt?.toISOString() || null,
      deliveredAt: order.deliveredAt?.toISOString() || null,
      cancelledAt: order.cancelledAt?.toISOString() || null,
      shippingAddress: order.shippingAddress,
      billingAddress: order.billingAddress,
      shippingRate: order.shippingRate,
      items: order.items.map((item) => ({
        id: item.id,
        variantId: item.variantId,
        productId: item.productId,
        productTitle: item.productTitle,
        variantTitle: item.variantTitle,
        sku: item.sku,
        imageUrl: item.imageUrl,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAllocated: item.discountAllocated,
        total: item.total,
        quantityFulfilled: item.quantityFulfilled,
      })),
      payments: order.payments.map((p) => ({
        id: p.id,
        reference: p.reference,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        channel: p.channel,
        mobileMoneyNumber: p.mobileMoneyNumber,
        cardBrand: p.cardBrand,
        cardLast4: p.cardLast4,
        paidAt: p.paidAt?.toISOString() || null,
      })),
      events: order.events.map((e) => ({
        id: e.id,
        type: e.type,
        message: e.message,
        createdAt: e.createdAt.toISOString(),
      })),
    },
  });
});

/**
 * PATCH /api/app/orders/[id]
 * Updates order status, fulfillment status, staff notes, and delivery tracking.
 */
export const PATCH = withApiAuth(async (
  request: Request,
  context?: { params: Promise<{ id: string }> },
) => {
  const actor = await requireBearerPermission("orders:write");
  const params = await context?.params;
  const id = params?.id;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Order ID is required." }, { status: 400 });
  }

  const order = await db.order.findFirst({
    where: {
      OR: [{ id }, { orderNumber: id.toUpperCase() }],
    },
  });

  if (!order) {
    return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const updateData: Record<string, unknown> = {};
  const events: string[] = [];
  const trackingNumber =
    body.trackingNumber !== undefined ? (body.trackingNumber ? String(body.trackingNumber).trim() : null) : undefined;
  const trackingCompany =
    body.trackingCompany !== undefined ? (body.trackingCompany ? String(body.trackingCompany).trim() : null) : undefined;

  // Status changes go through the shared services so transitions, stock and
  // customer notices behave exactly as they do from the web admin.
  if (body.status && body.status !== order.status) {
    const status = String(body.status) as OrderStatus;
    try {
      if (status === "PAID") {
        // Staff recording an offline payment (cash, manual transfer).
        if (order.status !== "PENDING") throw new Error(`Cannot move an order from ${order.status} to PAID.`);
        await markOrderPaid({
          orderId: order.id,
          reference: `MANUAL-${order.orderNumber}-${Date.now()}`,
          amount: order.total,
          channel: "manual",
          raw: { recordedBy: actor.id },
        });
      } else if (status === "CANCELLED") {
        await cancelOrder(order.id, body.reason ? String(body.reason) : "Cancelled by staff.", actor.id);
      } else if (status === "REFUNDED") {
        throw new Error("Use the refund flow to refund an order.");
      } else {
        await updateOrderStatus({ orderId: order.id, status, actorId: actor.id, trackingNumber, trackingCompany });
      }
    } catch (error) {
      if (error instanceof ApiAuthError) throw error;
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Could not update status." },
        { status: 400 },
      );
    }
  }

  if (body.fulfillmentStatus && body.fulfillmentStatus !== order.fulfillmentStatus) {
    const validFulfillment = ["UNFULFILLED", "PARTIALLY_FULFILLED", "FULFILLED"];
    if (validFulfillment.includes(body.fulfillmentStatus)) {
      updateData.fulfillmentStatus = body.fulfillmentStatus;
      events.push(`Fulfillment updated to ${body.fulfillmentStatus}`);
    }
  }

  if (trackingNumber !== undefined) updateData.trackingNumber = trackingNumber;
  if (trackingCompany !== undefined) updateData.trackingCompany = trackingCompany;
  if (body.staffNote !== undefined) {
    updateData.staffNote = body.staffNote ? String(body.staffNote).trim() : null;
  }
  if (body.customerNote !== undefined) {
    updateData.customerNote = body.customerNote ? String(body.customerNote).trim() : null;
  }

  if (Object.keys(updateData).length > 0) {
    await db.order.update({ where: { id: order.id }, data: updateData });
  }
  if (events.length > 0) {
    await logOrderEvent({
      orderId: order.id,
      type: "order.updated",
      message: events.join("; "),
      actorId: actor.id,
    }).catch(() => {});
  }

  const updated = await db.order.findUniqueOrThrow({ where: { id: order.id } });

  return NextResponse.json({
    ok: true,
    message: "Order updated successfully.",
    order: {
      id: updated.id,
      orderNumber: updated.orderNumber,
      status: updated.status,
      paymentStatus: updated.paymentStatus,
      fulfillmentStatus: updated.fulfillmentStatus,
      trackingNumber: updated.trackingNumber,
      trackingCompany: updated.trackingCompany,
      staffNote: updated.staffNote,
      customerNote: updated.customerNote,
    },
  });
});
