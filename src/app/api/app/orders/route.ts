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
import { getIntegrations, isReady, activePaystack } from "@/lib/integrations";
import { notifyOrder } from "@/lib/notify";
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
  shippingRateId: z.string().optional().nullable(),
  discountCode: z.string().trim().optional().nullable(),
  preorderDepositOption: z.enum(["full", "deposit_50"]).optional().nullable(),
  paymentMethod: z.string().optional().default("momo_push"),
  momoPhone: z.string().trim().optional().nullable(),
  momoProvider: z.enum(["mtn", "vod", "tgo"]).optional().nullable(),
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
  let json = await request.json().catch(() => null);

  // Auto-harmonize customer and shipping address names so partial names don't fail checkout
  if (json && typeof json === "object") {
    const raw = json as Record<string, any>;
    const cust = (raw.customer && typeof raw.customer === "object") ? { ...raw.customer } : {};
    const ship = (raw.shippingAddress && typeof raw.shippingAddress === "object") ? { ...raw.shippingAddress } : {};

    const resolvedFirst = (cust.firstName || ship.firstName || user?.firstName || "").toString().trim();
    const resolvedLast = (cust.lastName || ship.lastName || user?.lastName || resolvedFirst || "Customer").toString().trim();

    if (resolvedFirst) {
      if (!cust.firstName || !cust.firstName.toString().trim()) cust.firstName = resolvedFirst;
      if (!ship.firstName || !ship.firstName.toString().trim()) ship.firstName = resolvedFirst;
    }
    if (!cust.lastName || !cust.lastName.toString().trim()) cust.lastName = resolvedLast;
    if (!ship.lastName || !ship.lastName.toString().trim()) ship.lastName = resolvedLast;

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
    let customerUser = await db.user.findFirst({
      where: {
        OR: [
          { email: { equals: data.customer.email.toLowerCase().trim(), mode: "insensitive" } },
          ...(cleanPhone ? [{ phone: cleanPhone }] : []),
        ],
      },
    });

    if (!customerUser) {
      // Auto-create customer account using their phone and name
      customerUser = await db.user.create({
        data: {
          email: data.customer.email.toLowerCase().trim(),
          phone: cleanPhone,
          firstName: data.customer.firstName.trim() || "Customer",
          lastName: data.customer.lastName.trim() || data.customer.firstName.trim() || "Customer",
          role: "CUSTOMER",
          phoneVerified: new Date(),
        },
      });
    }

    userId = customerUser.id;

    // Issue bearer session token so the app can automatically sign them in
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

  // Check inventory stock
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
  const hasPreorderItems = Array.from(variantMap.values()).some((v) => Boolean(v.product.isPreorder));
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
  let momoPushData: {
    status: string;
    reference: string;
    phone: string;
    provider: string;
    providerLabel: string;
    amountFormatted: string;
    displayText: string;
  } | null = null;

  const isDirectMethod =
    data.paymentMethod === "pay_on_delivery" || data.paymentMethod === "direct_momo";
  const isMomoPush = data.paymentMethod === "momo_push";

  const activeMode = settings?.paymentMode || integrations?.paystack?.mode || "live";
  const paystackReady = integrations ? isReady(integrations, "paystack") : false;
  const paystackConfig = integrations ? activePaystack(integrations) : null;

  if (activeMode === "test") {
    isTestOrder = true;
  }

  if (isMomoPush) {
    const rawMomoPhone = data.momoPhone || cleanPhone || "";
    const momoPhone = normaliseGhanaMomoPhone(rawMomoPhone);
    const provider: MomoProvider =
      data.momoProvider || detectGhanaMomoProvider(momoPhone);
    const providerLabel = MOMO_PROVIDER_LABELS[provider] || "Mobile Money";

    if (isTestOrder || !paystackConfig?.secretKey) {
      // Test simulation or sandbox mode without live keys
      await db.payment.create({
        data: {
          orderId: order.id,
          reference,
          provider: "test_simulation",
          channel: "mobile_money",
          mobileMoneyNumber: momoPhone,
          amount: chargeAmount,
          currency: order.currency,
          status: "PENDING",
        },
      });

      // Send Order Placed notification via SMS & Email
      await notifyOrder(order.id, { kind: "order.placed" }).catch((err) =>
        console.error("[notify] order.placed SMS error:", err),
      );

      momoPushData = {
        status: "pay_offline",
        reference,
        phone: momoPhone,
        provider,
        providerLabel,
        amountFormatted: formatMoney(chargeAmount, order.currency),
        displayText: `[Test Simulation] MoMo PIN prompt (${formatMoney(chargeAmount, order.currency)}) sent to ${momoPhone} (${providerLabel}). Enter any 4-digit PIN on your phone to authorize.`,
      };
    } else {
      // Live / Test Paystack Charge API
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
            channel: "momo_push",
            chargeScope: depositAmount ? "DEPOSIT_50" : "FULL",
          },
        });

        if (chargeRes.status === "success") {
          // Immediately authorized
          await db.payment.create({
            data: {
              orderId: order.id,
              reference,
              provider: "paystack",
              channel: "mobile_money",
              mobileMoneyNumber: momoPhone,
              amount: chargeAmount,
              currency: order.currency,
              status: "SUCCESS",
              paidAt: new Date(),
            },
          });

          await db.order.update({
            where: { id: order.id },
            data: {
              status: "PAID",
              paymentStatus: "SUCCESS",
              paidAt: new Date(),
            },
          });

          // Send payment confirmed SMS + Email receipt
          await notifyOrder(order.id, {
            kind: "payment.received",
            reference,
            channel: providerLabel,
          }).catch((err) => console.error("[notify] payment.received error:", err));

          momoPushData = {
            status: "success",
            reference,
            phone: momoPhone,
            provider,
            providerLabel,
            amountFormatted: formatMoney(chargeAmount, order.currency),
            displayText: `Payment of ${formatMoney(chargeAmount, order.currency)} approved!`,
          };
        } else {
          // Handset prompt pushed (pay_offline or send_otp)
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

          // Send order placed notice with tracking and receipt links
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
              `A prompt has been sent to ${momoPhone}. Please enter your 4-digit MoMo PIN on your phone screen to authorize. (For MTN, you can also dial *170# > 6 > 3).`,
          };
        }
      } catch (chargeErr) {
        return NextResponse.json(
          {
            error:
              chargeErr instanceof Error
                ? chargeErr.message
                : "Unable to initiate Mobile Money prompt. Please check your phone number or select another payment option.",
          },
          { status: 400 },
        );
      }
    }
  } else if (isDirectMethod) {
    // Direct settlement or pay on delivery
    await db.payment.create({
      data: {
        orderId: order.id,
        reference,
        provider: "direct",
        channel: data.paymentMethod,
        amount: chargeAmount,
        currency: order.currency,
        status: "PENDING",
      },
    });

    // Send order placed SMS + Email
    await notifyOrder(order.id, { kind: "order.placed" }).catch((err) =>
      console.error("[notify] order.placed direct SMS error:", err),
    );
  } else {
    // Hosted Paystack card/momo checkout
    if (!paystackReady && !isTestOrder) {
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
        callbackUrl: `${env.siteUrl()}/checkout/confirm?reference=${encodeURIComponent(reference)}${isTestOrder ? "&mode=test" : ""}`,
        currency: order.currency,
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
          channel: "paystack_hosted",
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

