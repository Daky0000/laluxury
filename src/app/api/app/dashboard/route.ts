import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireBearerPermission, apiOptionsResponse, withApiAuth } from "@/lib/auth/bearer";
import { dashboardMetrics } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const OPTIONS = apiOptionsResponse;

export const GET = withApiAuth(async () => {
  await requireBearerPermission("products:read");

  const [
    webMetrics,
    totalProducts,
    recentOrders,
    lowStockVariants,
  ] = await Promise.all([
    dashboardMetrics(30),
    db.product.count(),
    db.order.findMany({
      orderBy: { placedAt: "desc" },
      take: 12,
      select: {
        id: true,
        orderNumber: true,
        total: true,
        currency: true,
        status: true,
        paymentStatus: true,
        placedAt: true,
        email: true,
        shippingAddress: {
          select: {
            firstName: true,
            lastName: true,
            city: true,
          },
        },
      },
    }),
    db.variant.findMany({
      where: {
        product: { status: "ACTIVE" },
        inventory: {
          onHand: { lte: 5 },
        },
      },
      take: 10,
      select: {
        id: true,
        title: true,
        sku: true,
        price: true,
        product: {
          select: {
            id: true,
            title: true,
            images: {
              take: 1,
              orderBy: { position: "asc" },
              select: { url: true },
            },
          },
        },
        inventory: {
          select: {
            onHand: true,
            allowBackorder: true,
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    metrics: {
      totalRevenue: webMetrics.revenue,
      ordersCount: webMetrics.orderCount,
      pendingFulfilment: webMetrics.pendingFulfilment,
      totalProducts,
      activeProducts: webMetrics.activeProducts,
      lowStockCount: lowStockVariants.length,
    },
    recentOrders: recentOrders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      total: o.total,
      currency: o.currency,
      status: o.status,
      paymentStatus: o.paymentStatus,
      placedAt: o.placedAt.toISOString(),
      customerName: o.shippingAddress
        ? `${o.shippingAddress.firstName} ${o.shippingAddress.lastName}`.trim()
        : o.email,
      city: o.shippingAddress?.city ?? null,
    })),
    lowStockItems: lowStockVariants.map((v) => ({
      id: v.id,
      productId: v.product.id,
      productTitle: v.product.title,
      variantTitle: v.title,
      sku: v.sku,
      price: v.price,
      stock: v.inventory?.onHand ?? 0,
      imageUrl: v.product.images[0]?.url ?? null,
    })),
  });
});

