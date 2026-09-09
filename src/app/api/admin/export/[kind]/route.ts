import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { can, type Permission } from "@/lib/auth/rbac";
import { formatPhone } from "@/lib/phone";
import { availableOf } from "@/lib/inventory";
import type { OrderStatus, PaymentStatus, Prisma } from "@/generated/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CSV downloads for the console: products, inventory, orders and customers.
 *
 * A shop keeps its books somewhere other than its website, and the person who
 * does that wants a spreadsheet, not a screen. Each export is the table the
 * console already shows, one row per thing, with money in cedis rather than
 * pesewas because that is what a spreadsheet's SUM expects.
 *
 * The same permission the matching console page needs is checked here, so a
 * link pasted to somebody without access gets a 403 and no data.
 */

const PERMISSION: Record<string, Permission> = {
  products: "products:read",
  inventory: "inventory:read",
  orders: "orders:read",
  customers: "customers:read",
};

/** RFC 4180: quote anything with a comma, quote or newline; double the quotes. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csv(header: string[], rows: unknown[][]): string {
  // A byte-order mark, so Excel opens cedi signs and accented names correctly.
  return "﻿" + [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

const cedis = (minor: number) => (minor / 100).toFixed(2);

export async function GET(request: Request, ctx: RouteContext<"/api/admin/export/[kind]">) {
  const { kind } = await ctx.params;
  const permission = PERMISSION[kind];
  if (!permission) return NextResponse.json({ error: "Unknown export" }, { status: 404 });

  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!can(user.role, permission)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const body = await build(kind, params);
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="laluxury-${kind}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

async function build(kind: string, params: URLSearchParams): Promise<string> {
  switch (kind) {
    case "products": {
      const products = await db.product.findMany({
        orderBy: { title: "asc" },
        include: {
          categories: { include: { category: { select: { name: true } } } },
          variants: { orderBy: { position: "asc" }, include: { inventory: true } },
        },
      });
      return csv(
        ["Product", "Handle", "Status", "Featured", "Categories", "Tags", "Variant", "SKU", "Price (GHS)", "Was (GHS)", "Cost (GHS)", "On hand", "Reserved", "Available", "Active"],
        products.flatMap((product) =>
          product.variants.map((variant) => [
            product.title,
            product.slug,
            product.status,
            product.isFeatured ? "yes" : "no",
            product.categories.map((c) => c.category.name).join("; "),
            product.tags.join("; "),
            variant.title,
            variant.sku,
            cedis(variant.price),
            variant.compareAtPrice ? cedis(variant.compareAtPrice) : "",
            variant.costPrice ? cedis(variant.costPrice) : "",
            variant.inventory?.onHand ?? "",
            variant.inventory?.reserved ?? "",
            variant.inventory ? availableOf(variant.inventory) : "",
            variant.isActive ? "yes" : "no",
          ]),
        ),
      );
    }

    case "inventory": {
      const items = await db.inventoryItem.findMany({
        include: { variant: { include: { product: { select: { title: true, status: true } } } } },
        orderBy: { variant: { product: { title: "asc" } } },
      });
      return csv(
        ["Product", "Variant", "SKU", "On hand", "Reserved", "Available", "Reorder point", "Reorder qty", "Tracked", "Backorder", "Location", "Product status"],
        items.map((item) => [
          item.variant.product.title,
          item.variant.title,
          item.variant.sku,
          item.onHand,
          item.reserved,
          availableOf(item),
          item.reorderPoint,
          item.reorderQuantity,
          item.trackInventory ? "yes" : "no",
          item.allowBackorder ? "yes" : "no",
          item.location,
          item.variant.product.status,
        ]),
      );
    }

    case "orders": {
      // The same filters the orders page offers, so "export what I am looking at" holds.
      const status = params.get("status") ?? "";
      const payment = params.get("payment") ?? "";
      const from = params.get("from") ? new Date(`${params.get("from")}T00:00:00`) : null;
      const to = params.get("to") ? new Date(`${params.get("to")}T23:59:59.999`) : null;

      const where: Prisma.OrderWhereInput = {
        ...(status ? { status: status as OrderStatus } : {}),
        ...(payment ? { paymentStatus: payment as PaymentStatus } : {}),
        ...(from || to ? { placedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      };

      const orders = await db.order.findMany({
        where,
        orderBy: { placedAt: "desc" },
        include: {
          items: true,
          shippingAddress: true,
          shippingRate: { select: { name: true } },
          payments: { where: { status: "SUCCESS" }, take: 1, orderBy: { createdAt: "desc" } },
          redemptions: { include: { discount: { select: { code: true } } } },
        },
        take: 5000,
      });

      return csv(
        ["Order", "Placed", "Status", "Payment", "Paid at", "Method", "Reference", "Customer", "Email", "Phone", "City", "Region", "Delivery", "Items", "Subtotal (GHS)", "Discount (GHS)", "Code", "Delivery (GHS)", "Total (GHS)", "Refunded (GHS)", "Tracking"],
        orders.map((order) => [
          order.orderNumber,
          order.placedAt,
          order.status,
          order.paymentStatus,
          order.paidAt,
          order.payments[0]?.channel ?? "",
          order.payments[0]?.reference ?? "",
          order.shippingAddress ? `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`.trim() : "",
          order.email,
          order.phone ? formatPhone(order.phone) : "",
          order.shippingAddress?.city ?? "",
          order.shippingAddress?.region ?? "",
          order.shippingRate?.name ?? "",
          order.items.map((item) => `${item.quantity}x ${item.sku}`).join("; "),
          cedis(order.subtotal),
          cedis(order.discountTotal),
          order.redemptions.map((r) => r.discount.code).join("; "),
          cedis(order.shippingTotal),
          cedis(order.total),
          cedis(order.refundedTotal),
          [order.trackingCompany, order.trackingNumber].filter(Boolean).join(" "),
        ]),
      );
    }

    case "customers": {
      const customers = await db.user.findMany({
        where: { role: "CUSTOMER" },
        orderBy: { createdAt: "desc" },
        include: {
          orders: { where: { paymentStatus: "SUCCESS" }, select: { total: true, placedAt: true } },
          tags: { include: { tag: { select: { name: true } } } },
        },
      });
      return csv(
        ["First name", "Last name", "Email", "Phone", "Phone verified", "Marketing opt-in", "Consented at", "Orders", "Lifetime value (GHS)", "Last order", "Tags", "Joined", "Active"],
        customers.map((customer) => {
          const spent = customer.orders.reduce((sum, o) => sum + o.total, 0);
          const last = customer.orders.map((o) => o.placedAt).sort((a, b) => b.getTime() - a.getTime())[0];
          return [
            customer.firstName ?? "",
            customer.lastName ?? "",
            customer.email ?? "",
            customer.phone ? formatPhone(customer.phone) : "",
            customer.phoneVerified ? "yes" : "no",
            customer.acceptsMarketing ? "yes" : "no",
            customer.marketingConsentAt,
            customer.orders.length,
            cedis(spent),
            last ?? "",
            customer.tags.map((t) => t.tag.name).join("; "),
            customer.createdAt,
            customer.isActive ? "yes" : "no",
          ];
        }),
      );
    }

    default:
      return csv(["error"], [["unknown export"]]);
  }
}
