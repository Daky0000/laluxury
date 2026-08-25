import { db } from "@/lib/db";
import { can, type Permission } from "@/lib/auth/rbac";
import { formatMoney, toMinorUnits } from "@/lib/money";
import { buildSearchText, refreshPriceRange } from "@/lib/catalog";
import { lowStockItems, setStockLevel, restockVariant } from "@/lib/inventory";
import { ensureUniqueCode, describeDiscount } from "@/lib/discounts";
import { updateOrderStatus, cancelOrder } from "@/lib/orders";
import { recordAudit } from "@/lib/audit";
import { uniqueSlug } from "@/lib/slug";
import type { ToolSchema } from "./openrouter";
import type { Role, OrderStatus, DiscountType } from "@/generated/prisma";

/**
 * The agent's capability surface.
 *
 * Every tool declares the permission it needs and whether it mutates the store.
 * Read tools run immediately. Mutating tools are gated twice: by the role of
 * the person talking to the agent, and (when the store is set to require it)
 * by an explicit confirmation before execution.
 */

export type AgentContext = {
  userId: string | null;
  role: Role;
  threadId: string;
  source: "slack" | "whatsapp" | "web";
};

export type ToolResult = Record<string, unknown> | { error: string };

type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  permission: Permission | null;
  mutating: boolean;
  /** One-line preview shown in the confirmation prompt. */
  summarise: (args: Record<string, unknown>) => string;
  execute: (args: Record<string, unknown>, ctx: AgentContext) => Promise<ToolResult>;
};

const str = (v: unknown): string => (typeof v === "string" ? v : String(v ?? ""));
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v));
const bool = (v: unknown): boolean => v === true || v === "true";

/** Accepts a SKU or a variant id, so the owner can just say "LX-VASE-01". */
async function resolveVariant(identifier: string) {
  const variant = await db.variant.findFirst({
    where: { OR: [{ id: identifier }, { sku: { equals: identifier, mode: "insensitive" } }] },
    include: { product: { select: { id: true, title: true } }, inventory: true },
  });
  return variant;
}

async function resolveProduct(identifier: string) {
  return db.product.findFirst({
    where: {
      OR: [
        { id: identifier },
        { slug: { equals: identifier, mode: "insensitive" } },
        { title: { equals: identifier, mode: "insensitive" } },
      ],
    },
    include: { variants: { include: { inventory: true } }, images: { take: 1 } },
  });
}

// ---------------------------------------------------------------------------
// Read tools
// ---------------------------------------------------------------------------

const searchProductsTool: ToolDefinition = {
  name: "search_products",
  description:
    "Search the catalog by name, tag, brand or SKU. Returns products with prices, stock and status. Use this before changing anything so you reference the right product.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Free text. Leave empty to list everything." },
      status: {
        type: "string",
        enum: ["ACTIVE", "DRAFT", "ARCHIVED", "ANY"],
        description: "Defaults to ANY.",
      },
      limit: { type: "number", description: "Max results, default 10." },
    },
  },
  permission: "products:read",
  mutating: false,
  summarise: (a) => `Search products for "${str(a.query)}"`,
  execute: async (args) => {
    const query = str(args.query).trim().toLowerCase();
    const status = str(args.status || "ANY");
    const limit = Math.min(25, num(args.limit) || 10);

    const products = await db.product.findMany({
      where: {
        ...(status !== "ANY" && status
          ? { status: status as "ACTIVE" | "DRAFT" | "ARCHIVED" }
          : {}),
        ...(query
          ? {
              OR: [
                { searchText: { contains: query } },
                { title: { contains: query, mode: "insensitive" } },
                { variants: { some: { sku: { contains: query, mode: "insensitive" } } } },
              ],
            }
          : {}),
      },
      include: { variants: { include: { inventory: true } } },
      take: limit,
      orderBy: { updatedAt: "desc" },
    });

    return {
      count: products.length,
      products: products.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        status: p.status,
        priceRange:
          p.minPrice === p.maxPrice
            ? formatMoney(p.minPrice)
            : `${formatMoney(p.minPrice)} - ${formatMoney(p.maxPrice)}`,
        isFeatured: p.isFeatured,
        tags: p.tags,
        variants: p.variants.map((v) => ({
          sku: v.sku,
          title: v.title,
          price: formatMoney(v.price),
          onHand: v.inventory?.onHand ?? 0,
          available: (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0),
        })),
      })),
    };
  },
};

const lowStockTool: ToolDefinition = {
  name: "low_stock_report",
  description:
    "List every variant at or below its reorder point, with suggested reorder quantities.",
  parameters: {
    type: "object",
    properties: { limit: { type: "number", description: "Default 20." } },
  },
  permission: "inventory:read",
  mutating: false,
  summarise: () => "Check low stock",
  execute: async (args) => {
    const items = await lowStockItems(Math.min(50, num(args.limit) || 20));
    return {
      count: items.length,
      items: items.map((i) => ({
        sku: i.sku,
        product: `${i.productTitle} (${i.variantTitle})`,
        available: i.available,
        onHand: i.onHand,
        reserved: i.reserved,
        reorderPoint: i.reorderPoint,
        suggestedReorder: i.reorderQuantity || Math.max(10, i.reorderPoint * 2),
      })),
    };
  },
};

const listOrdersTool: ToolDefinition = {
  name: "list_orders",
  description: "List recent orders, optionally filtered by status.",
  parameters: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: [
          "PENDING",
          "PAID",
          "PROCESSING",
          "FULFILLED",
          "SHIPPED",
          "DELIVERED",
          "CANCELLED",
          "REFUNDED",
          "ANY",
        ],
      },
      limit: { type: "number", description: "Default 10." },
      days: { type: "number", description: "Only orders from the last N days." },
    },
  },
  permission: "orders:read",
  mutating: false,
  summarise: (a) => `List ${str(a.status || "recent")} orders`,
  execute: async (args) => {
    const status = str(args.status || "ANY");
    const days = num(args.days);

    const orders = await db.order.findMany({
      where: {
        ...(status !== "ANY" && status ? { status: status as OrderStatus } : {}),
        ...(Number.isFinite(days) && days > 0
          ? { placedAt: { gte: new Date(Date.now() - days * 86400000) } }
          : {}),
      },
      include: { items: true },
      orderBy: { placedAt: "desc" },
      take: Math.min(25, num(args.limit) || 10),
    });

    return {
      count: orders.length,
      orders: orders.map((o) => ({
        orderNumber: o.orderNumber,
        status: o.status,
        paymentStatus: o.paymentStatus,
        total: formatMoney(o.total),
        email: o.email,
        itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
        placedAt: o.placedAt.toISOString(),
      })),
    };
  },
};

const getOrderTool: ToolDefinition = {
  name: "get_order",
  description: "Full detail for one order: items, totals, address, payment and timeline.",
  parameters: {
    type: "object",
    properties: { orderNumber: { type: "string", description: "e.g. LX-8FK2QW" } },
    required: ["orderNumber"],
  },
  permission: "orders:read",
  mutating: false,
  summarise: (a) => `Look up order ${str(a.orderNumber)}`,
  execute: async (args) => {
    const order = await db.order.findUnique({
      where: { orderNumber: str(args.orderNumber).toUpperCase() },
      include: {
        items: true,
        shippingAddress: true,
        payments: true,
        events: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!order) return { error: "No order with that number." };

    return {
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      customer: { email: order.email, phone: order.phone },
      totals: {
        subtotal: formatMoney(order.subtotal),
        discount: formatMoney(order.discountTotal),
        shipping: formatMoney(order.shippingTotal),
        total: formatMoney(order.total),
      },
      items: order.items.map((i) => ({
        sku: i.sku,
        title: `${i.productTitle} (${i.variantTitle})`,
        quantity: i.quantity,
        unitPrice: formatMoney(i.unitPrice),
      })),
      shippingAddress: order.shippingAddress
        ? `${order.shippingAddress.line1}, ${order.shippingAddress.city}, ${order.shippingAddress.region}`
        : null,
      trackingNumber: order.trackingNumber,
      timeline: order.events.map((e) => `${e.createdAt.toISOString()}: ${e.message}`),
    };
  },
};

const salesSummaryTool: ToolDefinition = {
  name: "sales_summary",
  description:
    "Revenue, order count, average order value and best sellers over a period. Use for questions like 'how did we do this week'.",
  parameters: {
    type: "object",
    properties: { days: { type: "number", description: "Look-back window, default 30." } },
  },
  permission: "dashboard:view",
  mutating: false,
  summarise: (a) => `Sales summary for the last ${num(a.days) || 30} days`,
  execute: async (args) => {
    const days = Math.min(365, num(args.days) || 30);
    const since = new Date(Date.now() - days * 86400000);

    const orders = await db.order.findMany({
      where: { paymentStatus: "SUCCESS", paidAt: { gte: since } },
      include: { items: true },
    });

    const revenue = orders.reduce((s, o) => s + o.total, 0);
    const unitsBySku = new Map<string, { title: string; units: number; revenue: number }>();

    for (const order of orders) {
      for (const item of order.items) {
        const entry = unitsBySku.get(item.sku) ?? {
          title: `${item.productTitle} (${item.variantTitle})`,
          units: 0,
          revenue: 0,
        };
        entry.units += item.quantity;
        entry.revenue += item.total;
        unitsBySku.set(item.sku, entry);
      }
    }

    const bestSellers = [...unitsBySku.entries()]
      .sort((a, b) => b[1].units - a[1].units)
      .slice(0, 5)
      .map(([sku, v]) => ({ sku, title: v.title, units: v.units, revenue: formatMoney(v.revenue) }));

    return {
      periodDays: days,
      orderCount: orders.length,
      revenue: formatMoney(revenue),
      averageOrderValue: formatMoney(orders.length ? Math.round(revenue / orders.length) : 0),
      bestSellers,
    };
  },
};

const findCustomerTool: ToolDefinition = {
  name: "find_customer",
  description: "Look up a customer by email or name, with their order history and lifetime value.",
  parameters: {
    type: "object",
    properties: { query: { type: "string", description: "Email or name." } },
    required: ["query"],
  },
  permission: "customers:read",
  mutating: false,
  summarise: (a) => `Find customer "${str(a.query)}"`,
  execute: async (args) => {
    const q = str(args.query).trim();
    const users = await db.user.findMany({
      where: {
        OR: [
          { email: { contains: q, mode: "insensitive" } },
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
        ],
      },
      include: {
        orders: { where: { paymentStatus: "SUCCESS" }, select: { total: true, placedAt: true } },
      },
      take: 5,
    });

    return {
      count: users.length,
      customers: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: [u.firstName, u.lastName].filter(Boolean).join(" ") || null,
        phone: u.phone,
        role: u.role,
        orderCount: u.orders.length,
        lifetimeValue: formatMoney(u.orders.reduce((s, o) => s + o.total, 0)),
        lastOrder: u.orders.length
          ? u.orders.map((o) => o.placedAt).sort((a, b) => b.getTime() - a.getTime())[0].toISOString()
          : null,
      })),
    };
  },
};

const listDiscountsTool: ToolDefinition = {
  name: "list_discounts",
  description: "List discount codes with their rules and how often each has been used.",
  parameters: { type: "object", properties: { activeOnly: { type: "boolean" } } },
  permission: "discounts:read",
  mutating: false,
  summarise: () => "List discount codes",
  execute: async (args) => {
    const discounts = await db.discount.findMany({
      where: args.activeOnly ? { isActive: true } : {},
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return {
      count: discounts.length,
      discounts: discounts.map((d) => ({
        code: d.code,
        rule: describeDiscount(d),
        isActive: d.isActive,
        timesUsed: d.timesUsed,
        usageLimit: d.usageLimit,
        endsAt: d.endsAt?.toISOString() ?? null,
      })),
    };
  },
};

// ---------------------------------------------------------------------------
// Mutating tools
// ---------------------------------------------------------------------------

const updatePriceTool: ToolDefinition = {
  name: "update_price",
  description:
    "Change the price of one variant. Give the price in cedis (e.g. 249.99), not pesewas.",
  parameters: {
    type: "object",
    properties: {
      sku: { type: "string", description: "Variant SKU or id." },
      price: { type: "number", description: "New price in GHS, e.g. 249.99" },
      compareAtPrice: {
        type: "number",
        description: "Optional was-price in GHS for a strike-through. Send 0 to clear it.",
      },
    },
    required: ["sku", "price"],
  },
  permission: "products:write",
  mutating: true,
  summarise: (a) => `Set ${str(a.sku)} price to GH₵${num(a.price).toFixed(2)}`,
  execute: async (args, ctx) => {
    const variant = await resolveVariant(str(args.sku));
    if (!variant) return { error: `No variant matching "${str(args.sku)}".` };

    const price = toMinorUnits(num(args.price));
    if (price < 0) return { error: "Price cannot be negative." };

    const compareRaw = args.compareAtPrice;
    const compareAtPrice =
      compareRaw === undefined ? undefined : num(compareRaw) > 0 ? toMinorUnits(num(compareRaw)) : null;

    const before = { price: variant.price, compareAtPrice: variant.compareAtPrice };

    await db.variant.update({
      where: { id: variant.id },
      data: { price, ...(compareAtPrice !== undefined ? { compareAtPrice } : {}) },
    });
    await refreshPriceRange(variant.productId);

    await recordAudit({
      actorId: ctx.userId,
      action: "variant.price_update",
      entity: "Variant",
      entityId: variant.id,
      before,
      after: { price, compareAtPrice },
      source: "agent",
    });

    return {
      ok: true,
      sku: variant.sku,
      product: variant.product.title,
      previousPrice: formatMoney(before.price),
      newPrice: formatMoney(price),
    };
  },
};

const adjustStockTool: ToolDefinition = {
  name: "adjust_stock",
  description:
    "Set or add to the stock level of a variant. Use `setTo` for a stock count, or `addUnits` when receiving a delivery.",
  parameters: {
    type: "object",
    properties: {
      sku: { type: "string" },
      setTo: { type: "number", description: "Absolute new on-hand count." },
      addUnits: { type: "number", description: "Units received, added to on-hand." },
      reason: { type: "string", description: "Why, for the stock ledger." },
    },
    required: ["sku"],
  },
  permission: "inventory:write",
  mutating: true,
  summarise: (a) =>
    a.setTo !== undefined
      ? `Set ${str(a.sku)} stock to ${num(a.setTo)}`
      : `Add ${num(a.addUnits)} units to ${str(a.sku)}`,
  execute: async (args, ctx) => {
    const variant = await resolveVariant(str(args.sku));
    if (!variant) return { error: `No variant matching "${str(args.sku)}".` };

    const reason = str(args.reason) || `Adjusted by agent via ${ctx.source}`;

    if (args.setTo !== undefined) {
      const result = await setStockLevel(variant.id, num(args.setTo), reason, ctx.userId);
      return { ok: true, sku: variant.sku, ...result };
    }
    if (args.addUnits !== undefined) {
      await restockVariant(variant.id, num(args.addUnits), reason, ctx.userId);
      const item = await db.inventoryItem.findUnique({ where: { variantId: variant.id } });
      return { ok: true, sku: variant.sku, added: num(args.addUnits), onHand: item?.onHand ?? 0 };
    }
    return { error: "Provide either setTo or addUnits." };
  },
};

const updateProductTool: ToolDefinition = {
  name: "update_product",
  description:
    "Edit a product's copy, status, tags or featured flag. Only the fields you pass are changed.",
  parameters: {
    type: "object",
    properties: {
      product: { type: "string", description: "Product id, slug or exact title." },
      title: { type: "string" },
      description: { type: "string" },
      shortDescription: { type: "string" },
      status: { type: "string", enum: ["DRAFT", "ACTIVE", "ARCHIVED"] },
      isFeatured: { type: "boolean" },
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["product"],
  },
  permission: "products:write",
  mutating: true,
  summarise: (a) => {
    const fields = Object.keys(a).filter((k) => k !== "product");
    return `Update ${str(a.product)} (${fields.join(", ")})`;
  },
  execute: async (args, ctx) => {
    const product = await resolveProduct(str(args.product));
    if (!product) return { error: `No product matching "${str(args.product)}".` };

    const data: Record<string, unknown> = {};
    if (typeof args.title === "string") data.title = args.title;
    if (typeof args.description === "string") data.description = args.description;
    if (typeof args.shortDescription === "string") data.shortDescription = args.shortDescription;
    if (typeof args.isFeatured === "boolean") data.isFeatured = args.isFeatured;
    if (Array.isArray(args.tags)) data.tags = args.tags.map(String);

    if (typeof args.status === "string") {
      data.status = args.status;
      // Publishing for the first time stamps the date used for "newest" sort.
      if (args.status === "ACTIVE" && !product.publishedAt) data.publishedAt = new Date();
    }

    if (Object.keys(data).length === 0) return { error: "Nothing to change." };

    data.searchText = buildSearchText({
      title: (data.title as string) ?? product.title,
      tags: (data.tags as string[]) ?? product.tags,
      brand: product.brand,
      material: product.material,
      shortDescription: (data.shortDescription as string) ?? product.shortDescription,
    });

    const updated = await db.product.update({ where: { id: product.id }, data });

    await recordAudit({
      actorId: ctx.userId,
      action: "product.update",
      entity: "Product",
      entityId: product.id,
      before: { title: product.title, status: product.status, isFeatured: product.isFeatured },
      after: { title: updated.title, status: updated.status, isFeatured: updated.isFeatured },
      source: "agent",
    });

    return {
      ok: true,
      product: updated.title,
      slug: updated.slug,
      status: updated.status,
      changed: Object.keys(data).filter((k) => k !== "searchText"),
    };
  },
};

const createDiscountTool: ToolDefinition = {
  name: "create_discount",
  description:
    "Create a discount code. Percentage values are whole numbers (10 = 10% off). Fixed amounts are in cedis.",
  parameters: {
    type: "object",
    properties: {
      code: { type: "string", description: "e.g. EASTER25" },
      type: { type: "string", enum: ["PERCENTAGE", "FIXED_AMOUNT", "FREE_SHIPPING"] },
      value: { type: "number", description: "Percent (10) or cedis (50). Ignored for FREE_SHIPPING." },
      description: { type: "string" },
      minSubtotal: { type: "number", description: "Minimum bag value in cedis." },
      usageLimit: { type: "number", description: "Total redemptions allowed." },
      usageLimitPerUser: { type: "number" },
      firstOrderOnly: { type: "boolean" },
      endsInDays: { type: "number", description: "Auto-expire after N days." },
    },
    required: ["code", "type"],
  },
  permission: "discounts:write",
  mutating: true,
  summarise: (a) =>
    `Create code ${str(a.code).toUpperCase()} (${str(a.type)}${
      a.value !== undefined ? ` ${num(a.value)}` : ""
    })`,
  execute: async (args, ctx) => {
    const type = str(args.type) as DiscountType;
    const rawValue = num(args.value) || 0;

    if (type === "PERCENTAGE" && (rawValue <= 0 || rawValue > 100)) {
      return { error: "A percentage discount must be between 1 and 100." };
    }

    const value =
      type === "FIXED_AMOUNT" ? toMinorUnits(rawValue) : type === "PERCENTAGE" ? rawValue : 0;

    const code = await ensureUniqueCode(str(args.code));
    const endsInDays = num(args.endsInDays);

    const discount = await db.discount.create({
      data: {
        code,
        type,
        value,
        description: str(args.description) || null,
        minSubtotal: args.minSubtotal !== undefined ? toMinorUnits(num(args.minSubtotal)) : null,
        usageLimit: args.usageLimit !== undefined ? num(args.usageLimit) : null,
        usageLimitPerUser:
          args.usageLimitPerUser !== undefined ? num(args.usageLimitPerUser) : null,
        firstOrderOnly: Boolean(args.firstOrderOnly),
        endsAt:
          Number.isFinite(endsInDays) && endsInDays > 0
            ? new Date(Date.now() + endsInDays * 86400000)
            : null,
        isActive: true,
      },
    });

    await recordAudit({
      actorId: ctx.userId,
      action: "discount.create",
      entity: "Discount",
      entityId: discount.id,
      after: { code: discount.code, type, value },
      source: "agent",
    });

    return {
      ok: true,
      code: discount.code,
      rule: describeDiscount(discount),
      endsAt: discount.endsAt?.toISOString() ?? null,
    };
  },
};

const toggleDiscountTool: ToolDefinition = {
  name: "set_discount_active",
  description: "Turn a discount code on or off without deleting it.",
  parameters: {
    type: "object",
    properties: {
      code: { type: "string" },
      isActive: { type: "boolean" },
    },
    required: ["code", "isActive"],
  },
  permission: "discounts:write",
  mutating: true,
  summarise: (a) => `${bool(a.isActive) ? "Enable" : "Disable"} code ${str(a.code).toUpperCase()}`,
  execute: async (args, ctx) => {
    const code = str(args.code).toUpperCase();
    const discount = await db.discount.findUnique({ where: { code } });
    if (!discount) return { error: `No discount code ${code}.` };

    await db.discount.update({
      where: { id: discount.id },
      data: { isActive: Boolean(args.isActive) },
    });

    await recordAudit({
      actorId: ctx.userId,
      action: "discount.toggle",
      entity: "Discount",
      entityId: discount.id,
      before: { isActive: discount.isActive },
      after: { isActive: Boolean(args.isActive) },
      source: "agent",
    });

    return { ok: true, code, isActive: Boolean(args.isActive) };
  },
};

const updateOrderTool: ToolDefinition = {
  name: "update_order_status",
  description:
    "Move an order forward: mark it processing, fulfilled, shipped (with tracking), delivered, or cancel it.",
  parameters: {
    type: "object",
    properties: {
      orderNumber: { type: "string" },
      status: {
        type: "string",
        enum: ["PROCESSING", "FULFILLED", "SHIPPED", "DELIVERED", "CANCELLED"],
      },
      trackingNumber: { type: "string" },
      trackingCompany: { type: "string" },
      reason: { type: "string", description: "Required when cancelling." },
    },
    required: ["orderNumber", "status"],
  },
  permission: "orders:write",
  mutating: true,
  summarise: (a) => `Mark ${str(a.orderNumber)} as ${str(a.status).toLowerCase()}`,
  execute: async (args, ctx) => {
    const orderNumber = str(args.orderNumber).toUpperCase();
    const order = await db.order.findUnique({ where: { orderNumber } });
    if (!order) return { error: `No order ${orderNumber}.` };

    const status = str(args.status) as OrderStatus;

    if (status === "CANCELLED") {
      await cancelOrder(order.id, str(args.reason) || "Cancelled via agent.", ctx.userId);
      return { ok: true, orderNumber, status: "CANCELLED" };
    }

    try {
      await updateOrderStatus({
        orderId: order.id,
        status,
        actorId: ctx.userId,
        trackingNumber: str(args.trackingNumber) || undefined,
        trackingCompany: str(args.trackingCompany) || undefined,
      });
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }

    return { ok: true, orderNumber, status };
  },
};

const createProductTool: ToolDefinition = {
  name: "create_product",
  description:
    "Create a new product with a single default variant. It starts as a DRAFT so you can add images before publishing. Price is in cedis.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string" },
      price: { type: "number", description: "In GHS." },
      description: { type: "string" },
      sku: { type: "string", description: "Optional; generated when omitted." },
      stock: { type: "number", description: "Opening stock count, default 0." },
      tags: { type: "array", items: { type: "string" } },
      categorySlug: { type: "string" },
    },
    required: ["title", "price"],
  },
  permission: "products:write",
  mutating: true,
  summarise: (a) => `Create product "${str(a.title)}" at GH₵${num(a.price).toFixed(2)}`,
  execute: async (args, ctx) => {
    const title = str(args.title).trim();
    if (!title) return { error: "A title is required." };

    const price = toMinorUnits(num(args.price));
    const slug = await uniqueSlug("product", title);
    const tags = Array.isArray(args.tags) ? args.tags.map(String) : [];

    const sku =
      str(args.sku) ||
      `${slug.split("-").map((w) => w.slice(0, 3).toUpperCase()).join("").slice(0, 9)}-01`;

    const existingSku = await db.variant.findUnique({ where: { sku }, select: { id: true } });
    if (existingSku) return { error: `SKU ${sku} is already in use.` };

    const product = await db.product.create({
      data: {
        title,
        slug,
        description: str(args.description) || null,
        status: "DRAFT",
        minPrice: price,
        maxPrice: price,
        tags,
        searchText: buildSearchText({ title, tags, shortDescription: str(args.description) }),
        variants: {
          create: {
            title: "Default",
            sku,
            price,
            inventory: { create: { onHand: num(args.stock) || 0 } },
          },
        },
      },
      include: { variants: true },
    });

    if (args.categorySlug) {
      const category = await db.category.findUnique({ where: { slug: str(args.categorySlug) } });
      if (category) {
        await db.productCategory.create({
          data: { productId: product.id, categoryId: category.id },
        });
      }
    }

    await recordAudit({
      actorId: ctx.userId,
      action: "product.create",
      entity: "Product",
      entityId: product.id,
      after: { title, slug, price },
      source: "agent",
    });

    return {
      ok: true,
      product: product.title,
      slug: product.slug,
      sku: product.variants[0].sku,
      status: "DRAFT",
      note: "Created as a draft. Add images in the admin, then ask me to publish it.",
    };
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const AGENT_TOOLS: ToolDefinition[] = [
  searchProductsTool,
  lowStockTool,
  listOrdersTool,
  getOrderTool,
  salesSummaryTool,
  findCustomerTool,
  listDiscountsTool,
  updatePriceTool,
  adjustStockTool,
  updateProductTool,
  createProductTool,
  createDiscountTool,
  toggleDiscountTool,
  updateOrderTool,
];

const BY_NAME = new Map(AGENT_TOOLS.map((t) => [t.name, t]));

export function getTool(name: string): ToolDefinition | undefined {
  return BY_NAME.get(name);
}

/** Only the tools this role may actually use are advertised to the model. */
export function toolSchemasFor(role: Role): ToolSchema[] {
  return AGENT_TOOLS.filter((t) => !t.permission || can(role, t.permission)).map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export function isMutating(name: string): boolean {
  return BY_NAME.get(name)?.mutating ?? false;
}

export function summariseCall(name: string, args: Record<string, unknown>): string {
  const tool = BY_NAME.get(name);
  if (!tool) return `Run ${name}`;
  try {
    return tool.summarise(args);
  } catch {
    return `Run ${name}`;
  }
}

/** Executes a tool after re-checking permission at call time. */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ToolResult> {
  const tool = BY_NAME.get(name);
  if (!tool) return { error: `Unknown tool "${name}".` };

  if (tool.permission && !can(ctx.role, tool.permission)) {
    return { error: `Your role (${ctx.role}) is not allowed to ${tool.permission}.` };
  }

  try {
    return await tool.execute(args, ctx);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
