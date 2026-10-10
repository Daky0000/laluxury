import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireBearerUser, getOptionalBearerUser, apiOptionsResponse, withApiAuth } from "@/lib/auth/bearer";
import { availableOf } from "@/lib/inventory";
import { liveCartWhere, validateCartVariantQuantity } from "@/lib/cart";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = apiOptionsResponse;

const cartItemInclude = {
  variant: {
    include: {
      inventory: true,
      product: {
        include: {
          images: { orderBy: { position: "asc" as const }, take: 1 },
          categories: { select: { categoryId: true } },
        },
      },
    },
  },
};

const cartInclude = {
  items: {
    orderBy: { createdAt: "asc" as const },
    include: cartItemInclude,
  },
} satisfies Prisma.CartInclude;

type AppCart = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

function formatCartResponse(cart: AppCart | null) {
  if (!cart) {
    return {
      items: [],
      subtotal: 0,
      itemCount: 0,
      discountCode: null,
    };
  }

  let subtotal = 0;
  let itemCount = 0;

  const items = cart.items.map((item) => {
    const lineTotal = item.unitPrice * item.quantity;
    subtotal += lineTotal;
    itemCount += item.quantity;

    const inv = item.variant?.inventory;
    const isPreorder = Boolean(item.variant?.product?.isPreorder);
    const tracked = Boolean(inv && inv.trackInventory && !inv.allowBackorder && !isPreorder);
    const available = tracked && inv ? Math.max(0, availableOf(inv)) : null;

    return {
      id: item.id,
      variantId: item.variantId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal,
      availableStock: available,
      isPreorder,
      variant: {
        id: item.variant.id,
        productId: item.variant.productId,
        title: item.variant.title,
        sku: item.variant.sku,
        price: item.variant.price,
        compareAtPrice: item.variant.compareAtPrice,
        product: {
          id: item.variant.product.id,
          title: item.variant.product.title,
          slug: item.variant.product.slug,
          minimumOrderQuantity: item.variant.product.minimumOrderQuantity,
          isPreorder: item.variant.product.isPreorder,
          imageUrl: item.variant.product.images[0]?.url ?? null,
        },
      },
    };
  });

  return {
    cartId: cart.id,
    items,
    subtotal,
    itemCount,
    discountCode: cart.discountCode ?? null,
  };
}

// ---------------------------------------------------------------------------
// GET /api/app/cart - Fetch current authenticated customer's server cart
// ---------------------------------------------------------------------------
export const GET = withApiAuth(async () => {
  const user = await getOptionalBearerUser();
  if (!user) {
    return NextResponse.json({
      ok: true,
      authenticated: false,
      cart: formatCartResponse(null),
    });
  }

  const cart = await db.cart.findFirst({
    where: await liveCartWhere(user.id),
    include: cartInclude,
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({
    ok: true,
    authenticated: true,
    cart: formatCartResponse(cart),
  });
});

const addSchema = z.object({
  variantId: z.string().min(1, "variantId is required"),
  quantity: z.number().int().min(1).default(1),
});

// ---------------------------------------------------------------------------
// POST /api/app/cart - Add item to authenticated customer's server cart
// ---------------------------------------------------------------------------
export const POST = withApiAuth(async (request: Request) => {
  const user = await requireBearerUser();
  const json = await request.json().catch(() => null);
  const parsed = addSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid payload" },
      { status: 400 },
    );
  }

  const { variantId, quantity } = parsed.data;

  // Find or create user cart
  let cart = await db.cart.findFirst({
    where: await liveCartWhere(user.id),
    include: cartInclude,
    orderBy: { updatedAt: "desc" },
  });

  if (!cart) {
    cart = await db.cart.create({
      data: {
        userId: user.id,
        token: randomUUID(),
      },
      include: cartInclude,
    });
  }

  const existing = cart.items.find((item) => item.variantId === variantId);
  const desired = (existing?.quantity ?? 0) + quantity;
  let variant;
  try {
    variant = await validateCartVariantQuantity(variantId, desired);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }

  await db.cartItem.upsert({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
    create: {
      cartId: cart.id,
      variantId,
      quantity,
      unitPrice: variant.price,
    },
    update: {
      quantity: desired,
      unitPrice: variant.price,
    },
  });

  await db.cart.update({
    where: { id: cart.id },
    data: { lastActivityAt: new Date() },
  });

  const updatedCart = await db.cart.findUnique({
    where: { id: cart.id },
    include: cartInclude,
  });

  return NextResponse.json({
    ok: true,
    cart: formatCartResponse(updatedCart),
  });
});

const patchSchema = z.object({
  variantId: z.string().min(1, "variantId is required"),
  quantity: z.number().int(),
});

// ---------------------------------------------------------------------------
// PATCH /api/app/cart - Update item quantity in server cart
// ---------------------------------------------------------------------------
export const PATCH = withApiAuth(async (request: Request) => {
  const user = await requireBearerUser();
  const json = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid payload" },
      { status: 400 },
    );
  }

  const { variantId, quantity } = parsed.data;

  const cart = await db.cart.findFirst({
    where: await liveCartWhere(user.id),
    include: cartInclude,
    orderBy: { updatedAt: "desc" },
  });

  if (!cart) {
    return NextResponse.json({ error: "Cart not found" }, { status: 404 });
  }

  if (quantity <= 0) {
    await db.cartItem.deleteMany({
      where: { cartId: cart.id, variantId },
    });
  } else {
    try {
      await validateCartVariantQuantity(variantId, quantity);
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 });
    }

    await db.cartItem.updateMany({
      where: { cartId: cart.id, variantId },
      data: { quantity },
    });
  }

  await db.cart.update({
    where: { id: cart.id },
    data: { lastActivityAt: new Date() },
  });

  const updatedCart = await db.cart.findUnique({
    where: { id: cart.id },
    include: cartInclude,
  });

  return NextResponse.json({
    ok: true,
    cart: formatCartResponse(updatedCart),
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/app/cart - Remove item or clear cart
// ---------------------------------------------------------------------------
export const DELETE = withApiAuth(async (request: Request) => {
  const user = await requireBearerUser();
  const { searchParams } = new URL(request.url);
  const variantId = searchParams.get("variantId");

  const cart = await db.cart.findFirst({
    where: await liveCartWhere(user.id),
    include: cartInclude,
    orderBy: { updatedAt: "desc" },
  });

  if (!cart) {
    return NextResponse.json({ ok: true, cart: formatCartResponse(null) });
  }

  if (variantId) {
    await db.cartItem.deleteMany({
      where: { cartId: cart.id, variantId },
    });
  } else {
    await db.cartItem.deleteMany({
      where: { cartId: cart.id },
    });
  }

  await db.cart.update({
    where: { id: cart.id },
    data: { lastActivityAt: new Date() },
  });

  const updatedCart = await db.cart.findUnique({
    where: { id: cart.id },
    include: cartInclude,
  });

  return NextResponse.json({
    ok: true,
    cart: formatCartResponse(updatedCart),
  });
});
