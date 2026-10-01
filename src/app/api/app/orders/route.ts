import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOptionalBearerUser, apiOptionsResponse, withApiAuth } from "@/lib/auth/bearer";
import { isStaff } from "@/lib/auth/rbac";
import { generateOrderNumber } from "@/lib/slug";
import { reserveStock } from "@/lib/inventory";
import { logOrderEvent } from "@/lib/orders";
import { normalisePhone } from "@/lib/phone";

export const runtime = "nodejs";

export const OPTIONS = apiOptionsResponse;

const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        variantId: z.string().min(1, "variantId required"),
        quantity: z.number().int().min(1, "quantity must be at least 1"),
      }),
    )
    .min(1, "At least one item is required."),
  customer: z.object({
    firstName: z.string().trim().min(1, "First name is required."),
    lastName: z.string().trim().min(1, "Last name is required."),
    email: z.string().email("Valid email is required."),
    phone: z.string().min(1, "Phone number is required."),
  }),
  shippingAddress: z.object({
    firstName: z.string().trim().optional(),
    lastName: z.string().trim().optional(),
    phone: z.string().optional(),
    line1: z.string().trim().min(1, "Street address is required."),
    line2: z.string().trim().optional().nullable(),
    city: z.string().trim().min(1, "City is required."),
    region: z.string().trim().optional().default("Greater Accra"),
    postalCode: z.string().trim().optional().nullable(),
    country: z.string().trim().optional().default("GH"),
  }),
  paymentMethod: z.string().optional().default("pay_on_delivery"),
  customerNote: z.string().trim().optional().nullable(),
});

// ---------------------------------------------------------------------------
// GET /api/app/orders - List customer orders or staff recent store orders
// ---------------------------------------------------------------------------
export const GET = withApiAuth(async (request: Request) => {
  const user = await getOptionalBearerUser();
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
  const skip = (page - 1) * limit;

  if (!user) {
    return NextResponse.json({ orders: [], pagination: { page: 1, limit, total: 0, totalPages: 0 } });
  }

  const isStaffMember = isStaff(user.role);

  const where = isStaffMember ? {} : { userId: user.id };

  const [total, orders] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { placedAt: "desc" },
      include: {
        items: true,
        shippingAddress: true,
        payments: { take: 1, orderBy: { createdAt: "desc" } },
      },
    }),
  ]);

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      currency: o.currency,
      subtotal: o.subtotal,
      shippingTotal: o.shippingTotal,
      total: o.total,
      placedAt: o.placedAt.toISOString(),
      shippingAddress: o.shippingAddress,
      items: o.items.map((item) => ({
        id: item.id,
        variantId: item.variantId,
        productId: item.productId,
        productTitle: item.productTitle,
        variantTitle: item.variantTitle,
        sku: item.sku,
        imageUrl: item.imageUrl,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total,
      })),
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// ---------------------------------------------------------------------------
// POST /api/app/orders - Mobile Checkout & Order Creation
// ---------------------------------------------------------------------------
export const POST = withApiAuth(async (request: Request) => {
  const user = await getOptionalBearerUser();
  const json = await request.json().catch(() => null);
  const parsed = checkoutSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid order details." },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const cleanPhone = normalisePhone(data.customer.phone) || data.customer.phone;

  // Resolve variants from database
  const variantIds = data.items.map((i) => i.variantId);
  const variants = await db.variant.findMany({
    where: { id: { in: variantIds } },
    include: {
      product: {
        include: {
          images: { take: 1, orderBy: { position: "asc" } },
        },
      },
      inventory: true,
    },
  });

  if (variants.length !== variantIds.length) {
    return NextResponse.json(
      { error: "One or more products in your bag are no longer available." },
      { status: 400 },
    );
  }

  // Check inventory stock
  const variantMap = new Map(variants.map((v) => [v.id, v]));
  for (const item of data.items) {
    const v = variantMap.get(item.variantId);
    if (!v) continue;
    const onHand = v.inventory?.onHand ?? 0;
    const allowBackorder = Boolean(v.inventory?.allowBackorder || v.product.isPreorder);
    if (onHand < item.quantity && !allowBackorder) {
      return NextResponse.json(
        { error: `Insufficient stock for "${v.product.title}". Only ${onHand} available.` },
        { status: 400 },
      );
    }
  }

  // Calculate pricing
  let subtotal = 0;
  const lineItemsData = data.items.map((item) => {
    const v = variantMap.get(item.variantId)!;
    const lineTotal = v.price * item.quantity;
    subtotal += lineTotal;
    return {
      variantId: v.id,
      productId: v.productId,
      productTitle: v.product.title,
      variantTitle: v.title,
      sku: v.sku,
      imageUrl: v.product.images[0]?.url ?? null,
      isPreorder: Boolean(v.product.isPreorder),
      preorderLeadTime: v.product.preorderLeadTime ?? null,
      quantity: item.quantity,
      unitPrice: v.price,
      discountAllocated: 0,
      total: lineTotal,
    };
  });

  // Flat shipping for mobile (or free if over threshold)
  const shippingTotal = 2500; // standard delivery (minor units)
  const total = subtotal + shippingTotal;
  const orderNumber = generateOrderNumber();

  // Determine user id if authenticated or matching customer email/phone
  let userId = user?.id ?? null;
  if (!userId) {
    const existing = await db.user.findFirst({
      where: {
        OR: [
          { email: { equals: data.customer.email.toLowerCase(), mode: "insensitive" } },
          ...(cleanPhone ? [{ phone: cleanPhone }] : []),
        ],
      },
      select: { id: true },
    });
    if (existing) userId = existing.id;
  }

  const order = await db.$transaction(async (tx) => {
    const shipping = await tx.address.create({
      data: {
        userId,
        firstName: data.shippingAddress.firstName || data.customer.firstName,
        lastName: data.shippingAddress.lastName || data.customer.lastName,
        phone: data.shippingAddress.phone || cleanPhone,
        line1: data.shippingAddress.line1,
        line2: data.shippingAddress.line2 ?? null,
        city: data.shippingAddress.city,
        region: data.shippingAddress.region || "Greater Accra",
        postalCode: data.shippingAddress.postalCode ?? null,
        country: data.shippingAddress.country || "GH",
      },
    });

    const createdOrder = await tx.order.create({
      data: {
        orderNumber,
        userId,
        email: data.customer.email.toLowerCase().trim(),
        phone: cleanPhone,
        status: "PENDING",
        paymentStatus: "PENDING",
        hasPreorderItems: variants.some((v) => Boolean(v.product.isPreorder)),
        paymentMethod: data.paymentMethod,
        subtotal,
        discountTotal: 0,
        shippingTotal,
        taxTotal: 0,
        total,
        shippingAddressId: shipping.id,
        billingAddressId: shipping.id,
        customerNote: data.customerNote ?? null,
        items: {
          create: lineItemsData,
        },
      },
      include: {
        items: true,
        shippingAddress: true,
      },
    });

    return createdOrder;
  });

  // Reserve stock for the items
  try {
    await reserveStock(
      data.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      order.orderNumber,
      userId,
    );
  } catch (stockErr: unknown) {
    console.warn("Stock reservation warning:", stockErr);
  }

  const reference = `${order.orderNumber}-${Date.now().toString(36).toUpperCase()}`;

  // Check Paystack integration
  let paymentUrl: string | null = null;
  const isDirectMethod =
    data.paymentMethod === "pay_on_delivery" || data.paymentMethod === "direct_momo";

  try {
    const { getIntegrations, isReady } = await import("@/lib/integrations");
    const integrations = await getIntegrations();
    const paystackReady = isReady(integrations, "paystack");

    if (paystackReady && !isDirectMethod) {
      const { initializeTransaction } = await import("@/lib/paystack");
      const { env } = await import("@/lib/env");
      const init = await initializeTransaction({
        email: data.customer.email.toLowerCase().trim(),
        amount: order.total,
        reference,
        callbackUrl: `${env.siteUrl()}/checkout/confirm?reference=${encodeURIComponent(reference)}`,
        currency: order.currency,
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          source: "mobile_app",
        },
      });
      paymentUrl = init.authorization_url;
    }
  } catch (paystackErr) {
    console.warn("Paystack mobile init notice:", paystackErr);
  }

  // Create payment record
  await db.payment.create({
    data: {
      orderId: order.id,
      reference,
      provider: paymentUrl ? "paystack" : "direct",
      channel: data.paymentMethod,
      amount: order.total,
      currency: order.currency,
      status: "PENDING",
    },
  });

  // Log order placed event
  await logOrderEvent({
    orderId: order.id,
    type: "order.placed",
    message: `Mobile order ${order.orderNumber} placed via ${data.paymentMethod}. Total: ${total}.${paymentUrl ? " Paystack transaction initialized." : ""}`,
    actorId: userId,
  });

  return NextResponse.json({
    ok: true,
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      total: order.total,
      currency: order.currency,
      status: order.status,
      placedAt: order.placedAt.toISOString(),
      itemCount: lineItemsData.length,
      reference,
    },
    paymentUrl,
  });
});
