import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser, displayName } from "@/lib/auth";
import { can, isStaff, type Permission } from "@/lib/auth/rbac";
import { toMajorUnits } from "@/lib/money";
import { assertExportBytes, assertExportRows, exportAllowance, EXPORT_ROW_LIMIT, ExportTooLargeError } from "@/lib/export-limits";

export const dynamic = "force-dynamic";

const TYPE_PERMISSIONS: Record<string, Permission> = {
  customers: "customers:read",
  orders: "orders:read",
  inventory: "inventory:read",
  products: "products:read",
};

function csvEscape(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val).replace(/\r?\n/g, " ");
  if (str.includes(",") || str.includes('"') || str.includes(";")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  assertExportRows(rows);
  const headerLine = headers.map(csvEscape).join(",");
  const dataLines = rows.map((r) => r.map(csvEscape).join(","));
  // UTF-8 BOM (\uFEFF) ensures Microsoft Excel opens currency & accents cleanly
  return "\uFEFF" + [headerLine, ...dataLines].join("\r\n");
}

async function exportResponse(request: Request) {
  const user = await currentUser();
  if (!user || !isStaff(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "orders";
  const requiredPermission = TYPE_PERMISSIONS[type] ?? "orders:read";
  if (!can(user.role, requiredPermission)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const allowance = exportAllowance(user.id);
  if (!allowance.ok) return NextResponse.json({ error: "Too many exports. Try again later." }, {
    status: 429, headers: { "Cache-Control": "private, no-store", "Retry-After": String(allowance.retryAfterSeconds) },
  });

  const today = new Date().toISOString().slice(0, 10);

  if (type === "customers") {
    const [customers, tradeApps] = await Promise.all([
      db.user.findMany({
        take: EXPORT_ROW_LIMIT + 1,
        where: { role: "CUSTOMER" },
        include: {
          orders: {
            where: { status: { not: "CANCELLED" } },
            select: { total: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.tradeApplication.findMany({
        take: EXPORT_ROW_LIMIT + 1,
        orderBy: { createdAt: "desc" },
      }),
    ]);
    assertExportRows(customers);
    assertExportRows(tradeApps);

    const tradeByEmail = new Map(tradeApps.map((t) => [t.email.toLowerCase(), t]));

    const headers = [
      "Customer / Partner Name",
      "Email",
      "Phone",
      "Segment / Studio",
      "Trade Privilege Code",
      "Orders Count",
      "Lifetime Spend (GHS)",
      "Joined Date",
    ];

    const rows = customers.map((c) => {
      const emailKey = (c.email ?? "").toLowerCase();
      const trade = tradeByEmail.get(emailKey);
      const lifetime = c.orders.reduce((s, o) => s + o.total, 0);
      return [
        displayName(c),
        c.email ?? "",
        c.phone ?? "",
        trade ? `Trade (${trade.company} - ${trade.role})` : "Retail Client",
        trade?.discountCode ?? "",
        c.orders.length,
        toMajorUnits(lifetime).toFixed(2),
        c.createdAt.toISOString().slice(0, 10),
      ];
    });

    // Also append Trade Partners who haven't created a User account yet
    for (const t of tradeApps) {
      if (!customers.some((c) => (c.email ?? "").toLowerCase() === t.email.toLowerCase())) {
        rows.push([
          t.name,
          t.email,
          t.phone,
          `Trade Partner (${t.company} - ${t.role})`,
          t.discountCode ?? "",
          0,
          "0.00",
          t.createdAt.toISOString().slice(0, 10),
        ]);
      }
    }

    const csv = buildCsv(headers, rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="noble-enclave-customers-trade-${today}.csv"`,
      },
    });
  }

  if (type === "preorders") {
    const requests = await db.preorderRequest.findMany({
      take: EXPORT_ROW_LIMIT + 1,
      orderBy: { createdAt: "desc" },
    });

    const headers = [
      "Inquiry ID",
      "Date",
      "Status",
      "Client Name",
      "Phone",
      "Email",
      "Piece / Commission",
      "Variant",
      "Quantity",
      "Target Budget / Quoted (GHS)",
      "Swatches Requested",
      "Converted Order #",
      "Client Notes",
      "Staff Note",
    ];

    const rows = requests.map((r) => [
      r.id,
      r.createdAt.toISOString().slice(0, 10),
      r.status,
      r.name,
      r.phone,
      r.email,
      r.productTitle,
      r.variantTitle ?? "",
      r.quantity,
      r.targetBudget ? toMajorUnits(r.targetBudget).toFixed(2) : "",
      r.swatchRequest ?? "",
      r.convertedOrderId ?? "",
      r.notes ?? "",
      r.staffNote ?? "",
    ]);

    const csv = buildCsv(headers, rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="noble-enclave-preorder-inquiries-${today}.csv"`,
      },
    });
  }

  // Default: Orders & Accounting CSV
  const orders = await db.order.findMany({
    take: EXPORT_ROW_LIMIT + 1,
    include: {
      shippingAddress: true,
      items: true,
    },
    orderBy: { placedAt: "desc" },
  });

  const headers = [
    "Order Number",
    "Placed Date",
    "Order Status",
    "Payment Status",
    "Payment Method",
    "Is Pre-Order",
    "Pre-Order Milestone",
    "Customer Name",
    "Email",
    "Phone",
    "City / Region",
    "Subtotal (GHS)",
    "Discount (GHS)",
    "Delivery (GHS)",
    "Total Contract Value (GHS)",
    "50% Deposit Collected (GHS)",
    "Remaining Balance Receivable (GHS)",
    "Balance Paid Date",
    "Container / Tracking #",
    "Items Purchased",
  ];

  const rows = orders.map((o) => {
    const customerName = o.shippingAddress
      ? `${o.shippingAddress.firstName} ${o.shippingAddress.lastName}`
      : o.email;
    const depositPaid = o.depositAmount ?? o.total;
    const balanceReceivable =
      o.depositAmount && o.depositAmount < o.total && !o.balancePaidAt
        ? o.total - o.depositAmount
        : 0;

    return [
      o.orderNumber,
      o.placedAt.toISOString().slice(0, 10),
      o.status,
      o.paymentStatus,
      o.paymentMethod,
      o.hasPreorderItems ? "YES" : "NO",
      o.hasPreorderItems ? o.preorderStage : "IN_STOCK",
      customerName,
      o.email,
      o.phone ?? o.shippingAddress?.phone ?? "",
      o.shippingAddress ? `${o.shippingAddress.city}, ${o.shippingAddress.region}` : "",
      toMajorUnits(o.subtotal).toFixed(2),
      toMajorUnits(o.discountTotal).toFixed(2),
      toMajorUnits(o.shippingTotal).toFixed(2),
      toMajorUnits(o.total).toFixed(2),
      toMajorUnits(depositPaid).toFixed(2),
      toMajorUnits(balanceReceivable).toFixed(2),
      o.balancePaidAt ? o.balancePaidAt.toISOString().slice(0, 10) : "",
      o.trackingNumber ?? "",
      o.items.map((i) => `${i.productTitle} (${i.variantTitle}) x${i.quantity}`).join(" | "),
    ];
  });

  const csv = buildCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="noble-enclave-orders-accounting-${today}.csv"`,
    },
  });
}

export async function GET(request: Request) {
  try {
    const response = await exportResponse(request);
    if (response.ok) assertExportBytes(await response.clone().text());
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    if (error instanceof ExportTooLargeError) return NextResponse.json({ error: error.message }, {
      status: 413, headers: { "Cache-Control": "private, no-store" },
    });
    throw error;
  }
}
