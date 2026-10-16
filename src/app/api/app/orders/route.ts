import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { FulfillmentStatus, OrderStatus, PaymentStatus, type Prisma } from "@/generated/prisma";
import { getOptionalBearerUser, apiOptionsResponse, withApiAuth } from "@/lib/auth/bearer";
import { can, isStaff } from "@/lib/auth/rbac";
import { orderAccessToken, orderPath } from "@/lib/order-access";
import { InsufficientStockError } from "@/lib/inventory";
import { createOrderFromCart, logOrderEvent } from "@/lib/orders";
import { normalisePhone } from "@/lib/phone";
import { quoteShipping } from "@/lib/shipping";
import { validateDiscount, type DiscountLine } from "@/lib/discounts";
import { getCommerceSettings } from "@/lib/settings";
import { pickupAddressLines } from "@/lib/pickup-locations";
import { activePaystack, getIntegrations } from "@/lib/integrations";
import { createCheckoutCart, toDiscountLines } from "@/lib/cart";
import {
  checkoutUnavailableReason,
  reconcilePendingPaymentsSoon,
  startCheckoutPayment,
} from "@/lib/checkout-payment";
import { detectGhanaMomoProvider, normaliseGhanaMomoPhone } from "@/lib/paystack";
import { formatMoney } from "@/lib/money";
import { rateLimitResponse, requestAddress } from "@/lib/rate-limit";

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
  pickupLocationId: z.string().optional().nullable(),
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
//
// The app sends its lines; everything else (prices, stock, delivery, codes,
// deposits, payment) runs through the same services as the web checkout:
// `createOrderFromCart` and `startCheckoutPayment`. Nothing is priced here.
// ---------------------------------------------------------------------------
export const POST = withApiAuth(async (request: Request) => {
  const user = await getOptionalBearerUser();
  let json = await request.json().catch(() => null);

  // Fill names from the account or the other block, so partial names don't fail checkout.
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
    // Pickup only when the app says so. The words in an address line never
    // decide it (a "Showroom Road" address is still a delivery).
    if (raw.deliveryType === "pickup" || raw.isPickup === true) {
      if (!ship.line1 || !ship.line1.toString().trim()) ship.line1 = "Pickup";
      if (!ship.city || !ship.city.toString().trim()) ship.city = "Accra";
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
  const email = data.customer.email.toLowerCase().trim();
  const cleanPhone = normalisePhone(data.customer.phone);
  if (!cleanPhone) {
    return NextResponse.json(
      { error: "Enter a Ghanaian number like 024 000 0000, or one from elsewhere with its country code." },
      { status: 400 },
    );
  }

  const unavailable = await checkoutUnavailableReason();
  if (unavailable) return NextResponse.json({ error: unavailable }, { status: 503 });

  // Only networks on the store's direct list get a phone prompt. A network
  // taken off it (or an older app build asking anyway) finishes on Paystack's
  // page, which the app already opens when no prompt comes back.
  const settings = await getCommerceSettings();
  const momoNumber = data.momoPhone || cleanPhone;
  const requestedNetwork = data.momoProvider ?? detectGhanaMomoProvider(momoNumber);
  const paymentMethod =
    data.paymentMethod === "direct_debit" && !settings.momoDirectNetworks.includes(requestedNetwork)
      ? "mobile_money"
      : data.paymentMethod;
  const isDirectDebit = paymentMethod === "direct_debit";
  if (isDirectDebit && normaliseGhanaMomoPhone(momoNumber).length < 10) {
    return NextResponse.json(
      { error: "Enter the MTN, Telecel or AirtelTigo MoMo number that will pay, like 024 000 0000." },
      { status: 400 },
    );
  }

  // Staff raising an order for a customer from the app (the "New order"
  // screen) are not the buyer: the order is the customer's, and it waits for
  // its payment instead of expiring like a shopper's checkout.
  const raisedByStaff = Boolean(user && isStaff(user.role) && can(user.role, "orders:write"));

  // Checkout sends payment prompts to phones and holds stock: limited per
  // address, per contact number and per paying wallet.
  const limited = raisedByStaff ? null : rateLimitResponse([
    { key: `checkout-ip:${await requestAddress()}`, limit: 12, windowMs: 15 * 60 * 1000 },
    { key: `checkout-phone:${cleanPhone}`, limit: 6, windowMs: 15 * 60 * 1000 },
    ...(isDirectDebit
      ? [{ key: `checkout-momo:${normaliseGhanaMomoPhone(momoNumber)}`, limit: 5, windowMs: 15 * 60 * 1000 }]
      : []),
  ]);
  if (limited) return limited;

  // The signed-in buyer owns the order. Contact details typed at checkout
  // prove nothing about who is typing them, so they never pick an account,
  // and no account or session is created here: a guest's paid order makes
  // their account afterwards (`markOrderPaid`), with a sign-in SMS.
  const userId = raisedByStaff ? null : (user?.id ?? null);
  const discountUserId = userId
    ? null
    : ((
        await db.user.findFirst({
          where: { OR: [{ phone: cleanPhone }, { email }], role: "CUSTOMER" },
          select: { id: true },
        })
      )?.id ?? null);

  // Idempotency protection: prevent duplicate orders if client retries
  const idempotencyKey =
    request.headers.get("x-idempotency-key") ||
    data.idempotencyKey ||
    null;

  // Scoped to the buyer so one shopper's key can never replay another's order.
  const scopedIdempotencyKey = idempotencyKey
    ? `app:${email}:${idempotencyKey}`.slice(0, 200)
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
        depositAmount: existing.depositAmount,
        currency: existing.currency,
        status: existing.status,
        placedAt: existing.createdAt.toISOString(),
        reference: existing.payments[0]?.reference ?? null,
      },
      accessToken: orderAccessToken(existing.orderNumber),
      message: "Order already placed (idempotent replay).",
    });
  };

  const replay = await replayOrder();
  if (replay) return replay;

  // Resolve the app's ids to live variants: a variant id, or a product id
  // (optionally with "-default") for single-variant products.
  const requestedIds = Array.from(new Set(data.items.map((i) => i.variantId)));
  const direct = await db.variant.findMany({
    where: { id: { in: requestedIds } },
    select: { id: true, isActive: true, product: { select: { status: true } } },
  });
  const resolved = new Map(direct.map((v) => [v.id, v]));
  const missing = requestedIds.filter((id) => !resolved.has(id));
  if (missing.length > 0) {
    const fallback = await db.variant.findMany({
      where: { productId: { in: missing.map((id) => id.replace(/-default$/, "")) }, isActive: true },
      select: { id: true, productId: true, isActive: true, product: { select: { status: true } } },
      orderBy: { createdAt: "asc" },
    });
    for (const id of missing) {
      const productId = id.replace(/-default$/, "");
      const match = fallback.find((v) => v.productId === productId);
      if (match) resolved.set(id, match);
    }
  }

  const unavailableVariantIds = requestedIds.filter((id) => {
    const v = resolved.get(id);
    return !v || !v.isActive || v.product.status !== "ACTIVE";
  });
  if (unavailableVariantIds.length > 0) {
    return NextResponse.json(
      { error: "One or more products in your bag are no longer available.", unavailableVariantIds },
      { status: 400 },
    );
  }

  const lines = data.items.map((item) => ({ variantId: resolved.get(item.variantId)!.id, quantity: item.quantity }));
  const cart = await createCheckoutCart({ lines, email, discountCode: data.discountCode });
  const dropCart = () => db.cart.delete({ where: { id: cart.id } }).catch(() => {});

  // A code the shopper typed is checked up front so they hear why it did not
  // apply, instead of being charged full price without a word.
  if (data.discountCode) {
    const quote = await quoteShipping({
      region: data.shippingAddress.region,
      subtotal: cart.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
    });
    const lineDiscounts: DiscountLine[] = toDiscountLines(cart);
    const check = await validateDiscount(data.discountCode, {
      lines: lineDiscounts,
      subtotal: cart.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
      shippingTotal: quote[0]?.price ?? 0,
      userId: userId ?? discountUserId,
      email,
    });
    if (!check.ok) {
      await dropCart();
      return NextResponse.json({ error: check.reason }, { status: 400 });
    }
  }

  const isPickup = data.isPickup === true || data.deliveryType === "pickup";
  const pickupLocation = isPickup
    ? (settings.pickupLocations.find((l) => l.id === data.pickupLocationId) ?? settings.pickupLocations[0] ?? null)
    : null;
  const shippingAddress = {
    firstName: data.shippingAddress.firstName?.trim() || data.customer.firstName.trim() || "Customer",
    lastName:
      data.shippingAddress.lastName?.trim() || data.customer.lastName.trim() || data.customer.firstName.trim() || "Customer",
    phone: normalisePhone(data.shippingAddress.phone ?? "") || cleanPhone,
    ...(pickupLocation
      ? { ...pickupAddressLines(pickupLocation), city: pickupLocation.city, region: pickupLocation.region }
      : {
          line1: data.shippingAddress.line1,
          line2: data.shippingAddress.line2 ?? null,
          city: data.shippingAddress.city,
          region: data.shippingAddress.region || "Greater Accra",
        }),
    postalCode: data.shippingAddress.postalCode ?? null,
    country: "GH",
  };

  let order;
  try {
    order = await createOrderFromCart({
      cart,
      email,
      phone: cleanPhone,
      userId,
      discountUserId,
      shippingAddress,
      shippingRateId: isPickup ? null : (data.shippingRateId ?? null),
      pickup: isPickup,
      customerNote: data.customerNote?.trim() || null,
      paymentMethod,
      payDeposit: data.preorderDepositOption === "deposit_50",
      source: raisedByStaff ? "console" : "app",
      idempotencyKey: scopedIdempotencyKey,
    });
  } catch (error) {
    await dropCart();
    // A concurrent retry with the same key won the insert; answer with its order.
    if ((error as { code?: string }).code === "P2002") {
      const winner = await replayOrder();
      if (winner) return winner;
    }
    if (error instanceof InsufficientStockError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "We could not place that order." },
      { status: 400 },
    );
  }

  let started;
  try {
    started = await startCheckoutPayment(order, {
      method: paymentMethod,
      momoPhone: isDirectDebit ? momoNumber : null,
      network: isDirectDebit ? requestedNetwork : null,
      source: "mobile_app",
    });
  } catch (error) {
    const rawErr = error instanceof Error ? error.message : "Unable to initialize payment.";
    const friendlyErr = rawErr.toLowerCase().includes("invalid key")
      ? "Online payment is temporarily unavailable. Please try again shortly."
      : rawErr.replace(/Paystack/gi, "payment provider");
    return NextResponse.json({ error: friendlyErr }, { status: 400 });
  }

  // Payment is under way: the app's synced bag for this account has become this order.
  if (userId) {
    try {
      // A bag still waiting on payment from an earlier web checkout counts as
      // active too: it is emptied, but keeps its tie to that earlier order.
      const activeCarts = await db.cart.findMany({
        where: { userId, OR: [{ convertedOrderId: null }, { items: { some: {} } }] },
        select: { id: true },
      });
      if (activeCarts.length > 0) {
        const cartIds = activeCarts.map((c) => c.id);
        await db.cartItem.deleteMany({ where: { cartId: { in: cartIds } } });
        await db.cart.updateMany({
          where: { id: { in: cartIds }, convertedOrderId: null },
          data: { convertedOrderId: order.id },
        });
      }
    } catch (cartErr) {
      console.warn("Cart conversion warning:", cartErr);
    }
  }

  const isTestOrder = activePaystack(await getIntegrations()).mode === "test";

  await logOrderEvent({
    orderId: order.id,
    type: "order.placed",
    message: `${raisedByStaff ? "Order raised by staff in the app" : "Mobile order"} ${order.orderNumber} placed via ${paymentMethod}${isTestOrder ? " [TEST MODE]" : ""}. Total: ${formatMoney(order.total, order.currency)}${order.depositAmount ? ` (deposit: ${formatMoney(order.depositAmount, order.currency)})` : ""}.`,
    actorId: raisedByStaff ? (user?.id ?? null) : userId,
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
      status: started.kind === "free" ? "PAID" : order.status,
      placedAt: order.placedAt.toISOString(),
      itemCount: order.items.length,
      reference: started.reference,
    },
    // Opens this order (tracking, MoMo resend) without an account.
    accessToken: orderAccessToken(order.orderNumber),
    isTestOrder,
    paid: started.kind === "free",
    paymentUrl: started.kind === "hosted" ? started.url : null,
    momoPush:
      started.kind === "prompt"
        ? {
            status: started.status,
            reference: started.reference,
            phone: started.phone,
            provider: started.provider,
            providerLabel: started.providerLabel,
            amountFormatted: formatMoney(started.amount, order.currency),
            displayText:
              started.displayText ||
              `A prompt has been sent to ${started.phone}. Please check your approvals and enter your 4-digit MoMo PIN to authorize.`,
          }
        : null,
    // Checkout no longer signs anyone in; kept for older app builds.
    token: null,
    user: null,
  });
});
