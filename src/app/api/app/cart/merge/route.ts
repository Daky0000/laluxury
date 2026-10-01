import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireBearerUser, apiOptionsResponse, withApiAuth } from "@/lib/auth/bearer";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = apiOptionsResponse;

const mergeSchema = z.object({
  items: z.array(
    z.object({
      variantId: z.string().min(1),
      quantity: z.number().int().min(1),
    }),
  ),
});

const cartInclude = {
  items: {
    orderBy: { createdAt: "asc" as const },
    include: {
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
    },
  },
};

// ---------------------------------------------------------------------------
// POST /api/app/cart/merge - Merge local guest items into authenticated account
// ---------------------------------------------------------------------------
export const POST = withApiAuth(async (request: Request) => {
  const user = await requireBearerUser();
  const json = await request.json().catch(() => null);
  const parsed = mergeSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid payload" },
      { status: 400 },
    );
  }

  const { items } = parsed.data;

  // Find or create customer's server cart
  let cart = await db.cart.findFirst({
    where: { userId: user.id, convertedOrderId: null },
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

  // Merge items into database
  for (const item of items) {
    const variant = await db.variant.findUnique({
      where: { id: item.variantId },
      select: { id: true, price: true, isActive: true },
    });

    if (!variant || !variant.isActive) continue;

    await db.cartItem.upsert({
      where: {
        cartId_variantId: { cartId: cart.id, variantId: item.variantId },
      },
      create: {
        cartId: cart.id,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: variant.price,
      },
      update: {
        quantity: { increment: item.quantity },
        unitPrice: variant.price,
      },
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

  let subtotal = 0;
  let itemCount = 0;
  const formattedItems = (updatedCart?.items || []).map((line: any) => {
    const lineTotal = line.unitPrice * line.quantity;
    subtotal += lineTotal;
    itemCount += line.quantity;
    return {
      id: line.id,
      variantId: line.variantId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal,
      variant: {
        id: line.variant.id,
        productId: line.variant.productId,
        title: line.variant.title,
        sku: line.variant.sku,
        price: line.variant.price,
        product: {
          id: line.variant.product.id,
          title: line.variant.product.title,
          slug: line.variant.product.slug,
          isPreorder: line.variant.product.isPreorder,
          imageUrl: line.variant.product.images[0]?.url ?? null,
        },
      },
    };
  });

  return NextResponse.json({
    ok: true,
    cart: {
      cartId: updatedCart?.id,
      items: formattedItems,
      subtotal,
      itemCount,
    },
  });
});
