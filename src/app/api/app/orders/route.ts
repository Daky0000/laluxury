import { minimumOrderProblem } from "@/lib/minimum-order";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { FulfillmentStatus, OrderStatus, PaymentStatus, type Prisma } from "@/generated/prisma";
import { getOptionalBearerUser, apiOptionsResponse, withApiAuth } from "@/lib/auth/bearer";
import { can, isStaff } from "@/lib/auth/rbac";
import { orderPath } from "@/lib/order-access";
import { availableOf, InsufficientStockError, reserveStock } from "@/lib/inventory";
import { cancelOrder, logOrderEvent, sweepStalePendingOrdersSoon, uniqueOrderNumber } from "@/lib/orders";
import { normalisePhone } from "@/lib/phone";
import { quoteShipping } from "@/lib/shipping";
import { recordRedemption, validateDiscount, type DiscountLine } from "@/lib/discounts";
import { getCommerceSettings } from "@/lib/settings";
import { getIntegrations, activePaystack } from "@/lib/integrations";
import { notifyOrder } from "@/lib/notify";
import { reconcilePendingPaymentsSoon } from "@/lib/checkout-payment";
import {
  chargeMobileMoney,
  detectGhanaMomoProvider,
  normaliseGhanaMomoPhone,
  MOMO_PROVIDER_LABELS,
  type MomoProvider,
} from "@/lib/paystack";
import { formatMoney } from "@/lib/money";

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
    lastName: z.string().trim().optional().default(""),
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
  deliveryType: z.enum(["delivery", "pickup"]).optional().default("delivery"),
  isPickup: z.boolean().optional(),
  shippingRateId: z.string().optional().nullable(),
  discountCode: z.string().trim().optional().nullable(),
  preorderDepositOption: z.enum(["full", "deposit_50"]).optional().nullable(),
  paymentMethod: z
    .enum(["direct_debit", "mobile_money", "bank_card"])
    .optional()
    .default("mobile_money"),
  momoPhone: z.string().trim().optional().nullable(),
  momoProvider: z.enum(["mtn", "vod", "atl"]).optional().nullable(),
  customerNote: z.string().trim().optional().nullable(),
  idempotencyKey: z.string().trim().optional().nullable(),
});


// ---------------------------------------------------------------------------
// GET /api/app/orders - List customer orders or staff recent store orders
// ---------------------------------------------------------------------------
export const GET = withApiAuth(async (request: Request) => {
  // Same heartbeat as the website: late MoMo approvals are caught in the background.
  reconcilePendingPaymentsSoon();
  const user = await getOptionalBearerUser();
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
  const skip = (page - 1) * limit;

  if (!user) {
    return NextResponse.json({ orders: [], pagination: { page: 1, limit, total: 0, totalPages: 0 } });
  }

  const isStaffMember = isStaff(user.role) && can(user.role, "orders:read");
  const statusParam = url.searchParams.get("status")?.trim();
  const paymentStatusParam = url.searchParams.get("paymentStatus")?.trim();
  const fulfillmentStatusParam = url.searchParams.get("fulfillmentStatus")?.trim();
  const q = url.searchParams.get("q")?.trim() || "";

  const where: Prisma.OrderWhereInput = isStaffMember ? {} : { userId: user.id };

  // Unknown filter values are ignored rather than handed to the database.
  const pick = <T extends string>(values: Record<string, T>, raw?: string): T | undefined => {
    const upper = raw?.toUpperCase();
    return upper && (Object.values(values) as string[]).includes(upper) ? (upper as T) : undefined;
  };
  const statusFilter = pick(OrderStatus, statusParam);
  const paymentFilter = pick(PaymentStatus, paymentStatusParam);
  const fulfillmentFilter = pick(FulfillmentStatus, fulfillmentStatusParam);
  if (statusFilter) where.status = statusFilter;
  if (paymentFilter) where.paymentStatus = paymentFilter;
  if (fulfillmentFilter) where.fulfillmentStatus = fulfillmentFilter;
  if (q) {
    where.OR = [
      { orderNumber: { contains: q.toUpperCase() } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
      { shippingAddress: { firstName: { contains: q, mode: "insensitive" } } },
      { shippingAddress: { lastName: { contains: q, mode: "insensitive" } } },
    ];
  }

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
        shippingRate: true,
        payments: { orderBy: { createdAt: "desc" } },
      },
    }),
  ]);

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      invoicePath: orderPath(o.orderNumber, "invoice"),
      status: o.status,
      paymentStatus: o.paymentStatus,
      fulfillmentStatus: o.fulfillmentStatus,
      paymentMethod: o.paymentMethod,
      currency: o.currency,
      email: o.email,
      phone: o.phone,
      customerNote: o.customerNote,
      staffNote: isStaffMember ? o.staffNote : null,
      depositAmount: o.depositAmount,
      balancePaidAt: o.balancePaidAt?.toISOString() || null,
      subtotal: o.subtotal,
      shippingTotal: o.shippingTotal,
      discountTotal: o.discountTotal,
      total: o.total,
      placedAt: o.placedAt.toISOString(),
      paidAt: o.paidAt?.toISOString() || null,
      trackingNumber: o.trackingNumber,
      trackingCompany: o.trackingCompany,
      shippingAddress: o.shippingAddress,
      shippingRate: o.shippingRate,
      payments: o.payments.map((p) => ({
        id: p.id,
        reference: p.reference,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        channel: p.channel,
        mobileMoneyNumber: p.mobileMoneyNumber,
        paidAt: p.paidAt?.toISOString() || null,
      })),
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
  let json = await request.json().catch(() => null);

  // Auto-harmonize customer and shipping address names so partial names don't fail checkout
  if (json && typeof json === "object") {
    const raw = json as Record<string, unknown>;
    const cust = raw.customer && typeof raw.customer === "object"
      ? { ...(raw.customer as Record<string, unknown>) }
      : {};
    const ship = raw.shippingAddress && typeof raw.shippingAddress === "object"
      ? { ...(raw.shippingAddress as Record<string, unknown>) }
      : {};

    const resolvedFirst = (cust.firstName || ship.firstName || user?.firstName || "").toString().trim();
    const resolvedLast = (cust.lastName || ship.lastName || user?.lastName || resolvedFirst || "Customer").toString().trim();

    if (resolvedFirst) {
      if (!cust.firstName || !cust.firstName.toString().trim()) cust.firstName = resolvedFirst;
      if (!ship.firstName || !ship.firstName.toString().trim()) ship.firstName = resolvedFirst;
    }
    if (resolvedLast) {
      if (!cust.lastName || !cust.lastName.toString().trim()) cust.lastName = resolvedLast;
      if (!ship.lastName || !ship.lastName.toString().trim()) ship.lastName = resolvedLast;
    }
    const isPickup =
      raw.deliveryType === "pickup" ||
      raw.isPickup === true ||
      (ship.line1 && ship.line1.toString().toLowerCase().includes("pickup")) ||
      (ship.line1 && ship.line1.toString().toLowerCase().includes("showroom"));

    if (isPickup) {
      if (!ship.line1 || !ship.line1.toString().trim()) {
        ship.line1 = "Noble Enclave Showroom (Self-Pickup)";
      }
      if (!ship.city || !ship.city.toString().trim()) {
        ship.city = "Accra";
      }
      if (!ship.region || !ship.region.toString().trim()) {
        ship.region = "Greater Accra";
      }
    }

    raw.customer = cust;
    raw.shippingAddress = ship;
    json = raw;
  }

  const parsed = checkoutSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid order details." },
      { status: 400 },
    );
  }

  const data = parsed.data;
  sweepStalePendingOrdersSoon();
  const cleanPhone = normalisePhone(data.customer.phone) || data.customer.phone;

  // Determine user id if authenticated or matching customer email/phone
  let userId = user?.id ?? null;
  let newAuthToken: string | null = null;
  let newAuthUser: {
    id: string;
    email: string | null;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
    role: "CUSTOMER" | "STAFF" | "MANAGER" | "ADMIN" | "OWNER";
    permissions: string[];
  } | null = null;

  if (!userId) {
    const existing = await db.user.findFirst({
      where: {
        OR: [
          { email: { equals: data.customer.email.toLowerCase().trim(), mode: "insensitive" } },
          ...(cleanPhone ? [{ phone: cleanPhone }] : []),
        ],
      },
      select: { id: true, role: true },
    });

    if (existing) {
      // Contact details typed at checkout prove nothing about who is typing
      // them, so an existing account is never signed in from here. The order
      // is filed under a matching customer account, but never a staff one.
      if (existing.role === "CUSTOMER") userId = existing.id;
    } else {
      // A brand-new account belongs to whoever just created it, so it is
      // safe to sign them straight in. The phone stays unverified.
      const customerUser = await db.user.create({
        data: {
          email: data.customer.email.toLowerCase().trim(),
          phone: cleanPhone,
          firstName: data.customer.firstName.trim() || "Customer",
          lastName: data.customer.lastName.trim() || data.customer.firstName.trim() || "Customer",
          role: "CUSTOMER",
        },
      });
      userId = customerUser.id;

      const { signSession } = await import("@/lib/auth/session");
      newAuthToken = await signSession({
        userId: customerUser.id,
        role: customerUser.role,
      });
      newAuthUser = {
        id: customerUser.id,
        email: customerUser.email,
        phone: customerUser.phone,
        firstName: customerUser.firstName,
        lastName: customerUser.lastName,
        role: customerUser.role,
        permissions: [],
      };
    }
  }

  // Idempotency protection: prevent duplicate orders if client retries
  const idempotencyKey =
    request.headers.get("x-idempotency-key") ||
    data.idempotencyKey ||
    null;

  // Scoped to the buyer so one shopper's key can never replay another's order.
  const scopedIdempotencyKey = idempotencyKey
    ? `app:${data.customer.email.toLowerCase().trim()}:${idempotencyKey}`.slice(0, 200)
    : null;

  const replayOrder = async () => {
    if (!scopedIdempotencyKey) return null;
    const existing = await db.order.findUnique({
      where: { idempotencyKey: scopedIdempotencyKey },
      include: { payments: { take: 1, orderBy: { createdAt: "desc" } } },
    });
    if (!existing) return null;
    return NextResponse.json({
      ok: true,
      order: {
        id: existing.id,
        orderNumber: existing.orderNumber,
        total: existing.total,
        currency: existing.currency,
        status: existing.status,
        placedAt: existing.createdAt.toISOString(),
        reference: existing.payments[0]?.reference || `${existing.orderNumber}-REF`,
      },
      message: "Order already placed (idempotent replay).",
    });
  };

  const replay = await replayOrder();
  if (replay) return replay;

  // Resolve variants from database (handling deduplicated IDs and product-level fallbacks)
  const uniqueVariantIds = Array.from(new Set(data.items.map((i) => i.variantId)));
  const variants = await db.variant.findMany({
    where: { id: { in: uniqueVariantIds } },
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

  const variantMap = new Map(variants.map((v) => [v.id, v]));

  // For any items whose variant wasn't found directly by ID, check if variantId is productId or productId-default
  const missingVariantIds = uniqueVariantIds.filter((id) => !variantMap.has(id));
  if (missingVariantIds.length > 0) {
    const candidateProductIds = missingVariantIds.map((id) => id.replace(/-default$/, ""));
    const fallbackVariants = await db.variant.findMany({
      where: {
        productId: { in: candidateProductIds },
        isActive: true,
      },
      include: {
        product: {
          include: {
            images: { take: 1, orderBy: { position: "asc" } },
            categories: { select: { categoryId: true } },
          },
        },
        inventory: true,
      },
      orderBy: { createdAt: "asc" },
    });

    for (const fv of fallbackVariants) {
      if (!variantMap.has(fv.id)) {
        variantMap.set(fv.id, fv);
      }
      for (const missingId of missingVariantIds) {
        if (
          missingId === fv.productId ||
          missingId === `${fv.productId}-default` ||
          missingId.startsWith(fv.productId)
        ) {
          variantMap.set(missingId, fv);
        }
      }
    }
  }

  // Identify any remaining missing items
  const stillMissingItems = data.items.filter((item) => !variantMap.has(item.variantId));
  if (stillMissingItems.length > 0) {
    const unavailableVariantIds = Array.from(new Set(stillMissingItems.map((i) => i.variantId)));
    return NextResponse.json(
      {
        error: "One or more products in your bag are no longer available.",
        unavailableVariantIds,
      },
      { status: 400 },
    );
  }

  // Only live products can be bought, exactly as on the web storefront.
  const unsellable = data.items.filter((item) => {
    const v = variantMap.get(item.variantId)!;
    return !v.isActive || v.product.status !== "ACTIVE";
  });
  if (unsellable.length > 0) {
    return NextResponse.json(
      {
        error: "One or more products in your bag are no longer available.",
        unavailableVariantIds: Array.from(new Set(unsellable.map((i) => i.variantId))),
      },
      { status: 400 },
    );
  }

  // Check inventory stock against what is free to sell (on hand minus held).
  for (const item of data.items) {
    const v = variantMap.get(item.variantId);
    if (!v) continue;
    const minimumProblem = minimumOrderProblem(v.product.title, item.quantity, v.product.minimumOrderQuantity);
    if (minimumProblem) return NextResponse.json({ error: minimumProblem }, { status: 400 });
    const inv = v.inventory;
    const tracked = Boolean(inv && inv.trackInventory && !inv.allowBackorder && !v.product.isPreorder);
    const available = inv ? Math.max(0, availableOf(inv)) : 0;
    if (tracked && available < item.quantity) {
      return NextResponse.json(
        { error: `Insufficient stock for "${v.product.title}". Only ${available} available.` },
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
    quoteShipping({
      region,
      subtotal,
      totalWeightGrams: data.items.reduce(
        (sum, item) => sum + (variantMap.get(item.variantId)!.weightGrams ?? 0) * item.quantity,
        0,
      ),
    }),
    getCommerceSettings(),
    getIntegrations().catch(() => null),
  ]);

  const activeMode = integrations?.paystack?.mode || settings?.paymentMode || "live";
  const paystackConfig = integrations ? activePaystack(integrations) : null;
  const hasValidKey = Boolean(
    paystackConfig?.secretKey?.trim().startsWith(activeMode === "test" ? "sk_test_" : "sk_live_"),
  );
  if (!hasValidKey) {
    return NextResponse.json(
      { error: "Online payment is temporarily unavailable. Please try again shortly." },
      { status: 503 },
    );
  }

  const storeFreeThreshold = settings?.freeShippingThreshold;
  const storeFreeApplies =
    storeFreeThreshold !== null &&
    storeFreeThreshold !== undefined &&
    subtotal >= storeFreeThreshold;

  const isPickupOrder =
    Boolean(data.isPickup) ||
    data.deliveryType === "pickup" ||
    data.shippingAddress.line1.toLowerCase().includes("pickup") ||
    data.shippingAddress.line1.toLowerCase().includes("showroom");

  let shippingTotal = 0;
  let appliedShippingRateId: string | null = null;

  if (isPickupOrder || storeFreeApplies) {
    shippingTotal = 0;
    appliedShippingRateId = null;
  } else if (data.shippingRateId) {
    const matched = shippingQuotes.find((q) => q.id === data.shippingRateId);
    if (matched) {
      shippingTotal = matched.price;
      appliedShippingRateId = matched.id;
    } else {
      return NextResponse.json(
        { error: "That delivery option is not available for this address." },
        { status: 400 },
      );
    }
  } else if (shippingQuotes.length > 0) {
    shippingTotal = shippingQuotes[0].price;
    appliedShippingRateId = shippingQuotes[0].id;
  } else {
    // No configured rate covers this address: refuse rather than ship free.
    return NextResponse.json(
      { error: "We don't deliver to that region yet. Choose showroom pickup or another address." },
      { status: 400 },
    );
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
  const hasPreorderItems = Array.from(variantMap.values()).some((v) => Boolean(v.product.isPreorder));
  const is50PercentDeposit = hasPreorderItems && data.preorderDepositOption === "deposit_50";
  const depositAmount = is50PercentDeposit ? Math.round(grandTotal * 0.5) : null;
  const chargeAmount = depositAmount ?? grandTotal;

  const orderNumber = await uniqueOrderNumber();
  const combinedCustomerNote = data.customerNote?.trim() || null;

  let order;
  try {
  order = await db.$transaction(async (tx) => {
    const shipping = await tx.address.create({
      data: {
        userId,
        firstName: data.shippingAddress.firstName?.trim() || data.customer.firstName.trim() || "Customer",
        lastName: data.shippingAddress.lastName?.trim() || data.customer.lastName.trim() || data.customer.firstName.trim() || "Customer",
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
        idempotencyKey: scopedIdempotencyKey,
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
  } catch (error) {
    // A concurrent retry with the same key won the insert; answer with its order.
    if ((error as { code?: string }).code === "P2002") {
      const winner = await replayOrder();
      if (winner) return winner;
    }
    throw error;
  }

  // Reserve stock for the items
  // Hold the goods for this attempt. If they cannot be held the order cannot
  // be honoured, so it is cancelled before anyone is asked to pay for it.
  try {
    await reserveStock(
      data.items.map((i) => ({ variantId: variantMap.get(i.variantId)!.id, quantity: i.quantity })),
      order.orderNumber,
      userId,
    );
  } catch (stockErr: unknown) {
    await db.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await logOrderEvent({
      orderId: order.id,
      type: "order.cancelled",
      message: "Stock could not be reserved at checkout.",
    }).catch(() => {});
    return NextResponse.json(
      {
        error:
          stockErr instanceof InsufficientStockError
            ? stockErr.message
            : "Some items just sold out. Please review your bag and try again.",
      },
      { status: 409 },
    );
  }

  // Convert and clear active cart so items are not left behind in customer's bag
  if (userId) {
    try {
      // A bag still waiting on payment from an earlier web checkout counts as
      // active too: it is emptied, but keeps its tie to that earlier order.
      const activeCarts = await db.cart.findMany({
        where: { userId, OR: [{ convertedOrderId: null }, { items: { some: {} } }] },
        select: { id: true, convertedOrderId: true },
      });
      if (activeCarts.length > 0) {
        const cartIds = activeCarts.map((c) => c.id);
        await db.cartItem.deleteMany({
          where: { cartId: { in: cartIds } },
        });
        await db.cart.updateMany({
          where: { id: { in: cartIds }, convertedOrderId: null },
          data: { convertedOrderId: order.id },
        });
      }
    } catch (cartErr) {
      console.warn("Cart conversion warning:", cartErr);
    }
  }

  // Same idempotent, transactional redemption the web uses. An order that
  // expires unpaid gives the use back (see cancelOrder).
  if (discountRecordId) {
    await recordRedemption({
      discountId: discountRecordId,
      orderId: order.id,
      userId,
      amount: discountTotal,
    }).catch((error) => console.error("[app.checkout] redemption", error));
  }

  const reference = `${order.orderNumber}-${Date.now().toString(36).toUpperCase()}`;

  // Check Paystack integration & Payment Mode
  let paymentUrl: string | null = null;
  let isTestOrder = false;
  let momoPushData: {
    status: string;
    reference: string;
    phone: string;
    provider: string;
    providerLabel: string;
    amountFormatted: string;
    displayText: string;
  } | null = null;

  const isDirectDebit = data.paymentMethod === "direct_debit";

  if (activeMode === "test") {
    isTestOrder = true;
  }

  if (isDirectDebit) {
    const rawMomoPhone = data.momoPhone || cleanPhone || "";
    const momoPhone = normaliseGhanaMomoPhone(rawMomoPhone);
    const provider: MomoProvider =
      data.momoProvider || detectGhanaMomoProvider(momoPhone);
    const providerLabel = MOMO_PROVIDER_LABELS[provider] || "Mobile Money";

    try {
        const chargeRes = await chargeMobileMoney({
          email: data.customer.email.toLowerCase().trim(),
          amount: chargeAmount,
          phone: momoPhone,
          provider,
          reference,
          metadata: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            source: "mobile_app",
            channel: "direct_debit",
            chargeScope: depositAmount ? "DEPOSIT_50" : "FULL",
          },
        });

        // A charge response is not proof of settlement. Store it as pending;
        // the webhook or verification endpoint is the only path to SUCCESS.
        await db.payment.create({
            data: {
              orderId: order.id,
              reference,
              provider: "paystack",
              channel: "mobile_money",
              mobileMoneyNumber: momoPhone,
              amount: chargeAmount,
              currency: order.currency,
              status: "PENDING",
            },
          });

        await notifyOrder(order.id, { kind: "order.placed" }).catch((err) =>
          console.error("[notify] order.placed SMS error:", err),
        );

        momoPushData = {
            status: chargeRes.status,
            reference,
            phone: momoPhone,
            provider,
            providerLabel,
            amountFormatted: formatMoney(chargeAmount, order.currency),
            displayText:
              chargeRes.display_text ||
              `A prompt has been sent to ${momoPhone}. Please check your approvals and enter your 4-digit MoMo PIN to authorize.`,
        };
    } catch (chargeErr) {
        await cancelOrder(order.id, "Payment gateway initialization failed.", null, { notify: false }).catch((err) =>
          console.error("[app.checkout] cancelOrder after charge error:", err),
        );
        const rawErr =
          chargeErr instanceof Error
            ? chargeErr.message
            : "Unable to initiate Mobile Money prompt. Please check your phone number or select another payment option.";
        const friendlyErr = rawErr.toLowerCase().includes("invalid key")
          ? "Online payment is temporarily unavailable. Please try again shortly."
          : rawErr.replace(/Paystack/gi, "payment provider");
        return NextResponse.json(
          {
            error: friendlyErr,
          },
          { status: 400 },
        );
    }
  } else {
    // Hosted Paystack card/momo checkout
    try {
      const { initializeTransaction } = await import("@/lib/paystack");
      const { env } = await import("@/lib/env");
      const init = await initializeTransaction({
        email: data.customer.email.toLowerCase().trim(),
        amount: chargeAmount,
        reference,
        callbackUrl: `${env.siteUrl()}/checkout/confirm?reference=${encodeURIComponent(reference)}`,
        currency: order.currency,
        channels: data.paymentMethod === "mobile_money" ? ["mobile_money"] : ["card"],
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          source: "mobile_app",
          isTest: isTestOrder,
        },
      });
      paymentUrl = init.authorization_url;

      await db.payment.create({
        data: {
          orderId: order.id,
          reference,
          provider: "paystack",
          channel: data.paymentMethod,
          amount: chargeAmount,
          currency: order.currency,
          status: "PENDING",
        },
      });

      // Send order placed notification via SMS and Email
      await notifyOrder(order.id, { kind: "order.placed" }).catch((err) =>
        console.error("[notify] order.placed hosted error:", err),
      );
    } catch (paystackErr) {
      await cancelOrder(order.id, "Payment gateway initialization failed.", null, { notify: false }).catch((err) =>
        console.error("[app.checkout] cancelOrder after paystack error:", err),
      );
      const rawErr =
        paystackErr instanceof Error
          ? paystackErr.message
          : "Unable to initialize payment.";
      const friendlyErr = rawErr.toLowerCase().includes("invalid key")
        ? "Online payment is temporarily unavailable. Please try again shortly."
        : rawErr.replace(/Paystack/gi, "payment provider");
      return NextResponse.json(
        {
          error: friendlyErr,
        },
        { status: 400 },
      );
    }
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
    momoPush: momoPushData,
    token: newAuthToken,
    user: newAuthUser,
  });
});
