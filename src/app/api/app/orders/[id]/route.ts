import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiOptionsResponse, withApiAuth } from "@/lib/auth/bearer";
import { isStaff } from "@/lib/auth/rbac";
import { orderInclude } from "@/lib/orders";
import { notifyOrder } from "@/lib/notify";

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

  if (!order) {
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

  // Update Order Status
  if (body.status && body.status !== order.status) {
    const validStatuses = [
      "PENDING",
      "PAID",
      "PROCESSING",
      "SHIPPED",
      "DELIVERED",
      "CANCELLED",
      "REFUNDED",
    ];
    if (validStatuses.includes(body.status)) {
      updateData.status = body.status;
      events.push(`Status changed from ${order.status} to ${body.status}`);

      if (body.status === "PAID" && !order.paidAt) {
        updateData.paidAt = new Date();
        updateData.paymentStatus = "SUCCESS";
      } else if (body.status === "SHIPPED") {
        updateData.shippedAt = new Date();
      } else if (body.status === "DELIVERED") {
        updateData.deliveredAt = new Date();
      } else if (body.status === "CANCELLED") {
        updateData.cancelledAt = new Date();
      }
    }
  }

  // Update Fulfillment Status
  if (body.fulfillmentStatus && body.fulfillmentStatus !== order.fulfillmentStatus) {
    const validFulfillment = ["UNFULFILLED", "PARTIALLY_FULFILLED", "FULFILLED"];
    if (validFulfillment.includes(body.fulfillmentStatus)) {
      updateData.fulfillmentStatus = body.fulfillmentStatus;
      events.push(`Fulfillment updated to ${body.fulfillmentStatus}`);
    }
  }

  // Update Tracking info
  if (body.trackingNumber !== undefined) {
    updateData.trackingNumber = body.trackingNumber ? String(body.trackingNumber).trim() : null;
  }
  if (body.trackingCompany !== undefined) {
    updateData.trackingCompany = body.trackingCompany ? String(body.trackingCompany).trim() : null;
  }

  // Update Notes
  if (body.staffNote !== undefined) {
    updateData.staffNote = body.staffNote ? String(body.staffNote).trim() : null;
  }
  if (body.customerNote !== undefined) {
    updateData.customerNote = body.customerNote ? String(body.customerNote).trim() : null;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ ok: true, order, message: "No changes provided." });
  }

  const updated = await db.order.update({
    where: { id: order.id },
    data: updateData,
    include: orderInclude,
  });

  // Log timeline event
  if (events.length > 0) {
    await db.orderEvent.create({
      data: {
        orderId: order.id,
        type: "order.updated",
        message: events.join("; "),
      },
    }).catch(() => {});
  }

  // Fire notifications when applicable
  if (body.status === "PROCESSING") {
    notifyOrder(order.id, { kind: "order.processing" }).catch(() => {});
  } else if (body.status === "SHIPPED") {
    notifyOrder(order.id, { kind: "order.shipped" }).catch(() => {});
  } else if (body.status === "DELIVERED") {
    notifyOrder(order.id, { kind: "order.delivered" }).catch(() => {});
  } else if (body.status === "CANCELLED") {
    notifyOrder(order.id, { kind: "order.cancelled", reason: body.reason || null }).catch(() => {});
  }

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
