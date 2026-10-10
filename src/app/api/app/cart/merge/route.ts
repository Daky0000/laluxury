import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireBearerUser, apiOptionsResponse, withApiAuth } from "@/lib/auth/bearer";
import { randomUUID } from "node:crypto";
import { liveCartWhere, validateCartVariantQuantity } from "@/lib/cart";

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

  const rejectedItems: { variantId: string; reason: string }[] = [];

  // Merge only currently sellable quantities. Invalid cached lines stay off the account cart.
  for (const item of items) {
    const existing = cart.items.find((line) => line.variantId === item.variantId);
    const desired = (existing?.quantity ?? 0) + item.quantity;
    let variant;
    try {
      variant = await validateCartVariantQuantity(item.variantId, desired);
    } catch (error) {
      rejectedItems.push({ variantId: item.variantId, reason: (error as Error).message });
      continue;
    }

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
        quantity: desired,
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
  const formattedItems = (updatedCart?.items || []).map((line) => {
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
          minimumOrderQuantity: line.variant.product.minimumOrderQuantity,
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
    rejectedItems,
  });
});
