import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOptionalBearerUser, apiOptionsResponse, withApiAuth } from "@/lib/auth/bearer";
import { isStaff } from "@/lib/auth/rbac";
import { generateOrderNumber } from "@/lib/slug";
import { reserveStock } from "@/lib/inventory";
import { logOrderEvent } from "@/lib/orders";
import { normalisePhone } from "@/lib/phone";
import { quoteShipping } from "@/lib/shipping";
import { validateDiscount, type DiscountLine } from "@/lib/discounts";
import { getSettings } from "@/lib/settings";
import { getIntegrations, isReady } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  shippingRateId: z.string().optional().nullable(),
  discountCode: z.string().trim().optional().nullable(),
  preorderDepositOption: z.enum(["full", "deposit_50"]).optional().nullable(),
  paymentMethod: z.string().optional().default("pay_on_delivery"),
  customerNote: z.string().trim().optional().nullable(),
  idempotencyKey: z.string().trim().optional().nullable(),
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

  // Idempotency protection: prevent duplicate orders if client retries
  const idempotencyKey =
    request.headers.get("x-idempotency-key") ||
    data.idempotencyKey ||
    null;

  if (idempotencyKey) {
    const recentDuplicate = await db.order.findFirst({
      where: {
        email: data.customer.email.toLowerCase().trim(),
        customerNote: { contains: `[idempotency:${idempotencyKey}]` },
        createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
      },
      include: {
        items: true,
        payments: { take: 1, orderBy: { createdAt: "desc" } },
      },
    });

    if (recentDuplicate) {
      return NextResponse.json({
        ok: true,
        order: {
          id: recentDuplicate.id,
          orderNumber: recentDuplicate.orderNumber,
          total: recentDuplicate.total,
          currency: recentDuplicate.currency,
          status: recentDuplicate.status,
          placedAt: recentDuplicate.createdAt.toISOString(),
          reference: recentDuplicate.payments[0]?.reference || `${recentDuplicate.orderNumber}-REF`,
        },
        message: "Order already placed (idempotent replay).",
      });
    }
  }

  // Resolve variants from database
  const variantIds = data.items.map((i) => i.variantId);
  const variants = await db.variant.findMany({
    where: { id: { in: variantIds } },
    include: {
      product: {
        include: {
          images: { take: 1, orderBy: { position: "asc" } },
          categories: { select: { categoryId: true } },
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

  // Calculate Subtotal
  let subtotal = 0;
  for (const item of data.items) {
    const v = variantMap.get(item.variantId)!;
    subtotal += v.price * item.quantity;
  }

  // Authoritative shipping calculation via unified shipping engine
  const region = data.shippingAddress.region || "Greater Accra";
  const [shippingQuotes, settings, integrations] = await Promise.all([
    quoteShipping({ region, subtotal, totalWeightGrams: 0 }).catch(() => []),
    getSettings().catch(() => null),
    getIntegrations().catch(() => null),
  ]);

  const storeFreeThreshold = settings?.freeShippingThreshold;
  const storeFreeApplies =
    storeFreeThreshold !== null &&
    storeFreeThreshold !== undefined &&
    subtotal >= storeFreeThreshold;

  let shippingTotal = 0;
  let appliedShippingRateId: string | null = null;

  if (storeFreeApplies) {
    shippingTotal = 0;
  } else if (data.shippingRateId) {
    const matched = shippingQuotes.find((q) => q.id === data.shippingRateId);
    if (matched) {
      shippingTotal = matched.price;
      appliedShippingRateId = matched.id;
    } else {
      const rate = await db.shippingRate.findUnique({
        where: { id: data.shippingRateId },
      }).catch(() => null);
      if (rate && rate.isActive) {
        shippingTotal =
          rate.freeAboveSubtotal && subtotal >= rate.freeAboveSubtotal ? 0 : rate.price;
        appliedShippingRateId = rate.id;
      } else {
        shippingTotal = shippingQuotes[0]?.price ?? 0;
        appliedShippingRateId = shippingQuotes[0]?.id ?? null;
      }
    }
  } else if (shippingQuotes.length > 0) {
    shippingTotal = shippingQuotes[0].price;
    appliedShippingRateId = shippingQuotes[0].id;
  } else {
    shippingTotal = 0;
  }

  // Calculate discount if promo code was provided
  let discountTotal = 0;
  let allocation: number[] = data.items.map(() => 0);
  let discountRecordId: string | null = null;

  if (data.discountCode) {
    const discountLines: DiscountLine[] = data.items.map((item) => {
      const v = variantMap.get(item.variantId)!;
      return {
        variantId: v.id,
        productId: v.productId,
        categoryIds: v.product.categories.map((c) => c.categoryId),
        quantity: item.quantity,
        unitPrice: v.price,
      };
    });

    const val = await validateDiscount(data.discountCode, {
      lines: discountLines,
      subtotal,
      shippingTotal,
      userId,
      email: data.customer.email.toLowerCase().trim(),
    });

    if (!val.ok) {
      return NextResponse.json({ error: val.reason }, { status: 400 });
    }

    discountTotal = val.result.amount;
    allocation = val.result.allocation;
    if (val.result.freeShipping) {
      shippingTotal = 0;
    }
    discountRecordId = val.result.discount.id;
  }

  // Prepare line items
  const lineItemsData = data.items.map((item, idx) => {
    const v = variantMap.get(item.variantId)!;
    const lineTotal = v.price * item.quantity;
    const allocated = allocation[idx] || 0;
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
      discountAllocated: allocated,
      total: lineTotal - allocated,
    };
  });

  const grandTotal = Math.max(0, subtotal - discountTotal) + shippingTotal;
  const hasPreorderItems = variants.some((v) => Boolean(v.product.isPreorder));
  const is50PercentDeposit = hasPreorderItems && data.preorderDepositOption === "deposit_50";
  const depositAmount = is50PercentDeposit ? Math.round(grandTotal * 0.5) : null;
  const chargeAmount = depositAmount ?? grandTotal;

  const orderNumber = generateOrderNumber();
  const noteParts = [data.customerNote?.trim()];
  if (idempotencyKey) {
    noteParts.push(`[idempotency:${idempotencyKey}]`);
  }
  const combinedCustomerNote = noteParts.filter(Boolean).join(" ") || null;

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
        hasPreorderItems,
        paymentMethod: data.paymentMethod,
        depositAmount,
        subtotal,
        discountTotal,
        shippingTotal,
        taxTotal: 0,
        total: grandTotal,
        shippingAddressId: shipping.id,
        billingAddressId: shipping.id,
        shippingRateId: appliedShippingRateId,
        customerNote: combinedCustomerNote,
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

  // Increment discount usage if promo code applied
  if (discountRecordId) {
    await db.discount.update({
      where: { id: discountRecordId },
      data: { timesUsed: { increment: 1 } },
    }).catch(() => {});

    await db.discountRedemption.create({
      data: {
        discountId: discountRecordId,
        orderId: order.id,
        userId,
        amount: discountTotal,
      },
    }).catch(() => {});
  }


  // Clear or convert user's active server cart on successful order
  if (userId) {
    const activeCart = await db.cart.findFirst({
      where: { userId, convertedOrderId: null },
    });
    if (activeCart) {
      await db.cart.update({
        where: { id: activeCart.id },
        data: { convertedOrderId: order.id },
      }).catch(() => {});
    }
  }

  const reference = `${order.orderNumber}-${Date.now().toString(36).toUpperCase()}`;

  // Check Paystack integration & Payment Mode
  let paymentUrl: string | null = null;
  let isTestOrder = false;
  const isDirectMethod =
    data.paymentMethod === "pay_on_delivery" || data.paymentMethod === "direct_momo";

  const activeMode = settings?.paymentMode || integrations?.paystack?.mode || "live";
  const paystackReady = integrations ? isReady(integrations, "paystack") : false;

  if (activeMode === "test") {
    isTestOrder = true;
    if (paystackReady && !isDirectMethod) {
      try {
        const { initializeTransaction } = await import("@/lib/paystack");
        const { env } = await import("@/lib/env");
        const init = await initializeTransaction({
          email: data.customer.email.toLowerCase().trim(),
          amount: chargeAmount,
          reference,
          callbackUrl: `${env.siteUrl()}/checkout/confirm?reference=${encodeURIComponent(reference)}&mode=test`,
          currency: order.currency,
          metadata: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            source: "mobile_app",
            isTest: true,
          },
        });
        paymentUrl = init.authorization_url;
      } catch (paystackErr) {
        console.warn("Paystack test sandbox notice:", paystackErr);
      }
    }
  } else if (!isDirectMethod) {
    if (!paystackReady) {
      return NextResponse.json(
        {
          error:
            "Paystack is not yet configured for live payments. Please select Direct MoMo or Pay on Delivery, or switch to Test Mode in Settings.",
        },
        { status: 400 },
      );
    }
    try {
      const { initializeTransaction } = await import("@/lib/paystack");
      const { env } = await import("@/lib/env");
      const init = await initializeTransaction({
        email: data.customer.email.toLowerCase().trim(),
        amount: chargeAmount,
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
    } catch (paystackErr) {
      return NextResponse.json(
        {
          error:
            paystackErr instanceof Error
              ? paystackErr.message
              : "Unable to initialize Paystack transaction.",
        },
        { status: 400 },
      );
    }
  }

  // Create payment record for the charge amount (full or 50% deposit)
  const initialPaymentStatus = isTestOrder && !paymentUrl ? "SUCCESS" : "PENDING";
  await db.payment.create({
    data: {
      orderId: order.id,
      reference,
      provider: paymentUrl ? "paystack" : isTestOrder ? "test_simulation" : "direct",
      channel: isTestOrder && !paymentUrl ? "test_sandbox" : data.paymentMethod,
      amount: chargeAmount,
      currency: order.currency,
      status: initialPaymentStatus,
    },
  });

  // If in test mode with instant simulation, mark order paid
  if (isTestOrder && !paymentUrl) {
    await db.order.update({
      where: { id: order.id },
      data: { status: "PAID", paymentStatus: "SUCCESS", paidAt: new Date() },
    });
  }

  // Log order placed event
  await logOrderEvent({
    orderId: order.id,
    type: "order.placed",
    message: `Mobile order ${order.orderNumber} placed via ${data.paymentMethod}${isTestOrder ? " [TEST MODE]" : ""}. Total: ${grandTotal}${depositAmount ? ` (50% deposit: ${depositAmount})` : ""}.${paymentUrl ? " Paystack transaction initialized." : ""}`,
    actorId: userId,
  });

  return NextResponse.json({
    ok: true,
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      subtotal: order.subtotal,
      discountTotal: order.discountTotal,
      shippingTotal: order.shippingTotal,
      total: order.total,
      depositAmount: order.depositAmount,
      currency: order.currency,
      status: order.status,
      placedAt: order.placedAt.toISOString(),
      itemCount: lineItemsData.length,
      reference,
    },
    isTestOrder,
    paymentUrl,
  });
});

