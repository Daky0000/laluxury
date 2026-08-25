import { db } from "./db";

/**
 * Reporting queries for the admin dashboard.
 *
 * Only orders with paymentStatus SUCCESS count as revenue, so abandoned
 * checkouts never inflate the numbers.
 */

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400000);
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export async function dashboardMetrics(windowDays = 30) {
  const since = daysAgo(windowDays);
  const priorSince = daysAgo(windowDays * 2);

  const [current, prior, counts, pendingFulfilment, newCustomers, abandonedCarts] =
    await Promise.all([
      db.order.findMany({
        where: { paymentStatus: "SUCCESS", paidAt: { gte: since } },
        select: { total: true, paidAt: true },
      }),
      db.order.findMany({
        where: { paymentStatus: "SUCCESS", paidAt: { gte: priorSince, lt: since } },
        select: { total: true },
      }),
      db.$transaction([
        db.product.count({ where: { status: "ACTIVE" } }),
        db.user.count({ where: { role: "CUSTOMER" } }),
        db.order.count(),
      ]),
      db.order.count({ where: { status: { in: ["PAID", "PROCESSING"] } } }),
      db.user.count({ where: { role: "CUSTOMER", createdAt: { gte: since } } }),
      db.cart.count({
        where: {
          convertedOrderId: null,
          items: { some: {} },
          lastActivityAt: { gte: daysAgo(7), lt: daysAgo(1) },
        },
      }),
    ]);

  const revenue = current.reduce((sum, o) => sum + o.total, 0);
  const priorRevenue = prior.reduce((sum, o) => sum + o.total, 0);
  const orderCount = current.length;

  const [activeProducts, customerCount, allOrders] = counts;

  return {
    windowDays,
    revenue,
    revenueChange: percentChange(revenue, priorRevenue),
    orderCount,
    orderCountChange: percentChange(orderCount, prior.length),
    averageOrderValue: orderCount ? Math.round(revenue / orderCount) : 0,
    activeProducts,
    customerCount,
    allOrders,
    pendingFulfilment,
    newCustomers,
    abandonedCarts,
  };
}

/** Daily revenue series for the dashboard chart, zero-filled. */
export async function revenueSeries(days = 30) {
  const since = daysAgo(days);

  const orders = await db.order.findMany({
    where: { paymentStatus: "SUCCESS", paidAt: { gte: since } },
    select: { total: true, paidAt: true },
    orderBy: { paidAt: "asc" },
  });

  const buckets = new Map<string, { revenue: number; orders: number }>();
  for (let i = days - 1; i >= 0; i -= 1) {
    buckets.set(daysAgo(i).toISOString().slice(0, 10), { revenue: 0, orders: 0 });
  }

  for (const order of orders) {
    if (!order.paidAt) continue;
    const key = order.paidAt.toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.revenue += order.total;
      bucket.orders += 1;
    }
  }

  return [...buckets.entries()].map(([date, v]) => ({ date, ...v }));
}

export async function topProducts(days = 30, limit = 5) {
  const orders = await db.order.findMany({
    where: { paymentStatus: "SUCCESS", paidAt: { gte: daysAgo(days) } },
    select: { items: true },
  });

  const totals = new Map<string, { title: string; units: number; revenue: number }>();

  for (const order of orders) {
    for (const item of order.items) {
      const key = item.productId ?? item.sku;
      const entry = totals.get(key) ?? { title: item.productTitle, units: 0, revenue: 0 };
      entry.units += item.quantity;
      entry.revenue += item.total;
      totals.set(key, entry);
    }
  }

  return [...totals.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

/** Lifetime value and order history, for the CRM customer list. */
export async function customerSummaries(args: {
  search?: string;
  take?: number;
  skip?: number;
}) {
  const where = args.search
    ? {
        role: "CUSTOMER" as const,
        OR: [
          { email: { contains: args.search, mode: "insensitive" as const } },
          { firstName: { contains: args.search, mode: "insensitive" as const } },
          { lastName: { contains: args.search, mode: "insensitive" as const } },
          { phone: { contains: args.search } },
        ],
      }
    : { role: "CUSTOMER" as const };

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      include: {
        orders: {
          where: { paymentStatus: "SUCCESS" },
          select: { total: true, placedAt: true },
        },
        tags: { include: { tag: true } },
      },
      orderBy: { createdAt: "desc" },
      take: args.take ?? 25,
      skip: args.skip ?? 0,
    }),
    db.user.count({ where }),
  ]);

  return {
    total,
    customers: users.map((u) => {
      const lifetimeValue = u.orders.reduce((sum, o) => sum + o.total, 0);
      const lastOrder = u.orders
        .map((o) => o.placedAt)
        .sort((a, b) => b.getTime() - a.getTime())[0];

      return {
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone,
        createdAt: u.createdAt,
        acceptsMarketing: u.acceptsMarketing,
        orderCount: u.orders.length,
        lifetimeValue,
        averageOrderValue: u.orders.length ? Math.round(lifetimeValue / u.orders.length) : 0,
        lastOrderAt: lastOrder ?? null,
        tags: u.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
      };
    }),
  };
}
