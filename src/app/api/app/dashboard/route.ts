import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireBearerPermission, apiOptionsResponse, withApiAuth } from "@/lib/auth/bearer";

export const runtime = "nodejs";

export const OPTIONS = apiOptionsResponse;

export const GET = withApiAuth(async () => {
  await requireBearerPermission("products:read");

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    totalProducts,
    activeProducts,
    recentOrders,
    paidOrders30d,
    pendingFulfilmentCount,
    lowStockVariants,
  ] = await Promise.all([
    db.product.count(),
    db.product.count({ where: { status: "ACTIVE" } }),
    db.order.findMany({
      orderBy: { placedAt: "desc" },
      take: 8,
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
    db.order.aggregate({
      where: {
        paymentStatus: "SUCCESS",
        placedAt: { gte: thirtyDaysAgo },
      },
      _sum: { total: true },
      _count: { _all: true },
    }),
    db.order.count({
      where: {
        paymentStatus: "SUCCESS",
        fulfillmentStatus: "UNFULFILLED",
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

  const totalRevenueMinor = paidOrders30d._sum?.total ?? 0;
  const ordersCount30d = paidOrders30d._count?._all ?? 0;

  return NextResponse.json({
    metrics: {
      totalRevenue: totalRevenueMinor,
      ordersCount: ordersCount30d,
      pendingFulfilment: pendingFulfilmentCount,
      totalProducts,
      activeProducts,
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
